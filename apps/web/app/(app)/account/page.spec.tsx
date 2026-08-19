import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

/**
 * Mi cuenta: datos de la sesión activa, sin query nueva (todo ya vive en
 * `useSessionStore`). No hay endpoint de "cambiar mi contraseña" en
 * `lib/api/auth.ts` ni en `lib/api/iam.ts` (sólo `resetUserPassword(id)`,
 * que es una acción administrativa sobre otro usuario), así que no hay
 * sección de cambio de contraseña que probar acá.
 */

async function primeSession(): Promise<void> {
  const { useSessionStore } = await import('@/lib/stores/session');
  useSessionStore.setState({
    user: { id: 'u1', firstName: 'Ana', lastName: 'García', email: 'ana@demo.com' },
    gym: { id: 'g1', slug: 'demo', name: 'Gimnasio Demo', currency: 'ARS', features: [] },
    branches: [
      { id: 'b1', name: 'Centro', timezone: 'America/Argentina/Buenos_Aires' },
      { id: 'b2', name: 'Norte', timezone: 'America/Argentina/Buenos_Aires' },
    ],
    activeBranchId: 'b1',
    permissions: ['member:read'],
    status: 'authenticated',
  } as never);
}

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

describe('AccountPage', () => {
  it('muestra nombre, email, iniciales, gimnasio, sede activa y sedes con acceso', async () => {
    await primeSession();

    const { default: AccountPage } = await import('./page');
    render(<AccountPage />);

    expect(screen.getByText('Mi cuenta')).toBeInTheDocument();
    expect(screen.getByText('Ana García')).toBeInTheDocument();
    expect(screen.getByText('ana@demo.com')).toBeInTheDocument();
    expect(screen.getByText('AG')).toBeInTheDocument();
    expect(screen.getByText('Gimnasio Demo')).toBeInTheDocument();
    expect(screen.getAllByText('Centro').length).toBeGreaterThan(0);
    expect(screen.getByText('Norte')).toBeInTheDocument();
  });

  it('sin sesión no renderiza contenido', async () => {
    const { default: AccountPage } = await import('./page');
    const { container } = render(<AccountPage />);

    expect(container).toBeEmptyDOMElement();
  });
});
