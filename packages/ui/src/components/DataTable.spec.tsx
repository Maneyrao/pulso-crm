import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { describe, expect, it, vi } from 'vitest';
import { expectNoAxeViolations } from '../lib/expectNoAxeViolations.js';
import { DataTable, type DataTableColumn } from './DataTable.js';

interface Member {
  id: string;
  name: string;
}

const columns: DataTableColumn<Member>[] = [
  { id: 'name', header: 'Nombre', cell: (row) => row.name },
];

const members: Member[] = [
  { id: '1', name: 'Ana Pérez' },
  { id: '2', name: 'Luis Gómez' },
];

describe('DataTable', () => {
  it('renderiza las filas de datos con sus columnas', () => {
    render(<DataTable columns={columns} data={members} rowKey={(m) => m.id} caption="Socios" />);
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByText('Ana Pérez')).toBeInTheDocument();
    expect(screen.getByText('Luis Gómez')).toBeInTheDocument();
    expect(screen.getAllByRole('row')).toHaveLength(3); // encabezado + 2 filas
  });

  it('incluye un <caption> semántico', () => {
    render(<DataTable columns={columns} data={members} rowKey={(m) => m.id} caption="Listado de socios" />);
    expect(screen.getByText('Listado de socios')).toBeInTheDocument();
  });

  it('muestra un esqueleto de carga con aria-busy y sin filas de datos', () => {
    render(<DataTable columns={columns} data={[]} rowKey={(m) => m.id} caption="Socios" loading />);
    expect(screen.getByRole('table')).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByText('Ana Pérez')).not.toBeInTheDocument();
  });

  it('estado "sin datos": gimnasio sin socios aún, sin filtros activos', () => {
    render(<DataTable columns={columns} data={[]} rowKey={(m) => m.id} caption="Socios" emptyTitle="Todavía no hay socios" />);
    expect(screen.getByText('Todavía no hay socios')).toBeInTheDocument();
    expect(screen.queryByText('Sin resultados')).not.toBeInTheDocument();
  });

  it('estado "sin resultados": distinto del "sin datos" cuando hay filtros activos', () => {
    const onClearFilters = vi.fn();
    render(
      <DataTable
        columns={columns}
        data={[]}
        rowKey={(m) => m.id}
        caption="Socios"
        isFiltered
        onClearFilters={onClearFilters}
        emptyTitle="Todavía no hay socios"
      />,
    );
    expect(screen.getByText('Sin resultados')).toBeInTheDocument();
    expect(screen.queryByText('Todavía no hay socios')).not.toBeInTheDocument();
  });

  it('el botón "Limpiar filtros" del estado sin resultados dispara el callback', async () => {
    const onClearFilters = vi.fn();
    const user = userEvent.setup();
    render(
      <DataTable columns={columns} data={[]} rowKey={(m) => m.id} caption="Socios" isFiltered onClearFilters={onClearFilters} />,
    );
    await user.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    expect(onClearFilters).toHaveBeenCalledTimes(1);
  });

  it('estado de error: no renderiza la tabla y ofrece reintentar', async () => {
    const onRetry = vi.fn();
    const user = userEvent.setup();
    render(
      <DataTable columns={columns} data={[]} rowKey={(m) => m.id} caption="Socios" error="Falló la carga" onRetry={onRetry} />,
    );
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('no tiene violaciones de accesibilidad detectables (axe) con datos', async () => {
    const { container } = render(<DataTable columns={columns} data={members} rowKey={(m) => m.id} caption="Socios" />);
    const results = await axe(container);
    expectNoAxeViolations(results);
  });
});
