import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from './DropdownMenu.js';

function DemoMenu({ onSelectEditar }: { onSelectEditar?: () => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger>Acciones</DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem onSelect={onSelectEditar}>Editar</DropdownMenuItem>
        <DropdownMenuItem>Eliminar</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

describe('DropdownMenu', () => {
  it('no muestra el contenido hasta que se abre', () => {
    render(<DemoMenu />);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('se abre al hacer click en el trigger', async () => {
    const user = userEvent.setup();
    render(<DemoMenu />);
    await user.click(screen.getByRole('button', { name: 'Acciones' }));
    expect(await screen.findByRole('menu')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Editar' })).toBeInTheDocument();
  });

  it('se navega con flechas y se selecciona con Enter', async () => {
    const onSelectEditar = vi.fn();
    const user = userEvent.setup();
    render(<DemoMenu onSelectEditar={onSelectEditar} />);
    await user.click(screen.getByRole('button', { name: 'Acciones' }));
    await screen.findByRole('menu');
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('menuitem', { name: 'Editar' })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(onSelectEditar).toHaveBeenCalledTimes(1);
  });

  it('cierra con Escape', async () => {
    const user = userEvent.setup();
    render(<DemoMenu />);
    await user.click(screen.getByRole('button', { name: 'Acciones' }));
    await screen.findByRole('menu');
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
  });
});
