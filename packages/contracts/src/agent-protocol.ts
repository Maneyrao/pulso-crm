/**
 * Protocolo WS local navegador ⇄ agente biométrico, v1.0
 * (docs/biometrics/WEBSOCKET_PROTOCOL.md).
 *
 * Espejo TypeScript de `apps/local-agent/src/Pulso.Agent.Protocol` (§11 del
 * protocolo): las mismas fixtures de `docs/biometrics/protocol-fixtures/` se
 * validan acá con Zod y allá con System.Text.Json. Si un cambio rompe un solo
 * lado, la suite del otro lado lo detecta.
 *
 * Semántica de validación calcada de MessageCodec.TryParse (C#):
 * - sobre con v/id/type/ts obligatorios (v/id/type no-blancos, ts instante ISO);
 * - versión mayor distinta de "1" → PROTOCOL_VERSION_UNSUPPORTED (cerrar);
 * - type fuera del catálogo → UNKNOWN_MESSAGE_TYPE (responder error, NO cerrar);
 * - tipos sin payload (status.get, ping, pong) aceptan payload ausente o cualquiera;
 * - el resto exige payload con el shape de su tipo; claves extra se ignoran
 *   (mismo comportamiento que System.Text.Json).
 */
import { z } from 'zod';
import { isoInstantSchema } from './common.js';

// ─────────────────────────────────────────────────────────────────────────
// Constantes del protocolo (ProtocolConstants.cs)
// ─────────────────────────────────────────────────────────────────────────

export const AGENT_PROTOCOL_VERSION = '1.0';
export const AGENT_PROTOCOL_MAJOR = '1';
/** Tamaño máximo de un mensaje completo (sobre + payload), en bytes (§5). */
export const AGENT_MAX_MESSAGE_SIZE_BYTES = 256 * 1024;
/** URL del agente local; el puerto es configurable pero éste es el default. */
export const AGENT_DEFAULT_WS_URL = 'wss://127.0.0.1:21987/agent/v1';
export const AGENT_PING_INTERVAL_MS = 15_000;
export const AGENT_HELLO_TIMEOUT_MS = 5_000;
export const AGENT_DEVICE_TOKEN_TTL_MS = 120_000;

// ─────────────────────────────────────────────────────────────────────────
// Catálogo de tipos de mensaje (MessageTypes.cs / §6)
// ─────────────────────────────────────────────────────────────────────────

export const AGENT_CLIENT_TO_AGENT_TYPES = [
  'hello',
  'status.get',
  'enroll.start',
  'identify.start',
  'identify.stop',
  'operation.cancel',
  'ping',
] as const;

export const AGENT_TO_CLIENT_TYPES = [
  'hello.ack',
  'status',
  'device.connected',
  'device.disconnected',
  'enroll.progress',
  'enroll.completed',
  'enroll.failed',
  'identify.captured',
  'identify.sent',
  'identify.failed',
  'operation.cancelled',
  'session.replaced',
  'error',
  'pong',
] as const;

export const AGENT_MESSAGE_TYPES = [
  ...AGENT_CLIENT_TO_AGENT_TYPES,
  ...AGENT_TO_CLIENT_TYPES,
] as const;
export type AgentMessageType = (typeof AGENT_MESSAGE_TYPES)[number];

/** Tipos permitidos sobre ws:// sin TLS (§2); el resto exige TLS_REQUIRED. */
export const AGENT_TYPES_ALLOWED_WITHOUT_TLS: readonly AgentMessageType[] = [
  'hello',
  'hello.ack',
  'status.get',
  'status',
  'ping',
  'pong',
  'error',
];

// ─────────────────────────────────────────────────────────────────────────
// Códigos de error (ErrorCodes.cs / §7)
// ─────────────────────────────────────────────────────────────────────────

export const AGENT_ERROR_CODES = [
  'PROTOCOL_VERSION_UNSUPPORTED',
  'UNKNOWN_MESSAGE_TYPE',
  'HELLO_REQUIRED',
  'TLS_REQUIRED',
  'AGENT_NOT_CONFIGURED',
  'AGENT_PENDING_APPROVAL',
  'AGENT_DISABLED',
  'AGENT_BUSY',
  'NO_DEVICE',
  'DEVICE_ERROR',
  'DEVICE_DISCONNECTED',
  'QUALITY_TOO_LOW',
  'TIMEOUT',
  'INVALID_TOKEN',
  'BACKEND_UNREACHABLE',
  'BACKEND_REJECTED',
  'INTERNAL_ERROR',
  // Internos de validación (no viajan como "type": "error" del agente, los
  // produce el parser local ante mensajes malformados).
  'MALFORMED_ENVELOPE',
  'INVALID_PAYLOAD',
] as const;
export type AgentErrorCode = (typeof AGENT_ERROR_CODES)[number];

// ─────────────────────────────────────────────────────────────────────────
// Payloads (Payloads/*.cs / §6.1-§6.2)
// ─────────────────────────────────────────────────────────────────────────

/** Ids del protocolo: strings opacos no vacíos. `deviceId` puede no ser UUID (ej. "FAKE-0001"). */
const protocolIdSchema = z.string().min(1);

export const agentDeviceInfoSchema = z.object({
  deviceId: protocolIdSchema,
  kind: z.string(),
  vendor: z.string(),
  model: z.string(),
  serialNumber: z.string().nullish(),
  status: z.string(),
});
export type AgentDeviceInfo = z.infer<typeof agentDeviceInfoSchema>;

// Cliente -> Agente

export const helloPayloadSchema = z.object({
  clientVersion: z.string(),
  gymId: z.string().nullish(),
  branchId: z.string().nullish(),
  userAgent: z.string().nullish(),
});
export type HelloPayload = z.infer<typeof helloPayloadSchema>;

export const enrollStartPayloadSchema = z.object({
  opId: protocolIdSchema,
  enrollmentId: protocolIdSchema,
  deviceToken: z.string().min(1),
  deviceId: protocolIdSchema,
  samplesRequired: z.number().int(),
  minQuality: z.number().int(),
  fingerPosition: z.string().nullish(),
  timeoutMs: z.number().int().nullish(),
});
export type EnrollStartPayload = z.infer<typeof enrollStartPayloadSchema>;

export const identifyStartPayloadSchema = z.object({
  opId: protocolIdSchema,
  deviceToken: z.string().min(1),
  deviceId: protocolIdSchema,
  branchId: protocolIdSchema,
  minQuality: z.number().int().nullish(),
  continuous: z.boolean().nullish(),
  idleTimeoutMs: z.number().int().nullish(),
});
export type IdentifyStartPayload = z.infer<typeof identifyStartPayloadSchema>;

export const identifyStopPayloadSchema = z.object({
  opId: protocolIdSchema,
});
export type IdentifyStopPayload = z.infer<typeof identifyStopPayloadSchema>;

export const operationCancelPayloadSchema = z.object({
  opId: protocolIdSchema,
  reason: z.string().nullish(),
});
export type OperationCancelPayload = z.infer<typeof operationCancelPayloadSchema>;

// Agente -> Cliente

/** hello.ack y status comparten shape (§6.2). */
export const agentStatusPayloadSchema = z.object({
  protocolVersion: z.string(),
  agentVersion: z.string(),
  agentState: z.string(),
  tls: z.boolean(),
  devices: z.array(agentDeviceInfoSchema),
  reason: z.string().nullish(),
});
export type AgentStatusPayload = z.infer<typeof agentStatusPayloadSchema>;

export const deviceConnectedPayloadSchema = z.object({
  deviceId: protocolIdSchema,
  kind: z.string().nullish(),
  vendor: z.string().nullish(),
  model: z.string().nullish(),
  serialNumber: z.string().nullish(),
  status: z.string(),
});
export type DeviceConnectedPayload = z.infer<typeof deviceConnectedPayloadSchema>;

export const deviceDisconnectedPayloadSchema = z.object({
  deviceId: protocolIdSchema,
  reason: z.string(),
});
export type DeviceDisconnectedPayload = z.infer<typeof deviceDisconnectedPayloadSchema>;

export const enrollProgressPayloadSchema = z.object({
  opId: protocolIdSchema,
  captured: z.number().int(),
  required: z.number().int(),
  lastQuality: z.number().int().nullish(),
  prompt: z.string().nullish(),
  warning: z.string().nullish(),
});
export type EnrollProgressPayload = z.infer<typeof enrollProgressPayloadSchema>;

export const enrollCompletedPayloadSchema = z.object({
  opId: protocolIdSchema,
  enrollmentId: protocolIdSchema,
  finalQuality: z.number().int(),
});
export type EnrollCompletedPayload = z.infer<typeof enrollCompletedPayloadSchema>;

export const enrollFailedPayloadSchema = z.object({
  opId: protocolIdSchema,
  code: z.string(),
  detail: z.string().nullish(),
});
export type EnrollFailedPayload = z.infer<typeof enrollFailedPayloadSchema>;

export const identifyCapturedPayloadSchema = z.object({
  opId: protocolIdSchema,
  quality: z.number().int(),
});
export type IdentifyCapturedPayload = z.infer<typeof identifyCapturedPayloadSchema>;

export const identifySentPayloadSchema = z.object({
  opId: protocolIdSchema,
});
export type IdentifySentPayload = z.infer<typeof identifySentPayloadSchema>;

export const identifyFailedPayloadSchema = z.object({
  opId: protocolIdSchema,
  code: z.string(),
});
export type IdentifyFailedPayload = z.infer<typeof identifyFailedPayloadSchema>;

export const operationCancelledPayloadSchema = z.object({
  opId: protocolIdSchema,
  reason: z.string().nullish(),
});
export type OperationCancelledPayload = z.infer<typeof operationCancelledPayloadSchema>;

export const sessionReplacedPayloadSchema = z.object({
  reason: z.string(),
});
export type SessionReplacedPayload = z.infer<typeof sessionReplacedPayloadSchema>;

export const agentErrorPayloadSchema = z.object({
  code: z.string(),
  detail: z.string().nullish(),
  opId: z.string().nullish(),
});
export type AgentErrorPayload = z.infer<typeof agentErrorPayloadSchema>;

/**
 * Schema de payload por tipo. Los tipos ausentes (status.get, ping, pong) no
 * llevan payload: se acepta ausente o cualquiera, igual que el codec C#.
 */
export const AGENT_PAYLOAD_SCHEMAS: Partial<Record<AgentMessageType, z.ZodTypeAny>> = {
  hello: helloPayloadSchema,
  'enroll.start': enrollStartPayloadSchema,
  'identify.start': identifyStartPayloadSchema,
  'identify.stop': identifyStopPayloadSchema,
  'operation.cancel': operationCancelPayloadSchema,
  'hello.ack': agentStatusPayloadSchema,
  status: agentStatusPayloadSchema,
  'device.connected': deviceConnectedPayloadSchema,
  'device.disconnected': deviceDisconnectedPayloadSchema,
  'enroll.progress': enrollProgressPayloadSchema,
  'enroll.completed': enrollCompletedPayloadSchema,
  'enroll.failed': enrollFailedPayloadSchema,
  'identify.captured': identifyCapturedPayloadSchema,
  'identify.sent': identifySentPayloadSchema,
  'identify.failed': identifyFailedPayloadSchema,
  'operation.cancelled': operationCancelledPayloadSchema,
  'session.replaced': sessionReplacedPayloadSchema,
  error: agentErrorPayloadSchema,
};

// ─────────────────────────────────────────────────────────────────────────
// Sobre y parser (MessageEnvelope.cs + MessageCodec.TryParse)
// ─────────────────────────────────────────────────────────────────────────

const nonBlankSchema = z
  .string()
  .refine((s) => s.trim().length > 0, { message: 'No puede estar en blanco' });

/** Sobre crudo (§5): la validación de versión/tipo/payload la hace parseAgentMessage. */
export const agentEnvelopeSchema = z.object({
  v: nonBlankSchema,
  id: nonBlankSchema,
  type: nonBlankSchema,
  ts: isoInstantSchema,
  correlationId: z.string().nullish(),
  payload: z.unknown().optional(),
});
export type AgentEnvelope = z.infer<typeof agentEnvelopeSchema>;

export interface AgentParsedMessage {
  envelope: AgentEnvelope;
  type: AgentMessageType;
  /** Payload ya validado por el schema del tipo; null para tipos sin payload. */
  payload: unknown;
}

export type AgentParseErrorCode =
  | 'MALFORMED_ENVELOPE'
  | 'PROTOCOL_VERSION_UNSUPPORTED'
  | 'UNKNOWN_MESSAGE_TYPE'
  | 'INVALID_PAYLOAD'
  | 'INTERNAL_ERROR';

export type AgentParseResult =
  | { success: true; message: AgentParsedMessage }
  | {
      success: false;
      code: AgentParseErrorCode;
      detail: string;
      /** true si el receptor debería cerrar la conexión (versión incompatible, tamaño). */
      shouldClose: boolean;
    };

function fail(code: AgentParseErrorCode, detail: string, shouldClose = false): AgentParseResult {
  return { success: false, code, detail, shouldClose };
}

const majorOf = (version: string): string => {
  const dot = version.indexOf('.');
  return dot < 0 ? version : version.slice(0, dot);
};

/** Valida un mensaje ya deserializado de JSON (mirror de MessageCodec.TryParse). */
export function parseAgentMessage(input: unknown): AgentParseResult {
  const envelopeResult = agentEnvelopeSchema.safeParse(input);
  if (!envelopeResult.success) {
    return fail('MALFORMED_ENVELOPE', envelopeResult.error.issues[0]?.message ?? 'Sobre inválido.');
  }
  const envelope = envelopeResult.data;

  if (majorOf(envelope.v) !== AGENT_PROTOCOL_MAJOR) {
    return fail(
      'PROTOCOL_VERSION_UNSUPPORTED',
      `Versión mayor '${envelope.v}' incompatible con '${AGENT_PROTOCOL_MAJOR}.x'.`,
      true,
    );
  }

  if (!(AGENT_MESSAGE_TYPES as readonly string[]).includes(envelope.type)) {
    // UNKNOWN_MESSAGE_TYPE: responder con error, NO cerrar la conexión (§5).
    return fail('UNKNOWN_MESSAGE_TYPE', `Tipo de mensaje desconocido: '${envelope.type}'.`);
  }
  const type = envelope.type as AgentMessageType;

  const payloadSchema = AGENT_PAYLOAD_SCHEMAS[type];
  if (!payloadSchema) {
    // Tipos sin payload (status.get, ping, pong): válidos sin más validación.
    return { success: true, message: { envelope, type, payload: null } };
  }

  if (envelope.payload === undefined || envelope.payload === null) {
    return fail('INVALID_PAYLOAD', `El tipo '${type}' requiere payload.`);
  }

  const payloadResult = payloadSchema.safeParse(envelope.payload);
  if (!payloadResult.success) {
    return fail(
      'INVALID_PAYLOAD',
      payloadResult.error.issues[0]?.message ?? `Payload inválido para '${type}'.`,
    );
  }

  return { success: true, message: { envelope, type, payload: payloadResult.data } };
}

/** Variante sobre el string crudo del WS: chequea tamaño y JSON antes de validar. */
export function parseAgentMessageJson(raw: string): AgentParseResult {
  const sizeBytes = new TextEncoder().encode(raw).length;
  if (sizeBytes > AGENT_MAX_MESSAGE_SIZE_BYTES) {
    return fail(
      'INTERNAL_ERROR',
      `Mensaje de ${sizeBytes} bytes excede el máximo de ${AGENT_MAX_MESSAGE_SIZE_BYTES}.`,
      true,
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    return fail('MALFORMED_ENVELOPE', error instanceof Error ? error.message : 'JSON inválido.');
  }
  return parseAgentMessage(parsed);
}
