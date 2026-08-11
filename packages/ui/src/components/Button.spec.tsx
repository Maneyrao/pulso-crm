import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations } from '../lib/expectNoAxeViolations.js';
import { Button } from './Button.js';

describe('Button', () => {
  it('renderiza como <button> por defecto', () => {
    render(<Button>Guardar</Button>);
    expect(screen.getByRole('button', { name: 'Guardar' })).toBeInTheDocument();
  });

  it.each(['primary', 'secondary', 'outline', 'ghost', 'danger'] as const)(
    'aplica clases para la variante "%s"',
    (variant) => {
      render(<Button variant={variant}>Acción</Button>);
      const button = screen.getByRole('button', { name: 'Acción' });
      expect(button.className.length).toBeGreaterThan(0);
    },
  );

  it.each(['sm', 'md', 'lg'] as const)('aplica clases para el tamaño "%s"', (size) => {
    render(<Button size={size}>Acción</Button>);
    expect(screen.getByRole('button', { name: 'Acción' })).toBeInTheDocument();
  });

  it('dispara onClick al hacer click', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<Button onClick={onClick}>Click</Button>);
    await user.click(screen.getByRole('button', { name: 'Click' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('es alcanzable y activable por teclado (Enter)', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<Button onClick={onClick}>Enviar</Button>);
    await user.tab();
    expect(screen.getByRole('button', { name: 'Enviar' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  describe('estado loading', () => {
    it('marca aria-busy y deshabilita el botón', () => {
      render(<Button loading>Guardar</Button>);
      const button = screen.getByRole('button');
      expect(button).toHaveAttribute('aria-busy', 'true');
      expect(button).toBeDisabled();
    });

    it('muestra el spinner', () => {
      render(<Button loading>Guardar</Button>);
      expect(screen.getByRole('status', { hidden: true })).toBeInTheDocument();
    });

    it('anuncia un texto de carga a lectores de pantalla', () => {
      render(
        <Button loading loadingText="Guardando socio">
          Guardar
        </Button>,
      );
      expect(screen.getByText('Guardando socio')).toBeInTheDocument();
    });

    it('no dispara onClick mientras está cargando', async () => {
      const onClick = vi.fn();
      const user = userEvent.setup();
      render(
        <Button loading onClick={onClick}>
          Guardar
        </Button>,
      );
      await user.click(screen.getByRole('button'));
      expect(onClick).not.toHaveBeenCalled();
    });
  });

  it('no tiene violaciones de accesibilidad detectables (axe)', async () => {
    const { container } = render(<Button>Guardar cambios</Button>);
    const results = await axe(container);
    expectNoAxeViolations(results);
  });
});
