import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@pulso/ui';
import type { ReactNode } from 'react';
import type {
  DebtorListItem,
  ListDebtorsResponse,
  ListMembersResponse,
  MemberListItem,
} from '@pulso/contracts/members';

/**
 * Baja de socios: pantalla real contra deudores, socios inactivos y
 * `POST /members/:id/deactivate`.
 */

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children: ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const listDebtorsMock = vi.fn();
const listMembersMock = vi.fn();
const deactivateMemberMock = vi.fn();
vi.mock('@/lib/api/members', () => ({
  listDebtors: (...args: unknown[]) => listDebtorsMock(...args),
  listMembers: (...args: unknown[]) => listMembersMock(...args),
  deactivateMember: (...args: unknown[]) => deactivateMemberMock(...args),
}));

function withProviders(children: ReactNode): ReactNode {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}

async function primeSession(permissions: string[] = ['member:read', 'member:delete']): Promise<void> {
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

function makeMember(overrides: Partial<MemberListItem> = {}): MemberListItem {
  return {
    id: 'm1',
    memberNumber: 42,
    firstName: 'Lucía',
    lastName: 'Pérez',
    documentMasked: '•••••456',
    phone: '+541155551234',
    status: 'INACTIVE',
    branch: { id: 'b1', name: 'Centro' },
    activeMembership: null,
    balance: '0.00',
    photoUrl: null,
    ...overrides,
  };
}

function makeDebtor(overrides: Partial<DebtorListItem> = {}): DebtorListItem {
  return {
    ...makeMember({ status: 'ACTIVE', balance: '-28500.00' }),
    activeMembership: { planName: 'Musculación', endDate: '2026-07-01', classesRemaining: null },
    debtSince: '2026-07-01',
    ...overrides,
  };
}

function debtorsResponse(rows: DebtorListItem[]): ListDebtorsResponse {
  return { data: rows, pageInfo: { total: rows.length, page: 1, limit: 100, hasMore: false } };
}

function membersResponse(rows: MemberListItem[]): ListMembersResponse {
  return { data: rows, pageInfo: { total: rows.length, page: 1, limit: 100, hasMore: false } };
}

beforeEach(async () => {
  vi.clearAllMocks();
  listDebtorsMock.mockResolvedValue(debtorsResponse([makeDebtor()]));
  listMembersMock.mockResolvedValue(membersResponse([makeMember({ id: 'm2', firstName: 'Bruno', lastName: 'García' })]));
  deactivateMemberMock.mockResolvedValue(makeMember());
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

describe('InactiveMembersPage', () => {
  it('render feliz: muestra deudores reales con deuda, membresía y link a ficha', async () => {
    await primeSession();
    const { default: InactiveMembersPage } = await import('./page');
    render(withProviders(<InactiveMembersPage />));

    await screen.findByText('Pérez, Lucía');
    expect(screen.getByText('1 con deuda')).toBeInTheDocument();
    expect(screen.getByText('1 inactivos')).toBeInTheDocument();
    expect(screen.getByText('Musculación')).toBeInTheDocument();
    expect(screen.getByText('2026-07-01')).toBeInTheDocument();
    expect(screen.getByText(/28\.500/)).toBeInTheDocument();
    expect(screen.getByText('Pérez, Lucía').closest('a')).toHaveAttribute('href', '/members/m1');
  });

  it('la tab "Ya inactivos" muestra socios inactivos reales', async () => {
    await primeSession();
    const user = userEvent.setup();
    const { default: InactiveMembersPage } = await import('./page');
    render(withProviders(<InactiveMembersPage />));

    await screen.findByText('Pérez, Lucía');
    await user.click(screen.getByRole('tab', { name: 'Ya inactivos' }));

    await screen.findByText('García, Bruno');
    expect(screen.getByText('Inactivo')).toBeInTheDocument();
  });

  it('seleccionar un deudor y confirmar llama deactivateMember con force y motivo', async () => {
    await primeSession();
    const { default: InactiveMembersPage } = await import('./page');
    render(withProviders(<InactiveMembersPage />));

    await screen.findByText('Pérez, Lucía');
    fireEvent.click(screen.getByLabelText('Seleccionar a Lucía Pérez'));

    fireEvent.click(await screen.findByRole('button', { name: 'Dar de baja 1 socios' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Dar de baja' }));

    await waitFor(() => expect(deactivateMemberMock).toHaveBeenCalledTimes(1));
    expect(deactivateMemberMock).toHaveBeenCalledWith(
      'm1',
      expect.objectContaining({ force: true, reason: expect.stringContaining('Baja manual') }),
    );
    expect(await screen.findByText('Socio dado de baja')).toBeInTheDocument();
  });

  it('el ícono de baja por fila abre la confirmación para ese socio', async () => {
    await primeSession();
    const { default: InactiveMembersPage } = await import('./page');
    render(withProviders(<InactiveMembersPage />));

    await screen.findByText('Pérez, Lucía');
    fireEvent.click(screen.getByLabelText('Dar de baja a Lucía Pérez'));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Dar de baja a este socio')).toBeInTheDocument();
  });

  it('sin member:delete permite revisar, pero no muestra acciones destructivas', async () => {
    await primeSession(['member:read']);
    const { default: InactiveMembersPage } = await import('./page');
    render(withProviders(<InactiveMembersPage />));

    await screen.findByText('Pérez, Lucía');
    expect(screen.queryByLabelText('Seleccionar a Lucía Pérez')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Dar de baja a Lucía Pérez')).not.toBeInTheDocument();
  });

  it('sin el permiso member:read no se ve el contenido de la pantalla', async () => {
    await primeSession([]);
    const { default: InactiveMembersPage } = await import('./page');
    render(withProviders(<InactiveMembersPage />));

    expect(await screen.findByText('Sin acceso')).toBeInTheDocument();
    expect(screen.queryByText('Baja de socios')).not.toBeInTheDocument();
  });
});
