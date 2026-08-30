/**
 * Mensajería (API_CONTRACTS.md §11).
 *
 * `MessageTemplateKind` (`PAYMENT_RECEIPT|DEBT_REMINDER|MEMBERSHIP_EXPIRING|
 * WELCOME|BROADCAST`) y `MessageJobStatus`
 * (`QUEUED|SENDING|SENT|FAILED|CANCELLED`) no están detallados en
 * DATA_MODEL.md; se toman tal cual de schema.prisma.
 *
 * El envío nunca ocurre en el request: crea un `MessageJob` con
 * `dedupeKey` y se encola (regla explícita del documento).
 */
import { z } from 'zod';
import {
  isoInstantSchema,
  offsetPaginatedResponseSchema,
  offsetPaginationQuerySchema,
  uuidSchema,
} from './common.js';
import { memberMembershipFilterSchema, memberStatusSchema } from './members.js';

export const MESSAGE_CHANNELS = ['WHATSAPP', 'EMAIL'] as const;
export const messageChannelSchema = z.enum(MESSAGE_CHANNELS);
export type MessageChannel = z.infer<typeof messageChannelSchema>;

export const MESSAGE_TEMPLATE_KINDS = [
  'PAYMENT_RECEIPT',
  'DEBT_REMINDER',
  'MEMBERSHIP_EXPIRING',
  'WELCOME',
  'BROADCAST',
] as const;
export const messageTemplateKindSchema = z.enum(MESSAGE_TEMPLATE_KINDS);
export type MessageTemplateKind = z.infer<typeof messageTemplateKindSchema>;

// ─────────────────────────────────────────────────────────────────────────
// GET/PUT /messaging/config — message:config
// ─────────────────────────────────────────────────────────────────────────

/**
 * El documento no detalla los campos de `/messaging/config`. Se modela el
 * mínimo razonable (encendido por canal + remitente); los campos propios
 * del proveedor de WhatsApp/email quedan en `providerSettings`, abierto
 * adrede porque varían por integración y no están definidos todavía.
 */
export const messagingConfigSchema = z.object({
  whatsappEnabled: z.boolean(),
  emailEnabled: z.boolean(),
  defaultFromName: z.string().nullable(),
  providerSettings: z.record(z.unknown()),
});
export type MessagingConfig = z.infer<typeof messagingConfigSchema>;

export const updateMessagingConfigRequestSchema = messagingConfigSchema.partial();
export type UpdateMessagingConfigRequest = z.infer<typeof updateMessagingConfigRequestSchema>;

// ─────────────────────────────────────────────────────────────────────────
// GET/PUT /messaging/templates — message:config
// ─────────────────────────────────────────────────────────────────────────

export const messageTemplateSchema = z.object({
  id: uuidSchema,
  gymId: uuidSchema,
  kind: messageTemplateKindSchema,
  channel: messageChannelSchema,
  name: z.string(),
  body: z.string(),
  isActive: z.boolean(),
  createdAt: isoInstantSchema,
  updatedAt: isoInstantSchema,
});
export type MessageTemplate = z.infer<typeof messageTemplateSchema>;

export const listMessageTemplatesResponseSchema = z.object({
  data: z.array(messageTemplateSchema),
});
export type ListMessageTemplatesResponse = z.infer<typeof listMessageTemplatesResponseSchema>;

export const updateMessageTemplateRequestSchema = z.object({
  kind: messageTemplateKindSchema,
  channel: messageChannelSchema,
  name: z.string().min(1),
  body: z.string().min(1),
  isActive: z.boolean().default(true),
});
export type UpdateMessageTemplateRequest = z.infer<typeof updateMessageTemplateRequestSchema>;

export const updateMessageTemplateResponseSchema = messageTemplateSchema;

// ─────────────────────────────────────────────────────────────────────────
// POST /messaging/test — message:config, Idem
// ─────────────────────────────────────────────────────────────────────────

export const testMessageRequestSchema = z.object({
  channel: messageChannelSchema,
  destination: z.string().min(1),
  templateId: uuidSchema.optional(),
  sampleData: z.record(z.unknown()).default({}),
});
export type TestMessageRequest = z.infer<typeof testMessageRequestSchema>;

// ─────────────────────────────────────────────────────────────────────────
// GET /messaging/jobs — message:send
// ─────────────────────────────────────────────────────────────────────────

export const MESSAGE_JOB_STATUSES = ['QUEUED', 'SENDING', 'SENT', 'FAILED', 'CANCELLED'] as const;
export const messageJobStatusSchema = z.enum(MESSAGE_JOB_STATUSES);
export type MessageJobStatus = z.infer<typeof messageJobStatusSchema>;

export const messageJobSchema = z.object({
  id: uuidSchema,
  gymId: uuidSchema,
  memberId: uuidSchema.nullable(),
  templateId: uuidSchema.nullable(),
  channel: messageChannelSchema,
  /** E.164 al momento del envío; si el socio cambia el número, la historia queda. */
  destination: z.string(),
  status: messageJobStatusSchema,
  attempts: z.number().int(),
  lastError: z.string().nullable(),
  /** Idempotencia de negocio, p.ej. "receipt:{cashMovementId}". */
  dedupeKey: z.string(),
  externalId: z.string().nullable(),
  sentAt: isoInstantSchema.nullable(),
  createdAt: isoInstantSchema,
});
export type MessageJob = z.infer<typeof messageJobSchema>;

export const listMessageJobsQuerySchema = offsetPaginationQuerySchema.extend({
  status: messageJobStatusSchema.optional(),
  channel: messageChannelSchema.optional(),
  memberId: uuidSchema.optional(),
});
export type ListMessageJobsQuery = z.infer<typeof listMessageJobsQuerySchema>;

export const listMessageJobsResponseSchema = offsetPaginatedResponseSchema(messageJobSchema);
export type ListMessageJobsResponse = z.infer<typeof listMessageJobsResponseSchema>;

/** `POST /messaging/jobs/:id/retry` — message:send, Idem. Sólo tiene sentido sobre `FAILED`. */
export const retryMessageJobResponseSchema = z.object({ job: messageJobSchema });
export type RetryMessageJobResponse = z.infer<typeof retryMessageJobResponseSchema>;

// ─────────────────────────────────────────────────────────────────────────
// POST /messaging/broadcast — message:broadcast, Idem
// ─────────────────────────────────────────────────────────────────────────

/** Subconjunto de los filtros de `GET /members`, reusados para segmentar el broadcast. */
export const broadcastTargetFilterSchema = z.object({
  branchId: uuidSchema.optional(),
  status: memberStatusSchema.optional(),
  membershipStatus: memberMembershipFilterSchema.optional(),
  hasDebt: z.boolean().optional(),
});
export type BroadcastTargetFilter = z.infer<typeof broadcastTargetFilterSchema>;

/**
 * Preview obligatorio: sin `confirm: true` sólo devuelve
 * `estimatedRecipients`. Con `confirm: true` ejecuta el envío.
 */
export const broadcastRequestSchema = z
  .object({
    templateId: uuidSchema.optional(),
    body: z.string().optional(),
    targetFilter: broadcastTargetFilterSchema,
    confirm: z.boolean().default(false),
  })
  .refine((v) => Boolean(v.templateId) || Boolean(v.body), {
    message: 'Se requiere templateId o body',
    path: ['body'],
  });
export type BroadcastRequest = z.infer<typeof broadcastRequestSchema>;

export const broadcastResponseSchema = z.discriminatedUnion('confirmed', [
  z.object({ confirmed: z.literal(false), estimatedRecipients: z.number().int() }),
  z.object({ confirmed: z.literal(true), jobsCreated: z.number().int() }),
]);
export type BroadcastResponse = z.infer<typeof broadcastResponseSchema>;
