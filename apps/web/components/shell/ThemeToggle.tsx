'use client';

import * as React from 'react';
import { Moon, Sun } from 'lucide-react';

const THEME_KEY = 'pulso-theme';

/** Lee la preferencia guardada; sin preferencia, sigue al sistema. */
function resolveInitialDark(): boolean {
  try {
    const stored = window.localStorage.getItem(THEME_KEY);
    if (stored === 'dark') return true;
    if (stored === 'light') return false;
  } catch {
    // sin storage: sólo preferencia del sistema
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/**
 * Alterna la clase `dark` en <html> (los tokens `.dark` de tokens.css hacen
 * el resto). El script anti-parpadeo del layout raíz aplica la clase antes
 * del primer paint; este componente sólo la mantiene en sincronía.
 */
export function ThemeToggle() {
  const [dark, setDark] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    setDark(document.documentElement.classList.contains('dark') || resolveInitialDark());
  }, []);

  React.useEffect(() => {
    if (dark === null) return;
    document.documentElement.classList.toggle('dark', dark);
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
