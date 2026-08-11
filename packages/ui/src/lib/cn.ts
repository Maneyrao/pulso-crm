import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Combina clases condicionales (clsx) y resuelve conflictos de utilidades de
 * Tailwind (tailwind-merge) — por ejemplo, que un `className` que pasa el
 * consumidor pueda pisar el padding por defecto de un componente sin duplicar
 * la utilidad.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
