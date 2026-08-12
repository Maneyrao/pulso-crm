import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { KpiCard } from './KpiCard';

/**
 * Smoke test de la primera pieza aislable del dashboard: los cinco estados
 * de una `KpiCard` (loading, error, value con hint, value sin hint, título
 * siempre presente). No pretende cubrir el dashboard entero — habilita quitar
 * `passWithNoTests: true` de `apps/web/vitest.config.ts` con al menos un
 * componente de web ejercitado de verdad.
 */
describe('KpiCard', () => {
  it('renderiza título y valor', () => {
    render(<KpiCard title="Socios activos" value={128} />);
    expect(screen.getByText('Socios activos')).toBeInTheDocument();
    expect(screen.getByText('128')).toBeInTheDocument();
  });

  it('muestra el hint cuando se provee, oculta si no', () => {
    const { rerender } = render(<KpiCard title="Ingresos" value="$ 10.000" hint="hoy" />);
    expect(screen.getByText('hoy')).toBeInTheDocument();

    rerender(<KpiCard title="Ingresos" value="$ 10.000" />);
    expect(screen.queryByText('hoy')).not.toBeInTheDocument();
  });

  it('en loading muestra skeleton y no valor', () => {
    render(<KpiCard title="Deuda total" loading value="no debería verse" />);
    expect(screen.queryByText('no debería verse')).not.toBeInTheDocument();
  });

  it('en error muestra el mensaje con role="alert" y no valor', () => {
    render(<KpiCard title="Asistencias" error="No pudimos cargar este indicador." value={42} />);
    expect(screen.queryByText('42')).not.toBeInTheDocument();
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('No pudimos cargar este indicador.');
  });
});
