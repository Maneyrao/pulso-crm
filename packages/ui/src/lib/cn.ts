import { type ClassValue, clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// Compatibilidad con consumidores anteriores: --text-* siempre es tamaño,
// nunca color. En componentes nuevos usamos text-(length:--text-*).
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [{ text: [(value: string) => /^\(--text-[\w-]+\)$/.test(value)] }],
    },
  },
});

/**
 * Combina clases condicionales (clsx) y resuelve conflictos de utilidades de
 * Tailwind (tailwind-merge) — por ejemplo, que un `className` que pasa el
 * consumidor pueda pisar el padding por defecto de un componente sin duplicar
 * la utilidad.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
