import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as NavItemsModule from './nav-items';

/**
 * Sidebar (FRONTEND_PLAN §4, LEODARROSAFIT_ALIGNMENT_PLAN.md §2/§4): "un
 * ítem sin permiso simplemente no se renderiza". Este componente es la guard
 * nivel 2 del cliente (nivel 1 = cookie/middleware, nivel 3 = PermissionGate
 * en cada página); los tres son defensa en profundidad, y la promesa de este
 * nivel es exclusivamente "no revelar QUÉ existe" — el back sigue
 * rechazando cualquier request sin permiso aunque el UI se cuele.
 *
 * El segmento activo se abre al entrar; los demás se despliegan al pulsar.
 *
 * Tests: filtrado por permiso (ítem y grupo entero), filtrado por feature, y
 * estado activo por match más largo (/members/debt activa "Deudores", no
 * "Socios").
 */

let mockPathname = '/dashboard';

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
}));

vi.mock('next/link', () => ({
  default: ({ children, href, ...rest }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

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
  it('sin permisos, sólo muestra las entradas sin `permission` (Dashboard, Mi cuenta)', async () => {
    await setSession([]);
    const { Sidebar } = await import('./Sidebar');
    render(<Sidebar />);
    expect(screen.getByLabelText('El Templo')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Dashboard/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sistema' }));
    expect(screen.getByRole('link', { name: /Mi cuenta/i })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^Socios$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^Caja$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Acceso/i })).not.toBeInTheDocument();
  });

  it('despliega Socios al pulsar y cierra el segmento anterior', async () => {
    await setSession(['member:read']);
    const { Sidebar } = await import('./Sidebar');
    render(<Sidebar />);
    const toggle = screen.getByRole('button', { name: 'Socios' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('link', { name: /Deudores/i })).not.toBeInTheDocument();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.queryByRole('link', { name: /Dashboard/i })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^Socios$/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Deudores/i })).toBeInTheDocument();
    // Sin member:write no se revela "Nuevo socio"; sin attendance:read no "Asistencias".
    expect(screen.queryByRole('link', { name: /Nuevo socio/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Asistencias/i })).not.toBeInTheDocument();
  });

  it('un grupo cuyas hojas quedaron todas filtradas no se renderiza', async () => {
    await setSession(['member:read']); // nada de user:read
    const { Sidebar } = await import('./Sidebar');
    render(<Sidebar />);
    expect(screen.queryByRole('button', { name: 'Staff' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Usuarios/i })).not.toBeInTheDocument();
  });

  it('con todos los permisos declarados aparecen todos los grupos e ítems', async () => {
    const { NAV_GROUPS } = await import('./nav-items');
    const allPermissions = [
      ...new Set(
        NAV_GROUPS.flatMap((g) => g.items.map((item) => item.permission)).filter(
          (p): p is NonNullable<typeof p> => Boolean(p),
        ),
      ),
    ];
    await setSession(allPermissions);
    const { Sidebar } = await import('./Sidebar');
    render(<Sidebar />);
    for (const group of NAV_GROUPS) {
      const toggle = screen.getByRole('button', { name: group.label });
      if (toggle.getAttribute('aria-expanded') !== 'true') fireEvent.click(toggle);
      for (const item of group.items) {
        expect(
          screen.getByRole('link', { name: new RegExp(`^${item.label}$`, 'i') }),
        ).toBeInTheDocument();
      }
    }
  });

  it('marca la hoja activa por el match más largo', async () => {
    mockPathname = '/members/debt';
    await setSession(['member:read']);
    const { Sidebar } = await import('./Sidebar');
    render(<Sidebar />);
    const debtors = screen.getByRole('link', { name: /Deudores/i });
    expect(debtors).toHaveAttribute('aria-current', 'page');
    // El fix del bug de prefijo: "Socios" (/members) NO queda activo.
    expect(screen.getByRole('link', { name: /^Socios$/i })).not.toHaveAttribute('aria-current');
  });

  it('permiso presente pero feature deshabilitada oculta el ítem', async () => {
    vi.doMock('./nav-items', async () => {
      const actual = await vi.importActual<typeof NavItemsModule>('./nav-items');
      return {
        ...actual,
        NAV_GROUPS: [
          ...actual.NAV_GROUPS,
          {
            id: 'whatsapp',
            label: 'WhatsApp',
            items: [
              {
                href: '/whatsapp',
                label: 'WhatsApp',
                permission: 'message:send',
                feature: 'whatsapp_real',
              },
            ],
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
