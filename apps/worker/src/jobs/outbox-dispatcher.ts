import type { PrismaClient } from '@pulso/db';
import type { Queue } from 'bullmq';
import type { Logger } from 'pino';
import { QUEUE_NAMES } from '../queues/index.js';

/**
 * Despachador del outbox (ADR-016).
 *
 * El evento se escribe en la misma transacción que el cambio de negocio. Este
 * proceso lo lee después y lo publica en la cola que corresponda.
 *
 * El patrón existe porque encolar dentro de la transacción no sirve: si la
 * transacción hace rollback, el job ya salió; y si se encola después del
 * commit, un crash entremedio pierde el evento. Con outbox, el evento vive o
 * muere con el dato.
 */

const BATCH_SIZE = 100;

/** Cuánto espera antes de reintentar un evento que falló. */
const RETRY_BACKOFF_MS = [5_000, 30_000, 120_000, 600_000, 3_600_000];

const MAX_ATTEMPTS = RETRY_BACKOFF_MS.length;

export interface DispatchDeps {
  prisma: PrismaClient;
  queues: Record<string, Queue>;
  logger: Logger;
}

/** A qué cola va cada tipo de evento. */
function queueFor(eventType: string): string | null {
  if (eventType.startsWith('message.')) return QUEUE_NAMES.messaging;
  if (eventType.startsWith('payment.') || eventType.startsWith('membership.')) {
    return QUEUE_NAMES.messaging;
  }
  return null;
}

export async function dispatchOutboxBatch(deps: DispatchDeps): Promise<number> {
  const { prisma, queues, logger } = deps;

  // `FOR UPDATE SKIP LOCKED` permite correr varias instancias del worker sin
  // que se pisen: cada una toma un lote distinto.
  const events = await prisma.$queryRaw<
    {
      id: string;
      gymId: string;
      eventType: string;
      resourceType: string;
      resourceId: string | null;
      payload: unknown;
      attempts: number;
    }[]
  >`
    SELECT id, "gymId", "eventType", "resourceType", "resourceId", payload, attempts
    FROM outbox_events
    WHERE status = 'PENDING' AND "availableAt" <= now()
    ORDER BY "createdAt"
    LIMIT ${BATCH_SIZE}
    FOR UPDATE SKIP LOCKED
  `;

  if (events.length === 0) return 0;

  let dispatched = 0;

  for (const event of events) {
    const target = queueFor(event.eventType);

    if (!target) {
      // Un evento sin destino no es un error: puede ser sólo para auditoría o
      // para un consumidor que todavía no existe. Se marca despachado y se
      // registra, para que no quede reintentándose para siempre.
      await prisma.outboxEvent.update({
        where: { id: event.id },
        data: { status: 'DISPATCHED', dispatchedAt: new Date() },
      });
      logger.debug({ eventType: event.eventType }, 'Evento de outbox sin cola destino');
      continue;
    }

    const queue = queues[target];
    if (!queue) {
      logger.error({ target }, 'Cola no registrada');
      continue;
    }

    try {
      // El jobId determinístico es lo que impide encolar dos veces el mismo
      // evento si el worker se reinicia justo después de publicar y antes de
      // marcar el registro.
      await queue.add(
        event.eventType,
        { gymId: event.gymId, resourceId: event.resourceId, payload: event.payload },
        { jobId: `outbox:${event.id}` },
      );

      await prisma.outboxEvent.update({
        where: { id: event.id },
        data: { status: 'DISPATCHED', dispatchedAt: new Date() },
      });
      dispatched += 1;
    } catch (error) {
      const attempts = event.attempts + 1;
      const giveUp = attempts >= MAX_ATTEMPTS;
      const delay = RETRY_BACKOFF_MS[Math.min(event.attempts, MAX_ATTEMPTS - 1)]!;

      await prisma.outboxEvent.update({
        where: { id: event.id },
        data: {
          attempts,
          status: giveUp ? 'FAILED' : 'PENDING',
          availableAt: new Date(Date.now() + delay),
          lastError: error instanceof Error ? error.message.slice(0, 500) : 'error desconocido',
        },
      });

      logger.warn(
        { eventId: event.id, attempts, giveUp },
        giveUp ? 'Evento de outbox descartado tras agotar reintentos' : 'Fallo al despachar evento',
      );
    }
  }

  return dispatched;
}
