import * as React from 'react';
import { type VariantProps, cva } from 'class-variance-authority';
import { cn } from '../lib/cn.js';

export const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-(--radius-full) px-2.5 py-0.5 text-(--text-xs) font-medium',
  {
    variants: {
      tone: {
        neutral: 'bg-(--color-muted-subtle) text-(--color-muted-subtle-foreground)',
        primary: 'bg-(--color-primary-subtle) text-(--color-primary-subtle-foreground)',
        success: 'bg-(--color-success-subtle) text-(--color-success-subtle-foreground)',
        warning: 'bg-(--color-warning-subtle) text-(--color-warning-subtle-foreground)',
        danger: 'bg-(--color-danger-subtle) text-(--color-danger-subtle-foreground)',
        info: 'bg-(--color-info-subtle) text-(--color-info-subtle-foreground)',
      },
    },
    defaultVariants: { tone: 'neutral' },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, tone, ...props }, ref) => (
    <span ref={ref} className={cn(badgeVariants({ tone }), className)} {...props} />
  ),
);
Badge.displayName = 'Badge';
