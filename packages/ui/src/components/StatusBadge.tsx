import * as React from 'react';
import { AlertTriangle, CheckCircle2, CircleHelp, Info, XCircle } from 'lucide-react';
import { cn } from '../lib/cn.js';
import { badgeVariants } from './Badge.js';

export type StatusTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

const DEFAULT_ICON: Record<StatusTone, React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>> = {
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: XCircle,
  info: Info,
  neutral: CircleHelp,
};

export interface StatusBadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone: StatusTone;
  /**
   * Texto obligatorio. Es una decisión deliberada del diseño (ver
   * FRONTEND_PLAN §8): un estado nunca se comunica sólo por color, así que no
   * hay overload sin `label` ni forma de omitirlo.
   */
  label: string;
  /** Ícono custom; por defecto uno coherente con el tono. */
  icon?: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>;
}

export const StatusBadge = React.forwardRef<HTMLSpanElement, StatusBadgeProps>(
  ({ className, tone, label, icon, ...props }, ref) => {
    const Icon = icon ?? DEFAULT_ICON[tone];
    return (
      <span ref={ref} className={cn(badgeVariants({ tone }), className)} {...props}>
        <Icon className="h-3.5 w-3.5" aria-hidden={true} />
        <span>{label}</span>
      </span>
    );
  },
);
StatusBadge.displayName = 'StatusBadge';
