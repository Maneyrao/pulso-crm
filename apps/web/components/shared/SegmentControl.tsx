'use client';

import { cn } from '@pulso/ui';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
}

export interface SegmentControlProps<T extends string> {
  options: readonly SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  'aria-label': string;
  className?: string;
}

/**
 * Filtro tipo "segmento" rectangular (LEODARROSAFIT_ALIGNMENT_PLAN.md §1):
 * botones contiguos con borde, uno activo a la vez. Reemplaza a los `Select`
 * de un solo filtro cuando las opciones son pocas y mutuamente excluyentes
 * (ej. Todos/Activos/En deuda/Vencidos).
 */
export function SegmentControl<T extends string>({
  options,
  value,
  onChange,
  className,
  ...aria
}: SegmentControlProps<T>) {
  return (
    <div role="group" className={cn('inline-flex flex-wrap', className)} {...aria}>
      {options.map((option, index) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'border px-3 py-2 text-(--text-xs) font-semibold tracking-wide uppercase transition-colors',
              index > 0 && '-ml-px',
              active
                ? 'border-(--color-primary) bg-(--color-primary-subtle) text-(--color-primary-subtle-foreground)'
                : 'border-(--color-border) bg-(--color-surface) text-(--color-muted) hover:text-(--color-text)',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
