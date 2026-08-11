import * as React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '../lib/cn.js';
import { Button } from './Button.js';

export interface PaginationProps extends React.HTMLAttributes<HTMLElement> {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  /** Total de items, para el texto "X–Y de Z" (opcional; si falta, se omite el resumen). */
  totalItems?: number;
  pageSize?: number;
}

/** Paginación offset. Para cursor, el consumidor maneja el cursor y sólo usa `onPageChange` como "siguiente/anterior". */
export function Pagination({
  className,
  page,
  pageCount,
  onPageChange,
  totalItems,
  pageSize,
  ...props
}: PaginationProps) {
  const canGoPrev = page > 1;
  const canGoNext = page < pageCount;

  const summary =
    totalItems !== undefined && pageSize !== undefined
      ? (() => {
          const from = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
          const to = Math.min(page * pageSize, totalItems);
          return `${from}–${to} de ${totalItems}`;
        })()
      : undefined;

  return (
    <nav aria-label="Paginación" className={cn('flex items-center justify-between gap-4', className)} {...props}>
      {summary ? <p className="text-(--text-sm) text-(--color-muted)">{summary}</p> : <span />}
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page - 1)}
          disabled={!canGoPrev}
          aria-label="Página anterior"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </Button>
        <span className="text-(--text-sm) text-(--color-text)" aria-current="page">
          {page} / {Math.max(pageCount, 1)}
        </span>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page + 1)}
          disabled={!canGoNext}
          aria-label="Página siguiente"
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </nav>
  );
}
