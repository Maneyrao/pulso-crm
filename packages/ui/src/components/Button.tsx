import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { type VariantProps, cva } from 'class-variance-authority';
import { cn } from '../lib/cn.js';
import { Spinner } from './Spinner.js';

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-(--radius-md) font-medium ' +
    'transition-colors disabled:pointer-events-none disabled:opacity-50 ' +
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)',
  {
    variants: {
      variant: {
        primary: 'bg-(--color-primary) text-(--color-primary-foreground) hover:bg-(--color-primary-hover)',
        secondary:
          'bg-(--color-muted-subtle) text-(--color-muted-subtle-foreground) hover:bg-(--color-border)',
        outline:
          'border border-(--color-border-strong) bg-transparent text-(--color-text) hover:bg-(--color-muted-subtle)',
        ghost: 'bg-transparent text-(--color-text) hover:bg-(--color-muted-subtle)',
        danger: 'bg-(--color-danger) text-(--color-danger-foreground) hover:opacity-90',
      },
      size: {
        sm: 'h-(--control-height-sm) px-3 text-(--text-sm)',
        md: 'h-(--control-height-md) px-4 text-(--text-base)',
        lg: 'h-(--control-height-lg) px-6 text-(--text-lg)',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /** Renderiza el componente hijo en vez de un `<button>` (patrón Radix Slot). */
  asChild?: boolean;
  /** Muestra spinner y bloquea la interacción, preservando el layout del botón. */
  loading?: boolean;
  /** Texto anunciado a lectores de pantalla mientras `loading` está activo. */
  loadingText?: string;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant, size, asChild = false, loading = false, loadingText, disabled, children, ...props },
    ref,
  ) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp
        ref={ref}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        aria-disabled={disabled || loading || undefined}
        {...props}
      >
        {loading ? (
          <>
            <Spinner size="sm" aria-hidden="true" />
            <span className="sr-only">{loadingText ?? 'Cargando'}</span>
            {/* El contenido original queda oculto visualmente pero no del DOM,
                para no perder el ancho del botón (evita layout shift). */}
            <span aria-hidden="true">{children}</span>
          </>
        ) : (
          children
        )}
      </Comp>
    );
  },
);
Button.displayName = 'Button';
