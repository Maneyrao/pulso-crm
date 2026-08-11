import * as React from 'react';
import { cn } from '../lib/cn.js';

/**
 * Placeholder de carga con la forma final del contenido (evita layout shift,
 * ver FRONTEND_PLAN §9 — CLS < 0,05). `aria-hidden` porque el estado de carga
 * en sí lo anuncia el contenedor que la usa (ej. `aria-busy` en DataTable).
 */
export const Skeleton = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      aria-hidden="true"
      className={cn('animate-pulse rounded-(--radius-sm) bg-(--color-muted-subtle)', className)}
      {...props}
    />
  ),
);
Skeleton.displayName = 'Skeleton';
