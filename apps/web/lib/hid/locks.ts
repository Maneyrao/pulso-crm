'use client';

/**
 * Propiedad exclusiva del lector entre pestañas. ADC acepta varias conexiones
 * a la vez y cada una puede pedir StartAcquisition: dos pestañas del CRM se
 * robarían las notificaciones. Con Web Locks (Chrome 69+, Edge, Firefox 96+)
 * una sola pestaña es dueña; el resto espera y toma el lector al liberarse.
 */

export type ReleaseLock = () => void;

export interface ReaderLock {
  /** Devuelve la función de liberación o `null` si otra pestaña lo tiene. */
  tryAcquire(): Promise<ReleaseLock | null>;
  /** Espera hasta obtener el lock. */
  acquire(): Promise<ReleaseLock>;
}

export const HID_READER_LOCK_NAME = 'pulso-crm:hid-fingerprint-reader';

export function createMemoryReaderLock(): ReaderLock {
  let held = false;
  const waiters: Array<(release: ReleaseLock) => void> = [];

  const release: ReleaseLock = () => {
    const next = waiters.shift();
    if (next) {
      next(release);
      return;
    }
    held = false;
  };

  return {
    async tryAcquire() {
      if (held) return null;
      held = true;
      return release;
    },
    acquire() {
      if (!held) {
        held = true;
        return Promise.resolve(release);
      }
      return new Promise<ReleaseLock>((resolve) => waiters.push(resolve));
    },
  };
}

export function createWebLocksReaderLock(
  name = HID_READER_LOCK_NAME,
  manager: LockManager | undefined = typeof navigator !== 'undefined' ? navigator.locks : undefined,
): ReaderLock {
  if (!manager) return createMemoryReaderLock();

  const hold = (options: LockOptions): Promise<ReleaseLock | null> =>
    new Promise<ReleaseLock | null>((resolveAcquire, rejectAcquire) => {
      void manager
        .request(name, options, (lock) => {
          if (!lock) {
            resolveAcquire(null);
            return Promise.resolve();
          }
          return new Promise<void>((resolveRelease) => {
            resolveAcquire(() => resolveRelease());
          });
        })
        .catch((error: unknown) => rejectAcquire(error));
    });

  return {
    tryAcquire: () => hold({ ifAvailable: true }),
    acquire: async () => (await hold({}))!,
  };
}

let shared: ReaderLock | null = null;

/** Lock compartido de la pestaña (Web Locks si existe; memoria si no). */
export function getReaderLock(): ReaderLock {
  shared ??= createWebLocksReaderLock();
  return shared;
}

/** Sólo para tests: descarta el lock compartido (equivale a "no hay otra pestaña"). */
export function resetReaderLockForTests(): void {
  shared = null;
}
