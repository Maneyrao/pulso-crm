'use client';

import * as React from 'react';

/**
 * Fecha y hora local en vivo, formato de la referencia: "13 de agosto ·
 * 09:12:45" con la hora en tabular-nums destacada. Se monta client-only
 * (estado inicial null) para no romper la hidratación con la hora del
 * servidor.
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
    <span className="whitespace-nowrap text-[12px] text-(--color-muted) tabular-nums">
      {date} · <span className="font-semibold text-(--color-text)">{time}</span>
    </span>
  );
}
