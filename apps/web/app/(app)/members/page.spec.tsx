import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { ListMembersResponse, MemberListItem } from '@pulso/contracts/members';
import { ToastProvider } from '@pulso/ui';

/**
 * Listado de socios (T-M3-1). Cubre los 4 estados que la pantalla debe
 * distinguir sí o sí — feliz, empty, no-results-por-filtros, loading, error —
 * más un test extra sobre re-fetch al cambiar los filtros de la URL, que es la
 * razón por la que `useMemberFilters` los guarda ahí.
 */

const routerPush = vi.fn();
let currentParams = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush }),
  usePathname: () => '/members',
  useSearchParams: () => currentParams,
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children: ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const listMembersMock = vi.fn();
vi.mock('@/lib/api/members', () => ({
  listMembers: (...args: unknown[]) => listMembersMock(...args),
}));

function withQuery(children: ReactNode): ReactNode {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={qc}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}

async function primeSession(permissions: string[] = ['member:read', 'member:write']): Promise<void> {
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
    id: '00000000-0000-0000-0000-000000000001',
    memberNumber: 42,
    firstName: 'Lucía',
    lastName: 'Pérez',
    documentMasked: '•••••456',
    phone: '+541155551234',
    status: 'ACTIVE',
    branch: { id: 'b1', name: 'Centro' },
    activeMembership: { planName: 'Mensual', endDate: '2026-09-01', classesRemaining: null },
    balance: '0.00',
    photoUrl: null,
    ...overrides,
  };
}

function makeResponse(members: MemberListItem[], total = members.length): ListMembersResponse {
  return {
    data: members,
    pageInfo: { total, page: 1, limit: 25, hasMore: false },
  };
}

beforeEach(async () => {
  routerPush.mockReset();
  listMembersMock.mockReset();
  currentParams = new URLSearchParams();
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

describe('MembersPage', () => {
  it('render feliz muestra a los socios con documento enmascarado y deuda', async () => {
    await primeSession();
    listMembersMock.mockResolvedValueOnce(
      makeResponse([
        makeMember(),
        makeMember({
          id: '00000000-0000-0000-0000-000000000002',
          memberNumber: 43,
          firstName: 'Bruno',
          lastName: 'García',
          documentMasked: '•••••789',
          // Convención real del ledger: saldo NEGATIVO = deuda (backend
          // filtra `hasDebt` con `balance < 0`, ver members.service.ts). Un
          // balance positivo es saldo a favor, no deuda.
          balance: '-15000.00',
          activeMembership: null,
        }),
      ]),
    );
    const { default: MembersPage } = await import('./page');
    render(withQuery(<MembersPage />));

    await waitFor(() => expect(screen.getByText('Pérez, Lucía')).toBeInTheDocument());
    expect(screen.getByText('García, Bruno')).toBeInTheDocument();
    expect(screen.getByText('•••••456')).toBeInTheDocument();
    expect(screen.getByText('•••••789')).toBeInTheDocument();
    // Bruno tiene deuda: se muestra formateada (locale es-AR).
    const debt = screen.getByText(/15\.000/);
    expect(debt).toBeInTheDocument();
  });

  it('empty sin filtros muestra "Todavía no hay socios"', async () => {
    await primeSession();
    listMembersMock.mockResolvedValueOnce(makeResponse([]));
    const { default: MembersPage } = await import('./page');
    render(withQuery(<MembersPage />));

    await waitFor(() => expect(screen.getByText(/Todavía no hay socios/i)).toBeInTheDocument());
    // Es EmptyState, no ErrorState ni "Sin resultados".
    expect(screen.queryByText(/Sin resultados/i)).not.toBeInTheDocument();
  });

  it('empty con filtros muestra el mensaje de "sin resultados" y permite limpiar', async () => {
    await primeSession();
    currentParams = new URLSearchParams({ q: 'zzz', status: 'ACTIVE' });
    listMembersMock.mockResolvedValueOnce(makeResponse([]));
    const { default: MembersPage } = await import('./page');
    render(withQuery(<MembersPage />));

    await waitFor(() => expect(screen.getByText(/Sin resultados/i)).toBeInTheDocument());
    expect(screen.queryByText(/Todavía no hay socios/i)).not.toBeInTheDocument();
    // "Limpiar filtros" navega al pathname sin query.
    fireEvent.click(screen.getByRole('button', { name: /Limpiar filtros/i }));
    expect(routerPush).toHaveBeenCalledWith('/members');
  });

  it('loading pinta el skeleton (busy aria) mientras la query está en vuelo', async () => {
    await primeSession();
    // Promesa que no se resuelve: el estado queda en isLoading.
    listMembersMock.mockReturnValueOnce(new Promise(() => {}));
    const { default: MembersPage } = await import('./page');
    render(withQuery(<MembersPage />));
    const table = await screen.findByRole('table');
    expect(table).toHaveAttribute('aria-busy', 'true');
  });

  it('ante error muestra el mensaje del backend y permite reintentar', async () => {
    await primeSession();
    const { ApiError } = await import('@/lib/api/errors');
    const problem = new ApiError({
      type: 'about:blank',
      code: 'INTERNAL_ERROR',
      title: 'Error',
      status: 500,
      detail: 'La base explotó',
    });
    listMembersMock.mockRejectedValueOnce(problem);

    const { default: MembersPage } = await import('./page');
    render(withQuery(<MembersPage />));
    const error = await screen.findByText(/La base explotó/);
    expect(error).toBeInTheDocument();

    // Reintentar dispara una segunda llamada.
    listMembersMock.mockResolvedValueOnce(makeResponse([]));
    fireEvent.click(screen.getByRole('button', { name: /Reintentar/i }));
    await waitFor(() => expect(listMembersMock).toHaveBeenCalledTimes(2));
  });

  it('cambiar filtros en la URL vuelve a pedir la lista con los nuevos parámetros', async () => {
    await primeSession();
    listMembersMock.mockResolvedValueOnce(makeResponse([makeMember()]));
    const { default: MembersPage } = await import('./page');
    const { rerender } = render(withQuery(<MembersPage />));
    await waitFor(() => expect(listMembersMock).toHaveBeenCalledTimes(1));

    // Simulamos que la URL cambió (search param nuevo): re-render con nuevos params.
    currentParams = new URLSearchParams({ status: 'INACTIVE' });
    listMembersMock.mockResolvedValueOnce(makeResponse([]));
    rerender(withQuery(<MembersPage />));

    await waitFor(() => expect(listMembersMock).toHaveBeenCalledTimes(2));
    const lastCallArg = listMembersMock.mock.calls[1]?.[0] as Record<string, unknown>;
    expect(lastCallArg.status).toBe('INACTIVE');
  });
});
