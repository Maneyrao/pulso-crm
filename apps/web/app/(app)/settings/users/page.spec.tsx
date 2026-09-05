import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '@pulso/ui';
import type { ReactNode } from 'react';
import type { Role, User } from '@pulso/contracts/iam';
import type { Branch } from '@pulso/contracts/tenancy';

/**
 * Settings › Usuarios (`GET /users`, `GET /roles`, `GET /branches`).
 *
 * Cubre el render real de las columnas [Usuario, Email, Rol, Sede, Estado]:
 * el rol se resuelve por nombre (no por id) y la sede muestra "Todas" cuando
 * `branchIds` está vacío (sin selección = acceso a todas las sedes activas,
 * ver `UsersScreen`).
 */

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/settings/users',
  useSearchParams: () => new URLSearchParams(),
}));

const listUsersMock = vi.fn();
const listRolesMock = vi.fn();
const deleteUserMock = vi.fn();
vi.mock('@/lib/api/iam', () => ({
  listUsers: (...args: unknown[]) => listUsersMock(...args),
  listRoles: (...args: unknown[]) => listRolesMock(...args),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  deactivateUser: vi.fn(),
  deleteUser: (...args: unknown[]) => deleteUserMock(...args),
  resetUserPassword: vi.fn(),
}));

const listBranchesMock = vi.fn();
vi.mock('@/lib/api/tenancy', () => ({
  listBranches: (...args: unknown[]) => listBranchesMock(...args),
}));

function withProviders(children: ReactNode): ReactNode {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return (
    <QueryClientProvider client={qc}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  );
}

const ROLE_ADMIN = '00000000-0000-0000-0000-0000000000r1';
const BRANCH_CENTRO = '00000000-0000-0000-0000-0000000000b1';

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: '00000000-0000-0000-0000-000000000u1',
    gymId: 'g1',
    email: 'ana@demo.com',
    firstName: 'Ana',
    lastName: 'Torres',
    phone: null,
    status: 'ACTIVE',
    mustChangePassword: false,
    roleIds: [ROLE_ADMIN],
    branchIds: [],
    ...overrides,
  } as User;
}

function makeRole(overrides: Partial<Role> = {}): Role {
  return {
    id: ROLE_ADMIN,
    gymId: 'g1',
    name: 'Administrador',
    permissions: [],
    isSystem: true,
    ...overrides,
  } as Role;
}

function makeBranch(overrides: Partial<Branch> = {}): Branch {
  return {
    id: BRANCH_CENTRO,
    gymId: 'g1',
    name: 'Centro',
    timezone: 'America/Argentina/Buenos_Aires',
    address: null,
    phone: null,
    isActive: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

async function primeSession(permissions: string[] = ['user:read']): Promise<void> {
  const { useSessionStore } = await import('@/lib/stores/session');
  useSessionStore.setState({
    user: { id: 'u0', firstName: 'Admin', lastName: 'Root', email: 'root@demo.com' },
    gym: { id: 'g1', slug: 'demo', name: 'Demo', currency: 'ARS', features: [] },
    branches: [{ id: BRANCH_CENTRO, name: 'Centro', timezone: 'America/Argentina/Buenos_Aires' }],
    activeBranchId: BRANCH_CENTRO,
    permissions,
    status: 'authenticated',
  } as never);
}

beforeEach(async () => {
  listUsersMock.mockReset();
  listRolesMock.mockReset();
  deleteUserMock.mockReset();
  listBranchesMock.mockReset();
  listBranchesMock.mockResolvedValue({ data: [makeBranch()] });
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

describe('UsersSettingsPage', () => {
  it('pinta Usuario/Email/Rol/Sede: rol resuelto por nombre y sede "Todas" sin branchIds', async () => {
    await primeSession();
    listUsersMock.mockResolvedValue({ data: [makeUser()] });
    listRolesMock.mockResolvedValue({ data: [makeRole()] });

    const { default: UsersSettingsPage } = await import('./page');
    render(withProviders(<UsersSettingsPage />));

    expect(screen.getByRole('heading', { name: 'Usuarios' })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText('Ana Torres')).toBeInTheDocument());
    expect(screen.getByText('ana@demo.com')).toBeInTheDocument();
    expect(screen.getByText('Administrador')).toBeInTheDocument();
    expect(screen.getByText('Todas')).toBeInTheDocument();
  });

  it('con branchIds asignados: muestra el nombre real de la sede', async () => {
    await primeSession();
    listUsersMock.mockResolvedValue({ data: [makeUser({ branchIds: [BRANCH_CENTRO] })] });
    listRolesMock.mockResolvedValue({ data: [makeRole()] });

    const { default: UsersSettingsPage } = await import('./page');
    render(withProviders(<UsersSettingsPage />));

    await waitFor(() => expect(screen.getByText('Ana Torres')).toBeInTheDocument());
    expect(screen.getByText('Centro')).toBeInTheDocument();
    expect(screen.queryByText('Todas')).not.toBeInTheDocument();
  });

  it('elimina un usuario con confirmación y lo quita mediante el endpoint real', async () => {
    await primeSession(['user:read', 'user:write']);
    const target = makeUser();
    listUsersMock.mockResolvedValue({ data: [target] });
    listRolesMock.mockResolvedValue({ data: [makeRole()] });
    deleteUserMock.mockResolvedValue({ ...target, status: 'INACTIVE' });

    const { default: UsersSettingsPage } = await import('./page');
    render(withProviders(<UsersSettingsPage />));

    await screen.findByText('Ana Torres');
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar' }));
    expect(screen.getByRole('dialog', { name: 'Eliminar usuario' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Eliminar usuario' }));

    await waitFor(() => expect(deleteUserMock).toHaveBeenCalledWith(target.id));
  });
});
