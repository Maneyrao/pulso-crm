import * as React from 'react';
import { AlertTriangle } from 'lucide-react';
import { cn } from '../lib/cn.js';
import { Button } from './Button.js';

export interface ErrorStateProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
}

/** Estado de error con reintento opcional. Se anuncia como `alert` porque interrumpe una expectativa. */
export const ErrorState = React.forwardRef<HTMLDivElement, ErrorStateProps>(
  (
    {
      className,
      title = 'Ocurrió un error',
      description = 'No pudimos cargar la información. Probá de nuevo.',
      onRetry,
      retryLabel = 'Reintentar',
      ...props
    },
    ref,
  ) => (
    <div
      ref={ref}
      role="alert"
      className={cn('flex flex-col items-center gap-3 rounded-(--radius-lg) border border-(--color-danger) bg-(--color-danger-subtle) p-10 text-center', className)}
      {...props}
    >
      <AlertTriangle aria-hidden="true" className="h-10 w-10 text-(--color-danger-subtle-foreground)" />
      <div className="flex flex-col gap-1">
        <p className="text-(--text-base) font-medium text-(--color-danger-subtle-foreground)">{title}</p>
        <p className="text-(--text-sm) text-(--color-danger-subtle-foreground)">{description}</p>
      </div>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry} className="mt-1">
          {retryLabel}
        </Button>
      ) : null}
    </div>
  ),
);
ErrorState.displayName = 'ErrorState';
