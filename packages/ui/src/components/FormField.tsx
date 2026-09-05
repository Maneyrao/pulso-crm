import * as React from 'react';
import { cn } from '../lib/cn.js';
import { Label } from './Label.js';

export interface FormFieldControlProps {
  id: string;
  'aria-describedby': string | undefined;
  'aria-invalid': true | undefined;
}

export interface FormFieldProps {
  /** Texto de la etiqueta, asociada al control vía `htmlFor`/`id`. */
  label: string;
  /** Mensaje de error. Si está presente, `aria-invalid` se activa y se anuncia con `role="alert"`. */
  error?: string;
  /** Texto de ayuda, visible incluso sin error. */
  hint?: string;
  required?: boolean;
  className?: string;
  /** id explícito del control; si no se pasa, se genera uno estable con `useId`. */
  id?: string;
  /**
   * Render prop: recibe las props ya calculadas (`id`, `aria-describedby`,
   * `aria-invalid`) para que el consumidor las spreadee sobre el control real
   * (Input, Select, Textarea, MoneyInput...). Evita adivinar el tipo de control.
   */
  children: (field: FormFieldControlProps) => React.ReactNode;
}

/**
 * Compone label + control + hint + error con el cableado de accesibilidad
 * completo: `aria-describedby` apunta a hint y/o error, `aria-invalid` sólo se
 * activa cuando hay error real (no por la sola presencia de la prop).
 */
export function FormField({
  label,
  error,
  hint,
  required,
  className,
  id,
  children,
}: FormFieldProps) {
  const generatedId = React.useId();
  const controlId = id ?? generatedId;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={controlId} required={required}>
        {label}
      </Label>
      {children({
        id: controlId,
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : undefined,
      })}
      {hint ? (
        <p id={hintId} className="text-(length:--text-sm) text-(--color-muted)">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-(length:--text-sm) text-(--color-danger)">
          {error}
        </p>
      ) : null}
    </div>
  );
}
