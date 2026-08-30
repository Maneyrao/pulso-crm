import * as React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './Button.js';
import { Modal } from './Modal.js';

describe('Modal', () => {
  it('limita la ventana al viewport y deja contenido y acciones en zonas independientes', () => {
    render(
      <Modal
        open
        onOpenChange={vi.fn()}
        title="Editar socio"
        description="Datos personales"
        size="lg"
        footer={<Button>Guardar</Button>}
      >
        <div style={{ height: 1600 }}>Formulario extenso</div>
      </Modal>,
    );

    const dialog = screen.getByRole('dialog', { name: 'Editar socio' });
    expect(dialog).toHaveClass('max-h-[calc(100dvh-2rem)]', 'overflow-hidden', 'flex-col');

    const body = dialog.querySelector('[data-slot="modal-body"]');
    const footer = dialog.querySelector('[data-slot="modal-footer"]');
    expect(body).toHaveClass('min-h-0', 'overflow-y-auto', 'overscroll-contain');
    expect(footer).toHaveClass('shrink-0', 'flex-wrap');
    expect(within(footer as HTMLElement).getByRole('button', { name: 'Guardar' })).toBeVisible();
  });

  it('mantiene el cierre accesible y comunica el cambio al controlador', () => {
    const onOpenChange = vi.fn();
    render(
      <Modal open onOpenChange={onOpenChange} title="Ventana">
        Contenido
      </Modal>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
