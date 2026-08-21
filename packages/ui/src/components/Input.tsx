import * as React from 'react';
import { cn } from '../lib/cn.js';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Marca de error visual (borde rojo). El cableado de `aria-invalid` real lo hace FormField. */
  invalid?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, invalid, ...props }, ref) => (
    <input
      ref={ref}
      className={cn(
        'h-(--control-height-md) w-full rounded-(--radius-md) border-2 bg-(--color-surface) px-3 text-(--text-base) text-(--color-text)',
        'placeholder:text-(--color-muted) disabled:cursor-not-allowed disabled:opacity-50',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)',
        invalid ? 'border-(--color-danger)' : 'border-(--color-border-strong)',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';
