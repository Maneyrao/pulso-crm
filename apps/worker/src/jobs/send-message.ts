import type { PrismaClient } from '@pulso/db';
import type { Job } from 'bullmq';
import type { Logger } from 'pino';
import type { MessagingProvider } from '../lib/messaging-provider.js';

/**
 * Envío de un mensaje encolado.
 *
 * El job recibe sólo identificadores. El cuerpo se lee de la base en el momento
 * del envío, así el payload de la cola no queda con datos personales dando
 * vueltas en Redis.
 */

export interface ProcessDeps {
  prisma: PrismaClient;
  provider: MessagingProvider;
  logger: Logger;
  job: Job;
}

export async function processMessageJob(deps: ProcessDeps): Promise<void> {
  const { prisma, provider, logger, job } = deps;
  const messageJobId = (job.data as { resourceId?: string }).resourceId;

  if (!messageJobId) {
    logger.warn({ jobId: job.id }, 'Job de mensajería sin resourceId; se descarta');
    return;
  }

  const record = await prisma.messageJob.findUnique({ where: { id: messageJobId } });
  if (!record) {
    // El mensaje se borró entre el encolado y el procesamiento. No es un error.
    logger.debug({ messageJobId }, 'MessageJob inexistente; se descarta');
    return;
  }

  // Un job cancelado o ya enviado no se reintenta. Puede pasar si BullMQ
  // reentrega tras un reinicio del worker.
  if (record.status === 'SENT' || record.status === 'CANCELLED') {
    logger.debug({ messageJobId, status: record.status }, 'MessageJob ya resuelto');
    return;
  }

  await prisma.messageJob.update({
    where: { id: record.id },
    data: { status: 'SENDING', attempts: { increment: 1 } },
  });

  const result = await provider.send({
    to: record.destination,
    body: record.body,
    idempotencyKey: record.dedupeKey,
  });

  if (result.status === 'sent') {
    await prisma.messageJob.update({
      where: { id: record.id },
      data: { status: 'SENT', sentAt: new Date(), externalId: result.externalId, lastError: null },
    });
    return;
  }

  if (result.status === 'rejected') {
    // No reintentable: número inválido, plantilla rechazada, usuario bloqueó.
    // Reintentar sólo gastaría cuota y ensuciaría el historial.
    await prisma.messageJob.update({
      where: { id: record.id },
      data: { status: 'FAILED', lastError: result.reason.slice(0, 500) },
    });
    logger.info({ messageJobId, reason: result.reason }, 'Mensaje rechazado por el proveedor');
    return;
  }

  await prisma.messageJob.update({
    where: { id: record.id },
    data: { status: 'QUEUED', lastError: result.reason.slice(0, 500) },
  });

  // Se relanza para que BullMQ aplique su backoff. Al agotar los intentos, el
  // job queda en la cola de fallidos y visible en el panel.
  throw new Error(result.reason);
}
