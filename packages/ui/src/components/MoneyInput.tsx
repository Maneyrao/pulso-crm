import * as React from 'react';
import { isMoneyString, normalizeMoney } from '@pulso/config/money';
import { cn } from '../lib/cn.js';

/**
 * Prefijo válido de un decimal mientras se tipea: permite estados
 * intermedios ("-", "12.", "") que todavía no son un monto completo pero van
 * camino a serlo. No usa `MONEY_RE` de `@pulso/config` porque esa regex sólo
 * acepta el string ya terminado (con dígitos después del punto).
 */
const TYPING_RE = /^-?\d{0,12}(\.\d{0,2})?$/;

export interface MoneyInputProps extends Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange' | 'type'
> {
  /**
   * Importe como string decimal ("1234.50"). NUNCA `number`: ver ADR-010 y
   * `@pulso/config/money`. Este componente no hace una sola conversión a
   * `number` en ningún punto de su ciclo de vida.
   */
  value: string;
  /** Siempre recibe el string decimal actualizado, nunca un `number`. */
  onChange: (value: string) => void;
  invalid?: boolean;
}

export const MoneyInput = React.forwardRef<HTMLInputElement, MoneyInputProps>(
  ({ value, onChange, onBlur, invalid, className, ...props }, ref) => {
    const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
      const next = event.target.value;
      // Cualquier caracter que rompa el prefijo de un decimal se descarta acá:
      // como el input es controlado, el DOM vuelve a mostrar el último valor
      // válido en el siguiente render. Así se "rechaza" sin pelear el cursor.
      if (TYPING_RE.test(next)) {
        onChange(next);
      }
    };

    const handleBlur = (event: React.FocusEvent<HTMLInputElement>) => {
      // Normaliza sólo si ya es un monto completo y válido (agrega ceros de
      // relleno, ej. "5" -> "5.00"). Un estado incompleto ("12.", "-") queda
      // como está: la validación de "campo inválido" es responsabilidad de
      // quien use el componente (típicamente vía FormField + `invalid`).
      if (isMoneyString(value)) {
        const normalized = normalizeMoney(value);
        if (normalized !== value) onChange(normalized);
      }
      onBlur?.(event);
    };

    return (
      <input
        ref={ref}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={value}
        onChange={handleChange}
        onBlur={handleBlur}
        aria-invalid={invalid ? true : undefined}
        className={cn(
          'h-(--control-height-md) w-full rounded-(--radius-md) border bg-(--color-surface) px-3 text-right text-(--text-base) text-(--color-text) tabular-nums',
          'placeholder:text-(--color-muted) disabled:cursor-not-allowed disabled:opacity-50',
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)',
          invalid ? 'border-(--color-danger)' : 'border-(--color-border-strong)',
          className,
        )}
        {...props}
      />
    );
  },
);
MoneyInput.displayName = 'MoneyInput';
