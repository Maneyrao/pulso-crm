import * as React from 'react';
import { cn } from '../lib/cn.js';

const SIZES = {
  sm: 'h-4 w-4 border-2',
  md: 'h-6 w-6 border-2',
  lg: 'h-8 w-8 border-[3px]',
} as const;

export interface SpinnerProps extends React.HTMLAttributes<HTMLSpanElement> {
  size?: keyof typeof SIZES;
}

/**
 * Indicador de carga puramente visual. El texto anunciado a lectores de
 * pantalla lo aporta quien lo usa (ej. Button ya agrega su propio `sr-only`),
 * por eso acá el spinner es `aria-hidden` salvo que el consumidor lo pise.
 */
export const Spinner = React.forwardRef<HTMLSpanElement, SpinnerProps>(
  ({ className, size = 'md', 'aria-hidden': ariaHidden = true, ...props }, ref) => (
    <span
      ref={ref}
      role="status"
      aria-hidden={ariaHidden}
      className={cn(
        'inline-block animate-spin rounded-full border-current border-t-transparent text-current',
        SIZES[size],
        className,
      )}
      {...props}
    />
  ),
);
Spinner.displayName = 'Spinner';
