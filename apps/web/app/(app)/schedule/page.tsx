'use client';

import * as React from 'react';
import { CalendarClock } from 'lucide-react';
import { Badge, EmptyState, Select, Skeleton, type SelectOption } from '@pulso/ui';
import { PageHeader } from '@/components/shared/PageHeader';
import { PermissionGate } from '@/lib/auth/permissions';
import { useMockData } from '@/lib/mock/useMockData';
import { createScheduleSlots, WEEKDAYS, type ScheduleSlot } from '@/lib/mock/data/schedule-demo';

const ALL_ACTIVITIES = 'ALL';

/**
 * T-DEMO — Cronograma › Franjas horarias. Página de demostración: el backend
 * de reservas todavía no existe (nav-items.ts la marca con `mock: true`).
 */
export default function SchedulePage() {
  return (
    <PermissionGate
      permission="reservation:read"
      fallback={
        <EmptyState title="Sin acceso" description="Tu usuario no tiene permiso para ver esta pantalla." />
      }
    >
      <ScheduleScreen />
    </PermissionGate>
  );
}

function ScheduleScreen() {
  const { data: slots, isLoading } = useMockData(() => createScheduleSlots());
  const [activityFilter, setActivityFilter] = React.useState<string>(ALL_ACTIVITIES);

  const activityOptions: SelectOption[] = React.useMemo(() => {
    const activities = Array.from(new Set((slots ?? []).map((s) => s.activity))).sort();
    return [
      { value: ALL_ACTIVITIES, label: 'Todas las actividades' },
      ...activities.map((activity) => ({ value: activity, label: activity })),
    ];
  }, [slots]);

  const filteredSlots = React.useMemo(() => {
    if (!slots) return [];
    if (activityFilter === ALL_ACTIVITIES) return slots;
    return slots.filter((s) => s.activity === activityFilter);
  }, [slots, activityFilter]);

  const slotsByDay = React.useMemo(() => {
    const map = new Map<string, ScheduleSlot[]>();
    for (const day of WEEKDAYS) map.set(day, []);
    for (const slot of filteredSlots) {
      map.get(slot.day)?.push(slot);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.time.localeCompare(b.time));
    }
    return map;
  }, [filteredSlots]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={CalendarClock}
        title="Cronograma"
        description="Franjas horarias y cupos por actividad."
        mock
      />

      <div className="flex max-w-xs flex-col gap-1.5">
        <label htmlFor="schedule-activity-filter" className="text-(--text-sm) font-medium text-(--color-text)">
          Actividad
        </label>
        <Select
          id="schedule-activity-filter"
          options={activityOptions}
          value={activityFilter}
          onValueChange={setActivityFilter}
        />
      </div>

      {isLoading ? <ScheduleGridSkeleton /> : <ScheduleGrid slotsByDay={slotsByDay} />}
    </div>
  );
}

function ScheduleGrid({ slotsByDay }: { slotsByDay: Map<string, ScheduleSlot[]> }) {
  const hasAnySlot = Array.from(slotsByDay.values()).some((list) => list.length > 0);

  if (!hasAnySlot) {
    return (
      <EmptyState
        title="Sin franjas para esta actividad"
        description="Elegí otra actividad o mirá el cronograma completo."
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-7">
      {WEEKDAYS.map((day) => (
        <div key={day} className="flex flex-col gap-2">
          <p className="sticky top-0 text-(--text-sm) font-semibold text-(--color-text)">{day}</p>
          <div className="flex flex-col gap-2">
            {(slotsByDay.get(day) ?? []).length === 0 ? (
              <p className="text-(--text-xs) text-(--color-muted)">Sin franjas</p>
            ) : (
              slotsByDay.get(day)!.map((slot) => <ScheduleSlotCard key={slot.id} slot={slot} />)
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function ScheduleSlotCard({ slot }: { slot: ScheduleSlot }) {
  const hasRoom = slot.booked < slot.capacity;
  return (
    <div className="flex flex-col gap-1.5 rounded-(--radius-md) border border-(--color-border) bg-(--color-surface) p-3">
      <span className="text-(--text-sm) font-semibold tabular-nums text-(--color-text)">{slot.time}</span>
      <span className="text-(--text-sm) text-(--color-muted)">{slot.activity}</span>
      <Badge tone={hasRoom ? 'success' : 'danger'} className="w-fit tabular-nums">
        {slot.booked}/{slot.capacity}
      </Badge>
    </div>
  );
}

function ScheduleGridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-7">
      {WEEKDAYS.map((day) => (
        <div key={day} className="flex flex-col gap-2">
          <Skeleton className="h-4 w-10" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ))}
    </div>
  );
}
