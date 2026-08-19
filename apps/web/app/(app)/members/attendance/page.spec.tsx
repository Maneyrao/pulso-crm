import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { format } from 'date-fns';
import { beforeEach, describe, expect, it } from 'vitest';

/**
 * Asistencias de socios (demo). Sin backend: los datos salen de
 * `lib/mock/data/members-demo.ts` vía `useMockData` (latencia simulada, sin
 * react-query). Cubre: render feliz, KPIs, columnas clave, búsqueda y el
 * caso "otra fecha" (el dataset sólo modela "hoy").
 */

async function primeSession(permissions: string[] = ['member:read']): Promise<void> {
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

function kpiValue(label: string): string {
  const labelEl = screen.getByText(label);
  return labelEl.nextElementSibling?.textContent ?? '';
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

describe('AttendancePage', () => {
  it('render feliz: muestra hora, socio, actividad, sede y método de acceso', async () => {
    await primeSession();
    const { default: AttendancePage } = await import('./page');
    render(<AttendancePage />);

    await screen.findByText('Bruno García');
    expect(screen.getByText('06:15')).toBeInTheDocument();
    expect(screen.getByText('34567890')).toBeInTheDocument();
    expect(screen.getAllByText('Musculación').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Sede Centro').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Documento').length).toBeGreaterThan(0);
  });

  it('calcula los KPIs (asistencias hoy, pico horario, promedio diario 7 días)', async () => {
    await primeSession();
    const { default: AttendancePage } = await import('./page');
    render(<AttendancePage />);

    await screen.findByText('Bruno García');
    expect(kpiValue('Asistencias hoy')).toBe('18');
    expect(kpiValue('Pico horario')).toBe('18:00–19:00');
    expect(kpiValue('Promedio diario (7 días)')).toBe('18');
  });

  it('la fecha por defecto es hoy y filtrar por otro día deja la tabla vacía por filtro', async () => {
    await primeSession();
    const { default: AttendancePage } = await import('./page');
    render(<AttendancePage />);

    await screen.findByText('Bruno García');
    const today = format(new Date(), 'yyyy-MM-dd');
    const dateInput = screen.getByLabelText('Fecha') as HTMLInputElement;
    expect(dateInput.value).toBe(today);

    fireEvent.change(dateInput, { target: { value: '2020-01-01' } });
    await waitFor(() => expect(screen.getByText(/Sin resultados/i)).toBeInTheDocument());
  });

  it('la búsqueda filtra por nombre o DNI', async () => {
    await primeSession();
    const { default: AttendancePage } = await import('./page');
    render(<AttendancePage />);

    await screen.findByText('Bruno García');
    const search = screen.getByLabelText('Buscar por nombre o DNI');
    fireEvent.change(search, { target: { value: '34567890' } });

    await waitFor(() => {
      expect(screen.getByText('Bruno García')).toBeInTheDocument();
      expect(screen.queryByText('Lucía Fernández')).not.toBeInTheDocument();
    });
  });

  it('sin el permiso member:read no se ve el contenido de la pantalla', async () => {
    await primeSession([]);
    const { default: AttendancePage } = await import('./page');
    render(<AttendancePage />);

    expect(await screen.findByText('Sin acceso')).toBeInTheDocument();
    expect(screen.queryByText('Asistencias')).not.toBeInTheDocument();
  });
});
