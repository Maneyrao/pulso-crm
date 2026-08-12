import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as NavItemsModule from './nav-items';

/**
 * Sidebar (FRONTEND_PLAN §4): "un ítem sin permiso simplemente no se
 * renderiza". Este componente es la guard nivel 2 del cliente (nivel 1 =
 * cookie/middleware, nivel 3 = PermissionGate en cada página); los tres son
 * defensa en profundidad, y la promesa de este nivel es exclusivamente
 * "no revelar QUÉ existe" — el back sigue rechazando cualquier request sin
 * permiso aunque el UI se cuele.
 *
 * Tests: filtrado por permiso, filtrado por feature, no revelar deudores si
 * no hay `member:read`, y siempre-visible /dashboard (sin permiso requerido).
 */

vi.mock('next/navigation', () => ({
  usePathname: () => '/dashboard',
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
  it('sin permisos, sólo muestra los ítems sin `permission` (Inicio)', async () => {
    await setSession([]);
    const { Sidebar } = await import('./Sidebar');
    render(<Sidebar />);
    expect(screen.getByRole('link', { name: /Inicio/i })).toBeInTheDocument();
    // Sin `member:read` no aparecen Socios, Deudores; sin cash:read no Caja.
    expect(screen.queryByRole('link', { name: /^Socios$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Deudores/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^Caja$/i })).not.toBeInTheDocument();
  });

  it('con member:read aparecen Socios y Deudores', async () => {
    await setSession(['member:read']);
    const { Sidebar } = await import('./Sidebar');
    render(<Sidebar />);
    expect(screen.getByRole('link', { name: /^Socios$/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Deudores/i })).toBeInTheDocument();
  });

  it('con TODOS los permisos aparecen todos los ítems declarados', async () => {
    await setSession([
      'access:operate',
      'member:read',
      'plan:read',
      'cash:read',
      'config:read',
      'user:read',
    ]);
    const { Sidebar } = await import('./Sidebar');
    const { NAV_ITEMS } = await import('./nav-items');
    render(<Sidebar />);
    for (const item of NAV_ITEMS) {
      expect(screen.getByRole('link', { name: new RegExp(item.label) })).toBeInTheDocument();
    }
  });

  it('permiso presente pero feature deshabilitada oculta el ítem', async () => {
    // NAV_ITEMS actual no declara `feature` en ninguno todavía; este test
    // deja constancia del contrato del filtro por si más adelante alguien
    // agrega uno (`whatsapp`, `pos`, etc). Simulo agregando manualmente un
    // ítem con feature vía mock de nav-items.
    vi.doMock('./nav-items', async () => {
      const actual = await vi.importActual<typeof NavItemsModule>('./nav-items');
      return {
        ...actual,
        NAV_ITEMS: [
          ...actual.NAV_ITEMS,
          {
            href: '/whatsapp',
            label: 'WhatsApp',
            icon: () => null,
            permission: 'messaging:read',
            feature: 'whatsapp_real',
          },
        ],
      };
    });
    vi.resetModules();
    await setSession(['messaging:read'], []); // sin la feature
    const { Sidebar } = await import('./Sidebar');
    render(<Sidebar />);
    expect(screen.queryByRole('link', { name: /WhatsApp/i })).not.toBeInTheDocument();

    vi.doUnmock('./nav-items');
    vi.resetModules();
  });
});
