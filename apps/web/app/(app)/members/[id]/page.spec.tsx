import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@pulso/ui';
import type { ReactNode } from 'react';
import type { MemberDetail } from '@pulso/contracts/members';

/**
 * Ficha de socio (T-M3-3). El documento enmascarado es responsabilidad del
 * backend (ADR-018): este componente lo muestra tal cual lo recibe y no
 * intenta re-enmascararlo. El test lo verifica pasando el valor completo por
 * el mock y comprobando que llegue sin cambios.
 */

const routerPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush }),
  usePathname: () => '/members/abc',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({ id: '00000000-0000-0000-0000-000000000abc' }),
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children: ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const getMemberMock = vi.fn();
const getMemberLedgerMock = vi.fn();
const updateMemberMock = vi.fn();
const deactivateMemberMock = vi.fn();
vi.mock('@/lib/api/members', () => ({
  getMember: (...args: unknown[]) => getMemberMock(...args),
  getMemberLedger: (...args: unknown[]) => getMemberLedgerMock(...args),
  updateMember: (...args: unknown[]) => updateMemberMock(...args),
  deactivateMember: (...args: unknown[]) => deactivateMemberMock(...args),
}));

function withQuery(children: ReactNode): ReactNode {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}

function makeMember(overrides: Partial<MemberDetail> = {}): MemberDetail {
  return {
    id: '00000000-0000-0000-0000-000000000abc',
    gymId: 'g1',
    memberNumber: 42,
    firstName: 'Lucía',
    lastName: 'Pérez',
    documentType: 'DNI',
    // NOTA: el backend puede devolver el número enmascarado en `documentNumber`
    // si el usuario no tiene `member:read_document`. La UI lo muestra tal cual.
    documentNumber: '•••••456',
    email: 'lu@example.com',
    phone: '+541155551234',
    birthDate: '1995-05-20',
    gender: null,
    address: null,
    cardCode: null,
    photoKey: null,
    status: 'ACTIVE',
    branchId: 'b1',
    balance: '0.00',
    medicalClearanceUntil: null,
    emergencyContactName: null,
    emergencyContactPhone: null,
    notes: null,
    createdAt: '2026-01-01T12:00:00.000Z',
    updatedAt: '2026-01-01T12:00:00.000Z',
    recentMemberships: [],
    recentPayments: [],
    recentAttendances: [],
    ...overrides,
  };
}

async function primeSession(permissions: string[] = ['member:read', 'member:write', 'member:delete']): Promise<void> {
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

beforeEach(async () => {
  routerPush.mockReset();
  getMemberMock.mockReset();
  getMemberLedgerMock.mockReset();
  updateMemberMock.mockReset();
  deactivateMemberMock.mockReset();
  getMemberLedgerMock.mockResolvedValue({ entries: [], balance: '0.00' });
});

describe('MemberDetailPage', () => {
  it('render feliz muestra la ficha del socio con el resumen', async () => {
    await primeSession();
    getMemberMock.mockResolvedValueOnce(makeMember());
    const { default: MemberDetailPage } = await import('./page');
    render(withQuery(<MemberDetailPage />));

    await waitFor(() => expect(screen.getByText('Pérez, Lucía')).toBeInTheDocument());
    expect(screen.getByText(/Socio #42/i)).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Cuenta corriente/i })).toBeInTheDocument();
  });

  it('empty en la cuenta corriente: sin entradas muestra el mensaje de "sin movimientos"', async () => {
    await primeSession();
    getMemberMock.mockResolvedValueOnce(makeMember());
    getMemberLedgerMock.mockResolvedValueOnce({ entries: [], balance: '0.00' });
    const user = userEvent.setup();
    const { default: MemberDetailPage } = await import('./page');
    render(withQuery(<MemberDetailPage />));

    await waitFor(() => expect(screen.getByText('Pérez, Lucía')).toBeInTheDocument());
    await user.click(screen.getByRole('tab', { name: /Cuenta corriente/i }));
    await waitFor(() => expect(screen.getByText(/Todavía no hay movimientos/i)).toBeInTheDocument());
  });

  it('loading muestra el skeleton mientras la query está en vuelo', async () => {
    await primeSession();
    getMemberMock.mockReturnValueOnce(new Promise(() => {}));
    const { default: MemberDetailPage } = await import('./page');
    const { container } = render(withQuery(<MemberDetailPage />));
    // Los Skeletons no exponen role; alcanza con verificar que aún NO se
    // pintó ni el nombre ni el número del socio.
    expect(container.textContent ?? '').not.toContain('Pérez');
  });

  it('ante error 500 muestra alert con reintento', async () => {
    await primeSession();
    const { ApiError } = await import('@/lib/api/errors');
    getMemberMock.mockRejectedValueOnce(
      new ApiError({
        type: 'about:blank',
        code: 'INTERNAL_ERROR',
        title: 'Error',
        status: 500,
        detail: 'La base explotó',
      }),
    );
    const { default: MemberDetailPage } = await import('./page');
    render(withQuery(<MemberDetailPage />));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/La base explotó/);

    getMemberMock.mockResolvedValueOnce(makeMember());
    fireEvent.click(screen.getByRole('button', { name: /Reintentar/i }));
    await waitFor(() => expect(getMemberMock).toHaveBeenCalledTimes(2));
  });

  it('documento enmascarado: se muestra EXACTAMENTE lo que envía el backend (no se re-enmascara acá)', async () => {
    await primeSession();
    // El backend puede devolver el documento visible ("20123456") si el usuario
    // tiene member:read_document, o enmascarado ("•••••456") si no. La UI
    // muestra el valor tal cual: no hace lógica de masking.
    getMemberMock.mockResolvedValueOnce(makeMember({ documentNumber: '20123456' }));
    const { default: MemberDetailPage } = await import('./page');
    render(withQuery(<MemberDetailPage />));

    await waitFor(() => expect(screen.getByText(/DNI 20123456/)).toBeInTheDocument());
    expect(screen.queryByText(/•••••456/)).not.toBeInTheDocument();
  });
});
