import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as ReactQueryModule from '@tanstack/react-query';
import type * as NavItemsModule from './nav-items';

/**
 * Sidebar (FRONTEND_PLAN §4): "un ítem sin permiso simplemente no se
 * renderiza". Este componente es la guard nivel 2 del cliente (nivel 1 =
 * cookie/middleware, nivel 3 = PermissionGate en cada página); los tres son
 * defensa en profundidad, y la promesa de este nivel es exclusivamente
 * "no revelar QUÉ existe" — el back sigue rechazando cualquier request sin
 * permiso aunque el UI se cuele.
 *
 * Tests: filtrado por permiso (hoja y grupo entero), filtrado por feature,
 * apertura del grupo activo, y estado activo por match más largo
 * (/members/debt activa "Deudores", no "Listado de socios").
 */

let mockPathname = '/dashboard';

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock('@tanstack/react-query', async (importActual) => {
  const actual = await importActual<typeof ReactQueryModule>();
  return { ...actual, useQueryClient: () => ({ clear: vi.fn() }) };
});

const setSession = async (
  permissions: string[],
  features: string[] = ['members', 'catalog', 'cash', 'access', 'messaging', 'reports'],
): Promise<void> => {
  const { useSessionStore } = await import('@/lib/stores/session');
  useSessionStore.setState({
    user: { id: 'u1', firstName: 'X', lastName: 'Y', email: 'x@y.com', mustChangePassword: false },
    gym: { id: 'g1', name: 'Demo', slug: 'demo', country: 'AR', currency: 'ARS', features },
    branches: [{ id: 'b1', name: 'Centro', timezone: 'America/Argentina/Buenos_Aires' }],
    activeBranchId: 'b1',
    permissions: permissions,
    status: 'authenticated',
  } as never);
};

beforeEach(async () => {
  mockPathname = '/dashboard';
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

describe('Sidebar — filtrado por permiso y feature', () => {
  it('sin permisos, sólo muestra las entradas sin `permission` (Inicio, Asistente)', async () => {
    await setSession([]);
    const { Sidebar } = await import('./Sidebar');
    render(<Sidebar />);
    expect(screen.getByRole('link', { name: /Inicio/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Asistente/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Socios/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Caja/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Acceso/i })).not.toBeInTheDocument();
  });

  it('con member:read aparece el grupo Socios y, al abrirlo, sus hojas permitidas', async () => {
    await setSession(['member:read']);
    const { Sidebar } = await import('./Sidebar');
    render(<Sidebar />);
    const group = screen.getByRole('button', { name: /Socios/i });
    expect(group).toBeInTheDocument();
    await userEvent.click(group);
    expect(screen.getByRole('link', { name: /Listado de socios/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Deudores/i })).toBeInTheDocument();
    // Sin member:write no se revela "Nuevo socio"; sin routine:read no "Entrenamientos".
    expect(screen.queryByRole('link', { name: /Nuevo socio/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Entrenamientos/i })).not.toBeInTheDocument();
  });

  it('un grupo cuyas hojas quedaron todas filtradas no se renderiza', async () => {
    await setSession(['member:read']); // nada de instructor:*
    const { Sidebar } = await import('./Sidebar');
    render(<Sidebar />);
    expect(screen.queryByRole('button', { name: /Instructores/i })).not.toBeInTheDocument();
  });

  it('con todos los permisos declarados aparecen todas las secciones', async () => {
    const { NAV_SECTIONS } = await import('./nav-items');
    const allPermissions = [
      ...new Set(
        NAV_SECTIONS.flatMap((s) => [s.permission, ...(s.children ?? []).map((c) => c.permission)]).filter(
          (p): p is NonNullable<typeof p> => Boolean(p),
        ),
      ),
    ];
    await setSession(allPermissions);
    const { Sidebar } = await import('./Sidebar');
    render(<Sidebar />);
    for (const section of NAV_SECTIONS) {
      const role = section.children ? 'button' : 'link';
      expect(screen.getByRole(role, { name: new RegExp(`^${section.label}$`, 'i') })).toBeInTheDocument();
    }
  });

  it('el grupo de la ruta activa arranca abierto y marca la hoja del match más largo', async () => {
    mockPathname = '/members/debt';
    await setSession(['member:read']);
    const { Sidebar } = await import('./Sidebar');
    render(<Sidebar />);
    const debtors = screen.getByRole('link', { name: /Deudores/i });
    expect(debtors).toHaveAttribute('aria-current', 'page');
    // El fix del bug de prefijo: "Listado de socios" (/members) NO queda activo.
    expect(screen.getByRole('link', { name: /Listado de socios/i })).not.toHaveAttribute('aria-current');
  });

  it('permiso presente pero feature deshabilitada oculta el ítem', async () => {
    vi.doMock('./nav-items', async () => {
      const actual = await vi.importActual<typeof NavItemsModule>('./nav-items');
      return {
        ...actual,
        NAV_SECTIONS: [
          ...actual.NAV_SECTIONS,
          {
            id: 'whatsapp',
            href: '/whatsapp',
            label: 'WhatsApp',
            icon: () => null,
            permission: 'message:send',
            feature: 'whatsapp_real',
          },
        ],
      };
    });
    vi.resetModules();
    await setSession(['message:send'], []); // sin la feature
    const { Sidebar } = await import('./Sidebar');
    render(<Sidebar />);
    expect(screen.queryByRole('link', { name: /WhatsApp/i })).not.toBeInTheDocument();

    vi.doUnmock('./nav-items');
    vi.resetModules();
  });
});
