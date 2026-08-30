import * as React from 'react';
import { cn } from '../lib/cn.js';

export interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  action?: React.ReactNode;
}

/**
 * Estado "sin datos" (ej. gimnasio nuevo sin socios). Distinto de ErrorState y
 * del estado "sin resultados de filtro" — cada pantalla decide cuál mostrar
 * según corresponda (FRONTEND_PLAN §6.4: son estados que no se confunden).
 */
export const EmptyState = React.forwardRef<HTMLDivElement, EmptyStateProps>(
  ({ className, title, description, icon: Icon, action, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        'flex flex-col items-center gap-3 rounded-(--radius-lg) border border-dashed border-(--color-border) p-10 text-center',
        className,
      )}
      {...props}
    >
      {Icon ? <Icon aria-hidden={true} className="h-10 w-10 text-(--color-muted)" /> : null}
      <div className="flex flex-col gap-1">
        <p className="text-(--text-base) font-medium text-(--color-text)">{title}</p>
        {description ? (
          <p className="text-(--text-sm) text-(--color-muted)">{description}</p>
        ) : null}
      </div>
      {action ? <div className="mt-1">{action}</div> : null}
    </div>
  ),
);
EmptyState.displayName = 'EmptyState';
