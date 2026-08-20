import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { format } from 'date-fns';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { Attendance, ListAttendancesResponse } from '@pulso/contracts/access';

/**
 * Asistencias de socios: pantalla real contra `GET /attendances`.
 */

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children: ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const listAttendancesMock = vi.fn();
vi.mock('@/lib/api/access', () => ({
  listAttendances: (...args: unknown[]) => listAttendancesMock(...args),
}));

function withQuery(children: ReactNode): ReactNode {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

async function primeSession(permissions: string[] = ['attendance:read']): Promise<void> {
  const { useSessionStore } = await import('@/lib/stores/session');
  useSessionStore.setState({
    user: { id: 'u', firstName: 'Ana', lastName: 'Test', email: 'a@t.com', mustChangePassword: false },
    gym: { id: 'g1', name: 'Demo', slug: 'demo', country: 'AR', currency: 'ARS', features: [] },
    branches: [{ id: 'b1', name: 'Centro', timezone: 'America/Argentina/Buenos_Aires' }],
    activeBranchId: 'b1',
    permissions,
    status: 'authenticated',
  } as never);
}

function makeAttendance(overrides: Partial<Attendance> = {}): Attendance {
  return {
    id: 'att-1',
    branchId: 'b1',
    memberId: 'm1',
    membershipId: 'ms1',
    method: 'DOCUMENT',
    occurredOn: '2026-08-20',
    occurredAt: '2026-08-20T21:30:00.000Z',
    branch: { id: 'b1', name: 'Centro' },
    member: {
      id: 'm1',
      firstName: 'Lucía',
      lastName: 'Pérez',
      documentMasked: '•••••456',
    },
    membership: { id: 'ms1', planName: 'Musculación' },
    ...overrides,
  };
}

function makeResponse(rows: Attendance[], total = rows.length): ListAttendancesResponse {
  return {
    data: rows,
    pageInfo: { total, page: 1, limit: 100, hasMore: false },
  };
}

beforeEach(async () => {
  listAttendancesMock.mockReset();
  const { useSessionStore } = await import('@/lib/stores/session');
  useSessionStore.setState({
    user: null,
    gym: null,
    branches: [],
    activeBranchId: null,
    permissions: [],
    status: 'idle',
  } as never);
});

describe('AttendancePage', () => {
  it('render feliz: muestra socio, plan, sede y método de acceso desde la API', async () => {
    await primeSession();
    listAttendancesMock.mockResolvedValueOnce(makeResponse([makeAttendance()]));
    const { default: AttendancePage } = await import('./page');
    render(withQuery(<AttendancePage />));

    await screen.findByText('Pérez, Lucía');
    expect(screen.getByText('•••••456')).toBeInTheDocument();
    expect(screen.getByText('Musculación')).toBeInTheDocument();
    expect(screen.getByText('Centro')).toBeInTheDocument();
    expect(screen.getByText('Documento')).toBeInTheDocument();
    expect(screen.getByText('Pérez, Lucía').closest('a')).toHaveAttribute('href', '/members/m1');
  });

  it('calcula KPIs con los registros del día', async () => {
    await primeSession();
    listAttendancesMock.mockResolvedValueOnce(
      makeResponse([
        makeAttendance({ id: 'att-1', occurredAt: '2026-08-20T21:10:00.000Z' }),
        makeAttendance({ id: 'att-2', method: 'DOCUMENT', occurredAt: '2026-08-20T21:35:00.000Z' }),
      ], 2),
    );
    const { default: AttendancePage } = await import('./page');
    render(withQuery(<AttendancePage />));

    await waitFor(() => expect(screen.getByText('Documento (2)')).toBeInTheDocument());
    expect(screen.getByText('Registros del día').nextElementSibling?.textContent).toBe('2');
    expect(screen.getByText('18:00-19:00')).toBeInTheDocument();
  });

  it('la fecha por defecto es hoy y cambiarla consulta la API con ese día', async () => {
    await primeSession();
    listAttendancesMock.mockResolvedValue(makeResponse([]));
    const { default: AttendancePage } = await import('./page');
    render(withQuery(<AttendancePage />));

    const today = format(new Date(), 'yyyy-MM-dd');
    const dateInput = screen.getByLabelText('Fecha') as HTMLInputElement;
    expect(dateInput.value).toBe(today);

    fireEvent.change(dateInput, { target: { value: '2026-08-01' } });
    await waitFor(() =>
      expect(listAttendancesMock).toHaveBeenLastCalledWith(
        expect.objectContaining({ from: '2026-08-01', to: '2026-08-01' }),
      ),
    );
  });

  it('la búsqueda filtra por nombre o DNI en la página actual', async () => {
    await primeSession();
    listAttendancesMock.mockResolvedValueOnce(
      makeResponse([
        makeAttendance(),
        makeAttendance({
          id: 'att-2',
          memberId: 'm2',
          member: { id: 'm2', firstName: 'Bruno', lastName: 'García', documentMasked: '•••••789' },
        }),
      ]),
    );
    const { default: AttendancePage } = await import('./page');
    render(withQuery(<AttendancePage />));

    await screen.findByText('Pérez, Lucía');
    fireEvent.change(screen.getByLabelText('Buscar por nombre, DNI, plan o sede'), {
      target: { value: '789' },
    });

    await waitFor(() => {
      expect(screen.getByText('García, Bruno')).toBeInTheDocument();
      expect(screen.queryByText('Pérez, Lucía')).not.toBeInTheDocument();
    });
  });

  it('sin el permiso attendance:read no se ve el contenido de la pantalla', async () => {
    await primeSession([]);
    const { default: AttendancePage } = await import('./page');
    render(withQuery(<AttendancePage />));

    expect(await screen.findByText('Sin acceso')).toBeInTheDocument();
    expect(screen.queryByText('Asistencias')).not.toBeInTheDocument();
  });
});
