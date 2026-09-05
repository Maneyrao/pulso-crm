import * as React from 'react';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import { cva } from 'class-variance-authority';
import { cn } from '../lib/cn.js';

export type AlertTone = 'success' | 'warning' | 'danger' | 'info';

const ICON: Record<AlertTone, React.ComponentType<{ className?: string }>> = {
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: XCircle,
  info: Info,
};

const alertVariants = cva(
  'flex items-start gap-3 rounded-(--radius-md) border p-4 text-(length:--text-sm)',
  {
    variants: {
      tone: {
        success:
          'border-(--color-success) bg-(--color-success-subtle) text-(--color-success-subtle-foreground)',
        warning:
          'border-(--color-warning) bg-(--color-warning-subtle) text-(--color-warning-subtle-foreground)',
        danger:
          'border-(--color-danger) bg-(--color-danger-subtle) text-(--color-danger-subtle-foreground)',
        info: 'border-(--color-info) bg-(--color-info-subtle) text-(--color-info-subtle-foreground)',
      },
    },
    defaultVariants: { tone: 'info' },
  },
);

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: AlertTone;
  title?: string;
  /** `true` cuando el alert aparece dinámicamente (ej. tras una acción) y debe anunciarse. */
  live?: boolean;
}

export const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
  ({ className, tone = 'info', title, live = false, children, ...props }, ref) => {
    const Icon = ICON[tone];
    return (
      <div
        ref={ref}
        role={tone === 'danger' || tone === 'warning' ? 'alert' : 'status'}
        aria-live={live ? (tone === 'danger' ? 'assertive' : 'polite') : undefined}
        className={cn(alertVariants({ tone }), className)}
        {...props}
      >
        <Icon aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
        <div className="flex flex-col gap-0.5">
          {title ? <p className="font-medium">{title}</p> : null}
          <div>{children}</div>
        </div>
      </div>
    );
  },
);
Alert.displayName = 'Alert';
