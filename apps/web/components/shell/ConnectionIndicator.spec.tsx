import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectionIndicator } from './ConnectionIndicator';

const fetchMock = vi.fn();
const healthy = () => ({ ok: true, json: async () => ({ status: 'ok', checks: { db: true, redis: true } }) });

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockReset().mockResolvedValue(healthy());
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('ConnectionIndicator', () => {
  it('sólo declara En línea tras readiness real y no envía credenciales', async () => {
    await act(async () => { render(<ConnectionIndicator />); });
    expect(screen.getByRole('status')).toHaveTextContent('En línea');
    expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/\/health\/ready$/), expect.objectContaining({ credentials: 'omit', cache: 'no-store' }));
  });

  it.each([
    { ok: false, status: 503 },
    { ok: true, json: async () => ({ status: 'ok' }) },
    { ok: true, json: async () => { throw new Error('HTML del proxy'); } },
  ])('no confunde navigator.onLine con API disponible (%j)', async (response) => {
    fetchMock.mockResolvedValue(response);
    await act(async () => { render(<ConnectionIndicator />); });
    expect(screen.getByRole('status')).toHaveTextContent('API no disponible');
  });

  it('detecta caída, vuelve a verificar y pausa en pestaña oculta', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('network'));
    const visibility = vi.spyOn(document, 'visibilityState', 'get');
    await act(async () => { render(<ConnectionIndicator />); });
    expect(screen.getByRole('status')).toHaveTextContent('API no disponible');
    visibility.mockReturnValue('hidden');
    await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    visibility.mockReturnValue('visible');
    await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(screen.getByRole('status')).toHaveTextContent('En línea');
  });

  it('sin internet no hace requests; desmontar limpia el intervalo', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const view = render(<ConnectionIndicator />);
    expect(screen.getByRole('status')).toHaveTextContent('Sin internet');
    expect(fetchMock).not.toHaveBeenCalled();
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
