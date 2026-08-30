import { z } from 'zod';

/**
 * Validación de configuración por proceso.
 *
 * Regla: un proceso que arranca sin una variable obligatoria FALLA al inicio,
 * diciendo cuál falta. Nunca arranca a medias con un undefined que explota
 * tres horas después en producción.
 */

const nodeEnv = z.enum(['development', 'test', 'production']).default('development');

const port = z.coerce.number().int().positive().max(65535);

/** Lista separada por comas, sin vacíos. */
const csv = z
  .string()
  .transform((v) =>
    v
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  )
  .pipe(z.array(z.string().min(1)));

const postgresUrl = z
  .string()
  .min(1)
  .refine((v) => v.startsWith('postgres://') || v.startsWith('postgresql://'), {
    message: 'debe ser una URL postgres:// o postgresql://',
  });

/** En producción exige un secreto largo de verdad; en desarrollo alcanza con algo. */
const secret = (minProd = 32) =>
  z
    .string()
    .min(1)
    .superRefine((v, ctx) => {
      if (process.env['NODE_ENV'] === 'production' && v.length < minProd) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `en producción debe tener al menos ${minProd} caracteres`,
        });
      }
      if (process.env['NODE_ENV'] === 'production' && /dev-only|change-me|example/i.test(v)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'parece un valor de ejemplo; en producción tiene que ser un secreto real',
        });
      }
    });

export const apiEnvSchema = z.object({
  NODE_ENV: nodeEnv,
  PORT: port.default(3001),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  DATABASE_URL: postgresUrl,
  DIRECT_DATABASE_URL: postgresUrl.optional(),

  REDIS_URL: z.string().min(1).startsWith('redis'),

  JWT_SECRET: secret(32),
  ACCESS_TOKEN_TTL: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL: z.coerce.number().int().positive().default(2_592_000),
  COOKIE_DOMAIN: z.string().min(1).default('localhost'),
  CORS_ORIGINS: csv,

  MASTER_KEK: z.string().min(1).optional(),

  // Biometría (Etapas 7-8, BIOMETRIC_SECURITY.md §5/§8).
  /** Umbral 1:N. Se calibra con datos de la POC, no por intuición. */
  BIOMETRIC_MATCH_THRESHOLD: z.coerce.number().int().min(0).max(100).default(40),
  /** Dos candidatos sobre el umbral a menos de este margen → no-match. */
  BIOMETRIC_MATCH_AMBIGUITY_MARGIN: z.coerce.number().int().min(0).max(100).default(5),
  /** TTL en segundos de los deviceTokens de un solo uso. */
  BIOMETRIC_DEVICE_TOKEN_TTL: z.coerce.number().int().positive().default(120),
  BIOMETRIC_ENROLL_SAMPLES: z.coerce.number().int().min(1).max(10).default(4),
  /**
   * Muestras por dedo en el enrolamiento HID desde el navegador. Con 2 se
   * verifica que ambas capturas se reconozcan entre sí (consistencia) y se
   * guarda la de mejor calidad; con 1 se acepta la única captura.
   */
  BIOMETRIC_HID_ENROLL_SAMPLES: z.coerce.number().int().min(1).max(3).default(2),
  /** Score SourceAFIS mínimo entre muestras del mismo enrolamiento. */
  BIOMETRIC_HID_ENROLL_CONSISTENCY: z.coerce.number().int().min(0).max(100).default(30),
  BIOMETRIC_MIN_QUALITY: z.coerce.number().int().min(0).max(100).default(60),
  /** Ventana en segundos para considerar online a un agente por su heartbeat. */
  BIOMETRIC_AGENT_ONLINE_WINDOW: z.coerce.number().int().positive().default(90),
  /** Servicio SourceAFIS interno. Ambos valores deben configurarse juntos. */
  BIOMETRIC_MATCHER_URL: z.string().url().optional(),
  BIOMETRIC_MATCHER_TOKEN: secret(32).optional(),

  RATE_LIMIT_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),

  S3_ENDPOINT: z.string().url().optional(),
  S3_BUCKET: z.string().min(1).optional(),
  S3_ACCESS_KEY_ID: z.string().min(1).optional(),
  S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  S3_REGION: z.string().min(1).default('auto'),

  SENTRY_DSN: z.string().optional(),
});

export const workerEnvSchema = z.object({
  NODE_ENV: nodeEnv,
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: postgresUrl,
  REDIS_URL: z.string().min(1).startsWith('redis'),
  MASTER_KEK: z.string().min(1).optional(),
  WHATSAPP_PROVIDER: z.enum(['mock', 'meta_cloud']).default('mock'),
  SENTRY_DSN: z.string().optional(),
});

export type ApiEnv = z.infer<typeof apiEnvSchema>;
export type WorkerEnv = z.infer<typeof workerEnvSchema>;

export class EnvValidationError extends Error {
  constructor(public readonly issues: z.ZodIssue[]) {
    const lines = issues.map((i) => `  - ${i.path.join('.') || '(raíz)'}: ${i.message}`);
    super(
      `Configuración inválida. Revisá tu .env (hay un .env.example de referencia):\n${lines.join('\n')}`,
    );
    this.name = 'EnvValidationError';
  }
}

/**
 * Parsea y valida. Lanza EnvValidationError con TODOS los problemas juntos,
 * no de a uno: arreglar el .env de a una variable por corrida es tiempo perdido.
 */
export function parseEnv<T extends z.ZodTypeAny>(
  schema: T,
  source: Record<string, string | undefined> = process.env,
): z.infer<T> {
  const result = schema.safeParse(source);
  if (!result.success) throw new EnvValidationError(result.error.issues);
  return result.data;
}

export const parseApiEnv = (source?: Record<string, string | undefined>) =>
  parseEnv(apiEnvSchema, source);

export const parseWorkerEnv = (source?: Record<string, string | undefined>) =>
  parseEnv(workerEnvSchema, source);
