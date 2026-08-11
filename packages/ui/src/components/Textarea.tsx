import * as React from 'react';
import { cn } from '../lib/cn.js';

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, invalid, rows = 4, ...props }, ref) => (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(
        'w-full rounded-(--radius-md) border bg-(--color-surface) px-3 py-2 text-(--text-base) text-(--color-text)',
        'placeholder:text-(--color-muted) disabled:cursor-not-allowed disabled:opacity-50',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)',
        invalid ? 'border-(--color-danger)' : 'border-(--color-border-strong)',
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = 'Textarea';
