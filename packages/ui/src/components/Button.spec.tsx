import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations } from '../lib/expectNoAxeViolations.js';
import { Button } from './Button.js';

describe('Button', () => {
  const colors = { primary: 'primary-foreground', secondary: 'text', outline: 'text', ghost: 'primary', danger: 'danger-foreground' } as const;
  for (const variant of ['primary', 'secondary', 'outline', 'ghost', 'danger'] as const) {
    it.each(['sm', 'md', 'lg'] as const)(`${variant} conserva foreground y tamaño %s`, (size) => {
      render(<Button variant={variant} size={size}>Acción</Button>);
      const button = screen.getByRole('button');
      expect(button).toHaveClass(`text-(--color-${colors[variant]})`);
      expect(button).toHaveClass(`text-(length:--text-${{ sm: 'sm', md: 'base', lg: 'lg' }[size]})`);
      expect(button).toHaveClass('duration-150', 'motion-reduce:transition-none');
    });
  }

  it('no envía un formulario sin type submit explícito', async () => {
    const submit = vi.fn((event) => event.preventDefault());
    render(<form onSubmit={submit}><Button>Cancelar</Button></form>);
    await userEvent.click(screen.getByRole('button'));
    expect(submit).not.toHaveBeenCalled();
  });

  it('loading con asChild conserva un solo enlace y bloquea navegación', async () => {
    const click = vi.fn();
    render(<Button asChild loading onClick={click}><a href="/cash">Caja</a></Button>);
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('aria-disabled', 'true');
    expect(link).toHaveAttribute('tabindex', '-1');
    await userEvent.click(link);
    expect(click).not.toHaveBeenCalled();
  });

  it('disabled asChild bloquea incluso el handler propio del enlace', async () => {
    const click = vi.fn();
    render(<Button asChild disabled><a href="/cash" onClick={click}>Caja</a></Button>);
    await userEvent.click(screen.getByRole('link'));
    expect(click).not.toHaveBeenCalled();
  });
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
