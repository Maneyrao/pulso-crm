import * as React from 'react';
import * as LabelPrimitive from '@radix-ui/react-label';
import { cn } from '../lib/cn.js';

export interface LabelProps extends React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> {
  /** Marca visual (asterisco) y semántica de campo requerido. */
  required?: boolean;
}

export const Label = React.forwardRef<React.ElementRef<typeof LabelPrimitive.Root>, LabelProps>(
  ({ className, required, children, ...props }, ref) => (
    <LabelPrimitive.Root
      ref={ref}
      className={cn('text-(--text-sm) font-medium text-(--color-text)', className)}
      {...props}
    >
      {children}
      {required ? (
        <span aria-hidden="true" className="ml-0.5 text-(--color-danger)">
          *
        </span>
      ) : null}
    </LabelPrimitive.Root>
  ),
);
Label.displayName = 'Label';
