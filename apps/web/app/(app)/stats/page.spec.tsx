import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { formatMoney } from '@pulso/config/money';

/**
 * `Intl.NumberFormat` para `es-AR` intercala el símbolo de moneda con un
 * espacio no separable (NBSP/espacio fino). El normalizador por defecto de
 * Testing Library colapsa esos espacios del lado del DOM, pero no del lado
 * del texto buscado: sin este `flat`, la comparación exacta falla aunque el
 * texto sea "igual" a simple vista.
 */
function flat(text: string): string {
  return text.replace(/\s+/g, ' ');
}

/**
 * Estadísticas (demo, sin backend). Cubre gate de permiso, KPIs derivados del
 * dataset determinista y presencia de los gráficos con su descripción
 * accesible.
 */

async function primeSession(permissions: string[] = ['stats:read']): Promise<void> {
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

describe('StatsPage', () => {
  it('sin permiso stats:read muestra el mensaje de sin acceso', async () => {
    await primeSession([]);
    const { default: StatsPage } = await import('./page');
    render(<StatsPage />);
    expect(screen.getByText('Sin acceso')).toBeInTheDocument();
  });

  it('con permiso muestra el estado de carga primero', async () => {
    await primeSession();
    const { default: StatsPage } = await import('./page');
    render(<StatsPage />);
    expect(screen.getByText(/Cargando estadísticas/i)).toBeInTheDocument();
  });

  it('con permiso muestra los KPIs calculados del dataset determinista', async () => {
    await primeSession();
    const { default: StatsPage } = await import('./page');
    const { getInsightsDemoDataset } = await import('@/lib/mock/data/insights-demo');
    const dataset = getInsightsDemoDataset();
    render(<StatsPage />);

    expect(await screen.findByText('Socios activos')).toBeInTheDocument();
    expect(screen.getByText(String(dataset.kpis.activeMembers))).toBeInTheDocument();
    expect(screen.getByText(`+${dataset.kpis.growth12mPercent}%`)).toBeInTheDocument();
    expect(screen.getByText(`${dataset.kpis.averageRetentionPercent}%`)).toBeInTheDocument();
    expect(screen.getByText(flat(formatMoney(dataset.kpis.averageMonthlyIncome)))).toBeInTheDocument();
  });

  it('renderiza los cuatro gráficos con su descripción accesible', async () => {
    await primeSession();
    const { default: StatsPage } = await import('./page');
    render(<StatsPage />);

    expect(await screen.findByText('Socios activos por mes')).toBeInTheDocument();
    expect(screen.getByText('Ingresos vs. egresos por mes')).toBeInTheDocument();
    expect(screen.getByText('Asistencias por día de la semana')).toBeInTheDocument();
    expect(screen.getByText('Distribución de socios por plan')).toBeInTheDocument();

    expect(screen.getByText(/Evolución de socios activos por mes/i)).toBeInTheDocument();
    expect(screen.getByText(/Ingresos y egresos mensuales/i)).toBeInTheDocument();
    expect(screen.getByText(/Asistencias por día de la semana\. El día con más asistencias/i)).toBeInTheDocument();
    expect(screen.getByText(/Distribución de socios por plan:/i)).toBeInTheDocument();
  });
});
