import * as React from 'react';
import { Check } from 'lucide-react';
import { cn } from '../lib/cn.js';

export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type' | 'size'> {
  invalid?: boolean;
}

/**
 * Checkbox nativo (no primitivo de Radix) estilizado por encima: para este
 * control puntual el `<input type="checkbox">` real da foco, teclado y
 * `:checked` gratis, sin el costo de un componente controlado adicional.
 */
export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, invalid, ...props }, ref) => (
    <span className="relative inline-flex h-5 w-5 shrink-0 items-center justify-center">
      <input
        ref={ref}
        type="checkbox"
        className={cn(
          'peer h-5 w-5 shrink-0 cursor-pointer appearance-none rounded-(--radius-sm) border bg-(--color-surface)',
          'checked:bg-(--color-primary) checked:border-(--color-primary)',
          'disabled:cursor-not-allowed disabled:opacity-50',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)',
          invalid ? 'border-(--color-danger)' : 'border-(--color-border-strong)',
          className,
        )}
        {...props}
      />
      <Check
        aria-hidden="true"
        className="pointer-events-none absolute h-3.5 w-3.5 text-(--color-primary-foreground) opacity-0 peer-checked:opacity-100"
      />
    </span>
  ),
);
Checkbox.displayName = 'Checkbox';
