import * as React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations } from '../lib/expectNoAxeViolations.js';
import { ConfirmDialog } from './ConfirmDialog.js';

function ControlledConfirmDialog(props: Partial<React.ComponentProps<typeof ConfirmDialog>>) {
  const [open, setOpen] = React.useState(true);
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={setOpen}
      title="Eliminar plan"
      onConfirm={() => {}}
      {...props}
    />
  );
}

describe('ConfirmDialog', () => {
  it('no renderiza el contenido cuando está cerrado', () => {
    render(<ConfirmDialog open={false} onOpenChange={() => {}} title="Eliminar plan" onConfirm={() => {}} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('muestra título y descripción cuando está abierto', () => {
    render(
      <ConfirmDialog
        open
        onOpenChange={() => {}}
        title="Eliminar plan"
        description="Esta acción no se puede deshacer."
        onConfirm={() => {}}
      />,
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('Eliminar plan')).toBeInTheDocument();
    expect(screen.getByText('Esta acción no se puede deshacer.')).toBeInTheDocument();
  });

  it('cierra al hacer click en Cancelar', async () => {
    const user = userEvent.setup();
    render(<ControlledConfirmDialog />);
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('cierra con Escape', async () => {
    const user = userEvent.setup();
    render(<ControlledConfirmDialog />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('sin requireTextConfirmation, el botón de confirmar está habilitado y dispara onConfirm', async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();
    render(<ControlledConfirmDialog onConfirm={onConfirm} confirmLabel="Eliminar" />);
    const confirmButton = screen.getByRole('button', { name: 'Eliminar' });
    expect(confirmButton).toBeEnabled();
    await user.click(confirmButton);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  describe('con requireTextConfirmation', () => {
    it('el botón de confirmar arranca deshabilitado', () => {
      render(
        <ControlledConfirmDialog
          confirmLabel="Eliminar"
          tone="danger"
          requireTextConfirmation="ELIMINAR"
        />,
      );
      expect(screen.getByRole('button', { name: 'Eliminar' })).toBeDisabled();
    });

    it('sigue deshabilitado si el texto no coincide exactamente', async () => {
      const user = userEvent.setup();
      render(
        <ControlledConfirmDialog confirmLabel="Eliminar" tone="danger" requireTextConfirmation="ELIMINAR" />,
      );
      await user.type(screen.getByRole('textbox'), 'eliminar');
      expect(screen.getByRole('button', { name: 'Eliminar' })).toBeDisabled();
    });

    it('se habilita y confirma sólo cuando el texto coincide exactamente', async () => {
      const onConfirm = vi.fn();
      const user = userEvent.setup();
      render(
        <ControlledConfirmDialog
          onConfirm={onConfirm}
          confirmLabel="Eliminar"
          tone="danger"
          requireTextConfirmation="ELIMINAR"
        />,
      );
      await user.type(screen.getByRole('textbox'), 'ELIMINAR');
      const confirmButton = screen.getByRole('button', { name: 'Eliminar' });
      expect(confirmButton).toBeEnabled();
      await user.click(confirmButton);
      expect(onConfirm).toHaveBeenCalledTimes(1);
    });
  });

  it('no tiene violaciones de accesibilidad detectables (axe)', async () => {
    const { container } = render(
      <ConfirmDialog
        open
        onOpenChange={() => {}}
        title="Eliminar plan"
        description="Esta acción no se puede deshacer."
        onConfirm={() => {}}
      />,
    );
    const results = await axe(container);
    expectNoAxeViolations(results);
  });
});
