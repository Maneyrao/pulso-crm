'use client';

import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { type VariantProps, cva } from 'class-variance-authority';
import { cn } from '../lib/cn.js';
import { Spinner } from './Spinner.js';

/**
 * Variantes (LEODARROSAFIT_ALIGNMENT_PLAN.md §1 y D): `primary` es la acción
 * sólida uppercase/extrabold tipo "REGISTRAR" de la referencia; `secondary`
 * y `outline` son bordeadas sin relleno (`.btn-secondary` del sistema
 * Modernist); `ghost` es texto color acento sin borde (`.btn-ghost`).
 */
export const buttonVariants = cva(
  'relative inline-flex max-w-full items-center justify-center gap-2 whitespace-normal rounded-(--radius-md) text-center font-semibold ' +
    'transition-colors duration-150 motion-reduce:transition-none disabled:pointer-events-none disabled:opacity-50 ' +
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)',
  {
    variants: {
      variant: {
        primary:
          'bg-(--color-primary) font-extrabold text-(--color-primary-foreground) hover:bg-(--color-primary-hover) active:bg-(--color-primary-active)',
        secondary:
          'border-2 border-(--color-border-strong) bg-transparent text-(--color-text) hover:bg-(--color-muted-subtle)',
        outline:
          'border-2 border-(--color-border) bg-transparent text-(--color-text) hover:bg-(--color-muted-subtle)',
        ghost: 'bg-transparent text-(--color-primary) hover:bg-(--color-primary-subtle)',
        danger: 'bg-(--color-danger) text-(--color-danger-foreground) hover:opacity-90',
      },
      size: {
        sm: 'min-h-(--control-height-sm) px-3 py-1 text-(length:--text-sm)',
        md: 'min-h-(--control-height-md) px-4 py-1.5 text-(length:--text-base)',
        lg: 'min-h-(--control-height-lg) px-6 py-2 text-(length:--text-lg)',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  /** Renderiza el componente hijo en vez de un `<button>` (patrón Radix Slot). */
  asChild?: boolean;
  /** Muestra spinner y bloquea la interacción, preservando el layout del botón. */
  loading?: boolean;
  /** Texto anunciado a lectores de pantalla mientras `loading` está activo. */
  loadingText?: string;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      loading = false,
      loadingText,
      disabled,
      children,
      onClick,
      type,
      ...props
    },
    ref,
  ) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        ref={ref}
        type={asChild ? undefined : (type ?? 'button')}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        aria-disabled={disabled || loading || undefined}
        {...props}
        onClickCapture={(event) => {
          if (disabled || loading) {
            event.preventDefault();
            event.stopPropagation();
            return;
          }
          props.onClickCapture?.(event);
        }}
        onClick={(event) => {
          if (disabled || loading) {
            event.preventDefault();
            event.stopPropagation();
            return;
          }
          onClick?.(event);
        }}
        tabIndex={asChild && (disabled || loading) ? -1 : props.tabIndex}
      >
        {loading && !asChild ? (
          <>
            <span className="absolute inset-0 flex items-center justify-center">
              <Spinner size="sm" aria-hidden="true" />
            </span>
            <span className="sr-only">{loadingText ?? 'Cargando'}</span>
            {/* El contenido original queda oculto visualmente pero no del DOM,
                para no perder el ancho del botón (evita layout shift). */}
            <span aria-hidden="true" className="invisible inline-flex items-center gap-2">{children}</span>
          </>
        ) : (
          children
        )}
      </Comp>
    );
  },
);
Button.displayName = 'Button';
