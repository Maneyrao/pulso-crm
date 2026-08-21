'use client';

import * as React from 'react';
import { Moon, Sun } from 'lucide-react';

const THEME_KEY = 'pulso-theme';

/**
 * Lee la preferencia guardada. Sin preferencia guardada el default de marca
 * es OSCURO (dark-first, ver LEODARROSAFIT_ALIGNMENT_PLAN.md §1): no se sigue
 * `prefers-color-scheme`, sólo `light` guardado explícitamente activa el
 * tema claro.
 */
function resolveInitialDark(): boolean {
  try {
    return window.localStorage.getItem(THEME_KEY) !== 'light';
  } catch {
    return true;
  }
}

/**
 * Alterna la clase `light` en <html> (los tokens de tokens.css son oscuros
 * por defecto; `.light` los sobreescribe). El script anti-parpadeo del
 * layout raíz aplica la clase antes del primer paint; este componente sólo
 * la mantiene en sincronía.
 */
export function ThemeToggle() {
  const [dark, setDark] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    setDark(!document.documentElement.classList.contains('light') && resolveInitialDark());
  }, []);

  React.useEffect(() => {
    if (dark === null) return;
    document.documentElement.classList.toggle('light', !dark);
    try {
      window.localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light');
    } catch {
      // preferencia no persistida
    }
  }, [dark]);

  if (dark === null) return null;

  return (
    <button
      type="button"
      onClick={() => setDark(!dark)}
      aria-label={dark ? 'Cambiar a tema claro' : 'Cambiar a tema oscuro'}
      title={dark ? 'Tema claro' : 'Tema oscuro'}
      className="rounded-(--radius-md) p-2 text-(--color-muted) transition-colors hover:bg-(--color-muted-subtle) hover:text-(--color-text)"
    >
      {dark ? <Sun className="h-4 w-4" aria-hidden={true} /> : <Moon className="h-4 w-4" aria-hidden={true} />}
    </button>
  );
}
