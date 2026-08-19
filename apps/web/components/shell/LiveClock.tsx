'use client';

import * as React from 'react';
import { CalendarDays, Clock } from 'lucide-react';

/**
 * Fecha y hora local en vivo. Se monta client-only (estado inicial null)
 * para no romper la hidratación con la hora del servidor.
 */
export function LiveClock() {
  const [now, setNow] = React.useState<Date | null>(null);

  React.useEffect(() => {
    setNow(new Date());
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  if (!now) return null;

  const date = new Intl.DateTimeFormat('es-AR', { day: 'numeric', month: 'long' }).format(now);
  const time = new Intl.DateTimeFormat('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(now);

  return (
    <div className="hidden items-center gap-3 rounded-(--radius-full) border border-(--color-border) bg-(--color-bg) px-3 py-1.5 text-(--text-sm) text-(--color-text) md:flex">
      <span className="flex items-center gap-1.5">
        <CalendarDays className="h-3.5 w-3.5 text-(--color-muted)" aria-hidden={true} />
        {date}
      </span>
      <span aria-hidden={true} className="h-3.5 w-px bg-(--color-border-strong)" />
      <span className="flex items-center gap-1.5 tabular-nums">
        <Clock className="h-3.5 w-3.5 text-(--color-muted)" aria-hidden={true} />
        {time}
      </span>
    </div>
  );
}
