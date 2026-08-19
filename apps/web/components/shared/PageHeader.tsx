import type { ComponentType, ReactNode } from 'react';
import { cn } from '@pulso/ui';
import { MockBadge } from './MockBadge';

export interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
  /** Acciones a la derecha (botones, contadores). */
  actions?: ReactNode;
  /** Página con datos de demostración: muestra el badge estándar. */
  mock?: boolean;
  className?: string;
}

/** Encabezado de página: icono en tile, título, subtítulo y acciones. */
export function PageHeader({ title, description, icon: Icon, actions, mock, className }: PageHeaderProps) {
  return (
    <div className={cn('mb-6 flex flex-wrap items-start justify-between gap-3', className)}>
      <div className="flex min-w-0 items-center gap-3">
        {Icon ? (
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-(--radius-lg) bg-(--color-primary-subtle) text-(--color-primary-subtle-foreground)">
            <Icon className="h-5.5 w-5.5" aria-hidden={true} />
          </span>
        ) : null}
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-2 text-(--text-2xl) font-bold tracking-tight text-(--color-text)">
            {title}
            {mock ? <MockBadge /> : null}
          </h1>
          {description ? <p className="mt-0.5 text-(--text-sm) text-(--color-muted)">{description}</p> : null}
        </div>
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
