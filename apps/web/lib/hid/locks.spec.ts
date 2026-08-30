import { describe, expect, it } from 'vitest';
import { createMemoryReaderLock, createWebLocksReaderLock } from './locks';

describe('ReaderLock', () => {
  it('memoria: un solo dueño; el segundo espera hasta la liberación', async () => {
    const lock = createMemoryReaderLock();
    const release = await lock.tryAcquire();
    expect(release).not.toBeNull();
    expect(await lock.tryAcquire()).toBeNull();

    let acquired = false;
    const waiting = lock.acquire().then((r) => {
      acquired = true;
      return r;
    });
    await new Promise((r) => setTimeout(r, 5));
    expect(acquired).toBe(false);
    release!();
    const second = await waiting;
    expect(acquired).toBe(true);
    second();
    expect(await lock.tryAcquire()).not.toBeNull();
  });

  it('Web Locks: usa navigator.locks con ifAvailable y libera al resolver', async () => {
    const calls: Array<{ name: string; options: LockOptions }> = [];
    let held = false;
    const fakeLocks = {
      request: (
        name: string,
        options: LockOptions,
        callback: (lock: Lock | null) => Promise<unknown>,
      ) => {
        calls.push({ name, options });
        if (options.ifAvailable && held) return callback(null);
        held = true;
        return callback({ name, mode: 'exclusive' }).finally(() => {
          held = false;
        });
      },
    };
    const lock = createWebLocksReaderLock('test-lock', fakeLocks as unknown as LockManager);

    const release = await lock.tryAcquire();
    expect(release).not.toBeNull();
    expect(calls[0]).toMatchObject({ name: 'test-lock', options: { ifAvailable: true } });
    expect(await lock.tryAcquire()).toBeNull();
    release!();
    await new Promise((r) => setTimeout(r, 0));
    expect(held).toBe(false);
  });
});
