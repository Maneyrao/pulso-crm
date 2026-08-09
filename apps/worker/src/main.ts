import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { Worker, type Queue } from 'bullmq';
import Redis from 'ioredis';
import pino from 'pino';
import { parseWorkerEnv } from '@pulso/config';
import { PrismaClient } from '@pulso/db';
import { QUEUE_NAMES, createQueue } from './queues/index.js';
import { dispatchOutboxBatch } from './jobs/outbox-dispatcher.js';
import { expireMemberships } from './jobs/membership-expiration.js';
import { createMessagingProvider } from './lib/messaging-provider.js';
import { processMessageJob } from './jobs/send-message.js';

loadEnv({ path: path.resolve(process.cwd(), '../../.env'), quiet: true });

const env = parseWorkerEnv();

const logger = pino({
  level: env.LOG_LEVEL,
  ...(env.NODE_ENV === 'development'
    ? { transport: { target: 'pino-pretty', options: { colorize: true } } }
    : {}),
}).child({ service: 'worker' });

/** Cada cuánto se revisa el outbox. */
const OUTBOX_POLL_MS = 2_000;
/** Cada cuánto corre el barrido de vencimientos. */
const EXPIRATION_INTERVAL_MS = 60 * 60 * 1000;

async function main(): Promise<void> {
  const prisma = new PrismaClient({ datasourceUrl: env.DATABASE_URL });
  const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  connection.on('error', (e) => logger.error({ err: e }, 'Error de Redis'));

  const queues: Record<string, Queue> = {
    [QUEUE_NAMES.outbox]: createQueue(QUEUE_NAMES.outbox, connection),
    [QUEUE_NAMES.messaging]: createQueue(QUEUE_NAMES.messaging, connection),
    [QUEUE_NAMES.maintenance]: createQueue(QUEUE_NAMES.maintenance, connection),
  };

  const messaging = createMessagingProvider(env.WHATSAPP_PROVIDER, logger);

  const messagingWorker = new Worker(
    QUEUE_NAMES.messaging,
    async (job) => processMessageJob({ prisma, provider: messaging, logger, job }),
    { connection, concurrency: 5 },
  );

  messagingWorker.on('failed', (job, err) => {
    logger.warn({ jobId: job?.id, attempts: job?.attemptsMade, err: err.message }, 'Job fallido');
  });

  // El outbox se consulta por polling y no por evento: si el proceso estuvo
  // caído, al volver encuentra todo lo pendiente sin que nadie tenga que
  // re-publicar nada.
  const outboxTimer = setInterval(() => {
    void dispatchOutboxBatch({ prisma, queues, logger }).catch((e: unknown) => {
      logger.error({ err: e }, 'Fallo el despacho del outbox');
    });
  }, OUTBOX_POLL_MS);

  const expirationTimer = setInterval(() => {
    void expireMemberships({ prisma, logger })
      .then((r) => {
        if (r.membershipsExpired > 0) logger.info(r, 'Barrido de vencimientos');
      })
      .catch((e: unknown) => logger.error({ err: e }, 'Fallo el barrido de vencimientos'));
  }, EXPIRATION_INTERVAL_MS);

  // Una corrida al arrancar: si el worker estuvo caído toda la noche, no hay
  // que esperar una hora para que las membresías queden al día.
  void expireMemberships({ prisma, logger }).catch(() => undefined);

  logger.info({ env: env.NODE_ENV, provider: env.WHATSAPP_PROVIDER }, 'Worker iniciado');

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'Cerrando worker');
    clearInterval(outboxTimer);
    clearInterval(expirationTimer);
    // `close()` espera a que terminen los jobs en curso: cortar un envío a
    // mitad dejaría un mensaje en estado ambiguo.
    await messagingWorker.close();
    await Promise.all(Object.values(queues).map((q) => q.close()));
    await prisma.$disconnect();
    await connection.quit();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

void main().catch((e: unknown) => {
  logger.fatal({ err: e }, 'El worker no pudo arrancar');
  process.exit(1);
});
