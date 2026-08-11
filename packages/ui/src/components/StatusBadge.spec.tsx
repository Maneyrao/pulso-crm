import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusBadge, type StatusTone } from './StatusBadge.js';

const TONES: StatusTone[] = ['success', 'warning', 'danger', 'info', 'neutral'];

describe('StatusBadge', () => {
  it.each(TONES)('el tono "%s" siempre renderiza el texto del label', (tone) => {
    render(<StatusBadge tone={tone} label={`Estado ${tone}`} />);
    expect(screen.getByText(`Estado ${tone}`)).toBeInTheDocument();
  });

  it.each(TONES)('el tono "%s" siempre incluye un ícono, no sólo color', (tone) => {
    const { container } = render(<StatusBadge tone={tone} label="Vencido" />);
    // El ícono es un <svg> de lucide-react marcado aria-hidden (decorativo);
    // lo que realmente comunica el estado es el texto que lo acompaña.
    const icon = container.querySelector('svg[aria-hidden="true"]');
    expect(icon).not.toBeNull();
  });

  it('permite un ícono custom sin perder el texto', () => {
    function CustomIcon(props: { className?: string }) {
      return <svg data-testid="custom-icon" className={props.className} />;
    }
    render(<StatusBadge tone="danger" label="Deuda bloqueada" icon={CustomIcon} />);
    expect(screen.getByTestId('custom-icon')).toBeInTheDocument();
    expect(screen.getByText('Deuda bloqueada')).toBeInTheDocument();
  });

  it('el texto no depende de estar presente sólo para lectores de pantalla: es visible', () => {
    render(<StatusBadge tone="success" label="Acceso permitido" />);
    const text = screen.getByText('Acceso permitido');
    expect(text).toBeVisible();
  });
});
