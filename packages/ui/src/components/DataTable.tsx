import * as React from 'react';
import { cn } from '../lib/cn.js';
import { Skeleton } from './Skeleton.js';
import { EmptyState } from './EmptyState.js';
import { ErrorState } from './ErrorState.js';
import { Button } from './Button.js';

export interface DataTableColumn<T> {
  id: string;
  header: string;
  cell: (row: T) => React.ReactNode;
  headerClassName?: string;
  cellClassName?: string;
}

export interface DataTableProps<T> {
  columns: readonly DataTableColumn<T>[];
  data: readonly T[];
  rowKey: (row: T) => string;
  /** Obligatorio: toda tabla de datos tiene `<caption>` (FRONTEND_PLAN §6.4). */
  caption: string;
  loading?: boolean;
  /** Mensaje de error; si está presente se muestra ErrorState en vez de la tabla. */
  error?: string;
  onRetry?: () => void;
  /**
   * `true` cuando hay filtros/búsqueda activos. Con `data` vacío y esto en
   * `true`, se muestra "sin resultados" en vez de "sin datos" — son estados
   * distintos y no se confunden (FRONTEND_PLAN §6.4).
   */
  isFiltered?: boolean;
  onClearFilters?: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
  skeletonRows?: number;
  className?: string;
}

/**
 * Tabla genérica sin sorting server-side (por ahora). El tipo `T` lo trae
 * cada pantalla; `DataTable` no conoce el dominio, sólo columnas y filas.
 */
export function DataTable<T>({
  columns,
  data,
  rowKey,
  caption,
  loading = false,
  error,
  onRetry,
  isFiltered = false,
  onClearFilters,
  emptyTitle = 'Todavía no hay datos',
  emptyDescription,
  emptyAction,
  skeletonRows = 5,
  className,
}: DataTableProps<T>) {
  if (error) {
    return <ErrorState title="No pudimos cargar la tabla" description={error} onRetry={onRetry} />;
  }

  if (!loading && data.length === 0) {
    if (isFiltered) {
      return (
        <EmptyState
          title="Sin resultados"
          description="Ningún registro coincide con los filtros aplicados."
          action={
            onClearFilters ? (
              <Button variant="outline" size="sm" onClick={onClearFilters}>
                Limpiar filtros
              </Button>
            ) : undefined
          }
        />
      );
    }
    return <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />;
  }

  return (
    <div className={cn('overflow-x-auto rounded-(--radius-lg) border-2 border-(--color-border)', className)}>
      <table aria-busy={loading || undefined} className="w-full border-collapse text-[12.5px]">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.id}
                scope="col"
                className={cn(
                  'whitespace-nowrap border-b-2 border-(--color-border) px-3.5 py-2.5 text-left text-[11px] font-bold uppercase tracking-[0.08em] text-(--color-muted)',
                  column.headerClassName,
                )}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading
            ? Array.from({ length: skeletonRows }).map((_, rowIndex) => (
                // Placeholders sin identidad propia: el índice es una key estable válida acá.
                <tr key={rowIndex} className="border-b border-(--color-border) last:border-0">
                  {columns.map((column) => (
                    <td key={column.id} className="px-3.5 py-2.5">
                      <Skeleton className="h-4 w-full max-w-40" />
                    </td>
                  ))}
                </tr>
              ))
            : data.map((row) => (
                <tr
                  key={rowKey(row)}
                  className="border-b border-(--color-border) last:border-0 hover:bg-(--color-muted-subtle)"
                >
                  {columns.map((column) => (
                    <td key={column.id} className={cn('px-3.5 py-2.5 text-(--color-text)', column.cellClassName)}>
                      {column.cell(row)}
                    </td>
                  ))}
                </tr>
              ))}
        </tbody>
      </table>
    </div>
  );
}
