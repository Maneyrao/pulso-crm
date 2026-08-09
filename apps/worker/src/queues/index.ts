import { Queue, type JobsOptions } from 'bullmq';
import type Redis from 'ioredis';

/**
 * Catálogo de colas (ADR-012).
 *
 * Un nombre por dominio, no uno por tipo de job: así se puede pausar la
 * mensajería sin frenar los vencimientos, que es la operación que uno realmente
 * necesita en un incidente.
 */
export const QUEUE_NAMES = {
  outbox: 'pulso.outbox',
  messaging: 'pulso.messaging',
  maintenance: 'pulso.maintenance',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

/**
 * Política de reintentos por defecto.
 *
 * Backoff exponencial desde 5 s: un proveedor caído se recupera solo sin que le
 * peguemos 5 veces en el primer segundo. Tras 5 intentos el job queda en
 * estado fallido y visible, no se pierde en silencio.
 */
export const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 5,
  backoff: { type: 'exponential', delay: 5_000 },
  // Se conservan los últimos completados para poder auditar; los fallidos, más,
  // porque son los que alguien va a ir a mirar.
  removeOnComplete: { age: 24 * 3600, count: 1_000 },
  removeOnFail: { age: 7 * 24 * 3600 },
};

export function createQueue(name: QueueName, connection: Redis): Queue {
  return new Queue(name, { connection, defaultJobOptions: DEFAULT_JOB_OPTIONS });
}
