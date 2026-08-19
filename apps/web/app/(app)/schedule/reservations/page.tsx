'use client';

import * as React from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { CalendarCheck, Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, EmptyState, Skeleton, StatusBadge } from '@pulso/ui';
import { PageHeader } from '@/components/shared/PageHeader';
import { PermissionGate } from '@/lib/auth/permissions';
import { useMockData } from '@/lib/mock/useMockData';
import { createMonthlyReservations, type DailyReservation } from '@/lib/mock/data/schedule-demo';
import { MonthCalendar } from '@/components/schedule/MonthCalendar';

/**
 * T-DEMO — Cronograma › Calendario de reservas. Página de demostración: el
 * backend de reservas todavía no existe (nav-items.ts la marca `mock: true`).
 */
export default function ScheduleReservationsPage() {
  return (
    <PermissionGate
      permission="reservation:read"
      fallback={
        <EmptyState title="Sin acceso" description="Tu usuario no tiene permiso para ver esta pantalla." />
      }
    >
      <ScheduleReservationsScreen />
    </PermissionGate>
  );
}

function ScheduleReservationsScreen() {
  // El mes que muestra el calendario arranca en `null` y se fija recién en el
  // cliente (mismo patrón que shell/LiveClock.tsx) para no romper la
  // hidratación con `new Date()` durante el render inicial.
  const [month, setMonth] = React.useState<Date | null>(null);
  const [selectedDay, setSelectedDay] = React.useState<Date | null>(null);

  React.useEffect(() => {
    setMonth(new Date());
  }, []);

  const { data, isLoading } = useMockData(() => createMonthlyReservations(new Date()));

  const selectedKey = selectedDay ? format(selectedDay, 'yyyy-MM-dd') : undefined;
  const dayReservations: DailyReservation[] = (selectedKey && data?.detailsByDay[selectedKey]) || [];
  const selectedException = selectedKey ? data?.exceptionsByDay[selectedKey] : undefined;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={CalendarCheck}
        title="Calendario de reservas"
        description="Visualizá la asistencia y reservas de los socios por día."
        mock
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        {isLoading || !month ? (
          <CalendarSkeleton />
        ) : (
          <MonthCalendar
            month={month}
            onMonthChange={setMonth}
            reservationsByDay={data?.reservationsByDay ?? {}}
            exceptionsByDay={data?.exceptionsByDay ?? {}}
            onSelectDay={setSelectedDay}
          />
        )}

        <Card className="h-fit">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-4 w-4 text-(--color-muted)" aria-hidden="true" />
              Reservas del día
            </CardTitle>
            {selectedDay ? (
              <p className="text-(--text-sm) capitalize text-(--color-muted)">
                {format(selectedDay, "EEEE d 'de' MMMM", { locale: es })}
              </p>
            ) : null}
          </CardHeader>
          <CardContent>
            {!selectedDay ? (
              <EmptyState
                title="Elegí un día"
                description="Seleccioná un día del calendario para ver sus reservas."
              />
            ) : dayReservations.length === 0 ? (
              <EmptyState
                title="Sin reservas"
                description={selectedException ? `${selectedException}: no hay actividad este día.` : 'Este día no tiene reservas cargadas.'}
              />
            ) : (
              <ul className="flex flex-col gap-3">
                {dayReservations.map((reservation) => (
                  <li
                    key={reservation.id}
                    className="flex items-center justify-between gap-2 border-b border-(--color-border) pb-3 last:border-0 last:pb-0"
                  >
                    <div className="flex flex-col">
                      <span className="text-(--text-sm) font-medium tabular-nums text-(--color-text)">
                        {reservation.time} · {reservation.activity}
                      </span>
                      <span className="text-(--text-sm) text-(--color-muted)">{reservation.memberName}</span>
                    </div>
                    <StatusBadge
                      tone={reservation.status === 'Confirmada' ? 'success' : 'danger'}
                      label={reservation.status}
                    />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function CalendarSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-8 w-8" />
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-8 w-8" />
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: 35 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    </div>
  );
}
