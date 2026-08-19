'use client';

import * as React from 'react';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns';
import { es } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Badge, Button, cn } from '@pulso/ui';

const WEEKDAY_HEADERS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

export interface MonthCalendarProps {
  /** Cualquier fecha dentro del mes a mostrar. */
  month: Date;
  onMonthChange: (month: Date) => void;
  /** yyyy-MM-dd → cantidad de reservas de ese día. */
  reservationsByDay: Record<string, number>;
  /** yyyy-MM-dd → etiqueta de excepción ("Feriado", "Mantenimiento", ...). */
  exceptionsByDay: Record<string, string>;
  onSelectDay?: (day: Date) => void;
  className?: string;
}

function dayKey(day: Date): string {
  return format(day, 'yyyy-MM-dd');
}

function pluralizeReservas(count: number): string {
  return `${count} reserva${count === 1 ? '' : 's'}`;
}

function buildDayAriaLabel(day: Date, count: number, exceptionLabel: string | undefined): string {
  const parts = [format(day, "d 'de' MMMM", { locale: es })];
  if (count > 0) parts.push(pluralizeReservas(count));
  if (exceptionLabel) parts.push(exceptionLabel);
  return parts.join(', ');
}

/**
 * Calendario mensual propio (sin dependencias nuevas): navegación mes a mes,
 * badges de reservas/feriados y día seleccionado. Usado por
 * `app/(app)/schedule/reservations`.
 */
export function MonthCalendar({
  month,
  onMonthChange,
  reservationsByDay,
  exceptionsByDay,
  onSelectDay,
  className,
}: MonthCalendarProps) {
  const [selectedDay, setSelectedDay] = React.useState<Date | undefined>(undefined);

  const gridStart = startOfWeek(startOfMonth(month), { weekStartsOn: 1 });
  const gridEnd = endOfWeek(endOfMonth(month), { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  const weeks: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }

  const monthLabel = format(month, 'MMMM yyyy', { locale: es });

  const handleSelectDay = (day: Date) => {
    setSelectedDay(day);
    onSelectDay?.(day);
  };

  return (
    <div className={cn('flex flex-col gap-4', className)}>
      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label="Mes anterior"
          onClick={() => onMonthChange(subMonths(month, 1))}
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </Button>
        <p className="text-(--text-lg) font-semibold capitalize text-(--color-text)" aria-live="polite">
          {monthLabel}
        </p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label="Mes siguiente"
          onClick={() => onMonthChange(addMonths(month, 1))}
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>

      <div role="grid" aria-label={`Calendario de ${monthLabel}`} className="flex flex-col gap-1">
        <div role="row" className="grid grid-cols-7 gap-1">
          {WEEKDAY_HEADERS.map((label) => (
            <div
              key={label}
              role="columnheader"
              className="px-1 py-1 text-center text-(--text-xs) font-medium text-(--color-muted)"
            >
              {label}
            </div>
          ))}
        </div>

        {weeks.map((week) => (
          <div key={dayKey(week[0]!)} role="row" className="grid grid-cols-7 gap-1">
            {week.map((day) => {
              const key = dayKey(day);
              const count = reservationsByDay[key] ?? 0;
              const exceptionLabel = exceptionsByDay[key];
              const inMonth = isSameMonth(day, month);
              const today = isToday(day);
              const selected = selectedDay ? isSameDay(day, selectedDay) : false;

              return (
                <button
                  key={key}
                  type="button"
                  role="gridcell"
                  aria-label={buildDayAriaLabel(day, count, exceptionLabel)}
                  aria-pressed={selected}
                  onClick={() => handleSelectDay(day)}
                  className={cn(
                    'flex min-h-20 flex-col items-start gap-1 rounded-(--radius-md) border border-transparent p-1.5 text-left',
                    'transition-transform hover:bg-(--color-muted-subtle) active:scale-[0.98]',
                    'motion-reduce:transition-none motion-reduce:active:scale-100',
                    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)',
                    inMonth ? 'text-(--color-text)' : 'text-(--color-muted) opacity-50',
                    today ? 'ring-2 ring-inset ring-(--color-primary)' : '',
                    selected ? 'bg-(--color-primary-subtle)' : '',
                  )}
                >
                  <span className="text-(--text-sm) font-medium tabular-nums">{format(day, 'd')}</span>
                  <div className="flex flex-col gap-0.5">
                    {count > 0 ? (
                      <Badge tone="info" className="whitespace-nowrap">
                        {pluralizeReservas(count)}
                      </Badge>
                    ) : null}
                    {exceptionLabel ? (
                      <Badge tone="warning" className="whitespace-nowrap">
                        {exceptionLabel}
                      </Badge>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
