import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import pino, { type Logger } from 'pino';
import { redact } from './redaction.js';

/** Contexto de request propagado a todos los logs sin pasarlo por parámetro. */
export interface RequestContext {
  requestId: string;
  gymId?: string;
  userId?: string;
  branchId?: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

export const RequestContextStore = {
  run<T>(ctx: RequestContext, fn: () => T): T {
    return storage.run(ctx, fn);
  },
  get(): RequestContext | undefined {
    return storage.getStore();
  },
  set(patch: Partial<RequestContext>): void {
    const current = storage.getStore();
    if (current) Object.assign(current, patch);
  },
  newRequestId(): string {
    return randomUUID();
  },
};

let root: Logger | null = null;

export function createRootLogger(opts: { level: string; pretty: boolean }): Logger {
  root = pino({
    level: opts.level,
    // La redacción se aplica en el hook, no con `redact` de pino, porque
    // necesitamos recorrer estructuras arbitrarias y no rutas fijas.
    hooks: {
      logMethod(args, method) {
        const [first, ...rest] = args;
        if (typeof first === 'object' && first !== null) {
          return method.apply(this, [redact(first) as object, ...rest] as never);
        }
        return method.apply(this, args as never);
      },
    },
    mixin() {
      const ctx = RequestContextStore.get();
      return ctx ? { requestId: ctx.requestId, gymId: ctx.gymId, userId: ctx.userId } : {};
    },
    ...(opts.pretty
      ? {
          transport: {
            target: 'pino-pretty',
            options: { colorize: true, translateTime: 'SYS:HH:MM:ss' },
          },
        }
      : {}),
  });
  return root;
}

export function getLogger(): Logger {
  // Si nadie llamó a createRootLogger (tests, scripts), se arma uno respetando
  // LOG_LEVEL. Sin esto, un test silencioso igual imprimiría.
  root ??= createRootLogger({ level: process.env['LOG_LEVEL'] ?? 'info', pretty: false });
  return root;
}
