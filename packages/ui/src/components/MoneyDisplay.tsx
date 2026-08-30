import * as React from 'react';
import { formatMoney, isNegativeMoney } from '@pulso/config/money';
import { cn } from '../lib/cn.js';

export interface MoneyDisplayProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'children'> {
  /** Importe como string decimal. NUNCA `number` (ADR-010). */
  value: string;
  currency?: string;
  locale?: string;
  /** Resalta en rojo cuando el importe es negativo (ej. saldo deudor). */
  emphasizeNegative?: boolean;
}

export const MoneyDisplay = React.forwardRef<HTMLSpanElement, MoneyDisplayProps>(
  (
    { value, currency = 'ARS', locale = 'es-AR', emphasizeNegative = false, className, ...props },
    ref,
  ) => {
    const formatted = formatMoney(value, { locale, currency });
    const negative = emphasizeNegative && isNegativeMoney(value);
    return (
      <span
        ref={ref}
        className={cn('tabular-nums', negative && 'text-(--color-danger) font-medium', className)}
        {...props}
      >
        {formatted}
      </span>
    );
  },
);
MoneyDisplay.displayName = 'MoneyDisplay';
