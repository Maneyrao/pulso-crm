import { FlaskConical } from 'lucide-react';

/**
 * Marca visible y honesta de página con datos de demostración: el backend de
 * este módulo todavía no existe (ver docs/CONTROLFIT_PARITY_AUDIT.md §2).
 */
export function MockBadge() {
  return (
    <span
      title="Este módulo muestra datos de demostración; el backend llega en una etapa posterior."
      className="inline-flex items-center gap-1 rounded-(--radius-full) border border-(--color-warning) bg-(--color-warning-subtle) px-2 py-0.5 text-(--text-xs) font-medium text-(--color-warning-subtle-foreground)"
    >
      <FlaskConical className="h-3 w-3" aria-hidden={true} />
      Demo
    </span>
  );
}
