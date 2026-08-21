'use client';

import * as React from 'react';
import { Skeleton } from '@pulso/ui';

export interface HourlyAttendancePoint {
  readonly occurredAt: string;
}

export interface HourlyAttendanceChartProps {
  /** Asistencias ya filtradas al rango que se quiere graficar (ej. las de hoy). */
  attendances: readonly HourlyAttendancePoint[];
  loading?: boolean;
  /** Franja horaria a mostrar, inclusive. Default 6→22 (LEODARROSAFIT_ALIGNMENT_PLAN.md Fase 2A). */
  hourFrom?: number;
  hourTo?: number;
}

/** Sólo se etiquetan estas horas debajo de las barras, igual que la referencia (06/10/14/18/22). */
const LABELED_HOURS = new Set([6, 10, 14, 18, 22]);

/**
 * "Afluencia por hora": bucketing client-side de asistencias por hora local
 * (misma convención que `computePeakHour` en members/attendance/page.tsx).
 * Compartido entre /dashboard y /stats — no vive en `packages/ui` porque es
 * específico de esta pantalla, no un primitivo de diseño reusable fuera de
 * la app (LEODARROSAFIT_ALIGNMENT_PLAN.md Fase 2A, misión "AFLUENCIA POR HORA").
 */
export function HourlyAttendanceChart({
  attendances,
  loading = false,
  hourFrom = 6,
  hourTo = 22,
}: HourlyAttendanceChartProps) {
  const buckets = React.useMemo(() => {
    const counts = new Map<number, number>();
    for (let hour = hourFrom; hour <= hourTo; hour += 1) counts.set(hour, 0);
    for (const record of attendances) {
      const hour = new Date(record.occurredAt).getHours();
      if (hour < hourFrom || hour > hourTo) continue;
      counts.set(hour, (counts.get(hour) ?? 0) + 1);
    }
    return Array.from(counts.entries()).map(([hour, count]) => ({ hour, count }));
  }, [attendances, hourFrom, hourTo]);

  if (loading) {
    return <Skeleton className="h-36 w-full" />;
  }

  const max = Math.max(1, ...buckets.map((b) => b.count));
  const total = buckets.reduce((acc, b) => acc + b.count, 0);
  const peak = buckets.reduce(
    (best, b) => (b.count > best.count ? b : best),
    buckets[0] ?? { hour: hourFrom, count: 0 },
  );

  if (total === 0) {
    return <p className="py-6 text-center text-(--text-sm) text-(--color-muted)">Todavía no hay ingresos hoy.</p>;
  }

  return (
    <figure>
      <div className="flex h-32 items-end gap-1">
        {buckets.map((b) => (
          <div key={b.hour} className="flex h-full flex-1 items-end">
            <div
              className="w-full bg-(--color-primary)"
              style={{ height: `${Math.max((b.count / max) * 100, b.count > 0 ? 4 : 0)}%` }}
              title={`${String(b.hour).padStart(2, '0')}:00 · ${b.count} ${b.count === 1 ? 'ingreso' : 'ingresos'}`}
            />
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-1">
        {buckets.map((b) => (
          <span key={b.hour} className="flex-1 text-center text-(--text-xs) tabular-nums text-(--color-muted)">
            {LABELED_HOURS.has(b.hour) ? String(b.hour).padStart(2, '0') : ''}
          </span>
        ))}
      </div>
      <figcaption className="sr-only">
        Afluencia por hora: {total} ingresos en total. La hora con más ingresos es{' '}
        {String(peak.hour).padStart(2, '0')}:00, con {peak.count} ingresos.
      </figcaption>
    </figure>
  );
}
