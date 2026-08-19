/**
 * Dataset determinista para el módulo demo de Cronograma / Reservas
 * (docs/CONTROLFIT_PARITY_AUDIT.md §2 — todavía no hay backend de reservas).
 *
 * Regla dura: nada de `new Date()` acá arriba (nivel de módulo) — rompe la
 * hidratación porque el server y el cliente calcularían fechas relativas
 * distintas. Las fechas relativas al "mes actual" se generan dentro de
 * `createMonthlyReservations`, que sólo se invoca desde el factory que le
 * pasamos a `useMockData` (ejecuta en el cliente, después del mount).
 */

import { eachDayOfInterval, endOfMonth, format, startOfMonth } from 'date-fns';

// ---------------------------------------------------------------------------
// Franjas horarias semanales
// ---------------------------------------------------------------------------

export const WEEKDAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export const SCHEDULE_ACTIVITIES = [
  'CrossFit',
  'Funcional',
  'Pilates',
  'Spinning',
  'Musculación libre',
] as const;
export type ScheduleActivity = (typeof SCHEDULE_ACTIVITIES)[number];

export interface ScheduleSlot {
  id: string;
  day: Weekday;
  time: string;
  activity: ScheduleActivity;
  capacity: number;
  booked: number;
}

// [día, hora, actividad, cupo, ocupado]
const RAW_SLOTS: ReadonlyArray<[Weekday, string, ScheduleActivity, number, number]> = [
  ['Lun', '07:00', 'Musculación libre', 20, 9],
  ['Lun', '08:00', 'CrossFit', 15, 12],
  ['Lun', '09:00', 'Funcional', 12, 12],
  ['Lun', '18:00', 'Spinning', 18, 14],
  ['Lun', '19:00', 'Pilates', 14, 6],
  ['Mar', '07:00', 'Funcional', 12, 8],
  ['Mar', '08:00', 'Pilates', 14, 14],
  ['Mar', '18:00', 'CrossFit', 15, 15],
  ['Mar', '19:00', 'Musculación libre', 20, 11],
  ['Mié', '07:00', 'Musculación libre', 20, 5],
  ['Mié', '08:00', 'CrossFit', 15, 10],
  ['Mié', '09:00', 'Funcional', 12, 12],
  ['Mié', '18:00', 'Spinning', 18, 17],
  ['Mié', '19:00', 'Pilates', 14, 9],
  ['Jue', '07:00', 'Funcional', 12, 7],
  ['Jue', '08:00', 'Pilates', 14, 13],
  ['Jue', '18:00', 'CrossFit', 15, 15],
  ['Jue', '19:00', 'Musculación libre', 20, 8],
  ['Vie', '07:00', 'Musculación libre', 20, 6],
  ['Vie', '08:00', 'CrossFit', 15, 9],
  ['Vie', '18:00', 'Spinning', 18, 18],
  ['Vie', '19:00', 'Funcional', 12, 10],
  ['Sáb', '09:00', 'CrossFit', 15, 7],
  ['Sáb', '10:00', 'Funcional', 12, 5],
  ['Sáb', '11:00', 'Musculación libre', 20, 4],
  ['Dom', '10:00', 'Pilates', 14, 3],
  ['Dom', '11:00', 'Musculación libre', 20, 2],
];

/** Franjas horarias del cronograma semanal. Factory pura, sin `Date`. */
export function createScheduleSlots(): ScheduleSlot[] {
  return RAW_SLOTS.map(([day, time, activity, capacity, booked], index) => ({
    id: `slot-${index + 1}`,
    day,
    time,
    activity,
    capacity,
    booked,
  }));
}

// ---------------------------------------------------------------------------
// Excepciones y feriados (Argentina 2026)
// ---------------------------------------------------------------------------

/**
 * Tipo "rico" del dataset. La página de Excepciones lo condensa a dos badges
 * (Feriado / Especial): `Feriado Nacional` → warning "Feriado"; `Mantenimiento`
 * y `Horario reducido` → info "Especial". El `motivo` conserva el detalle.
 */
export type ScheduleExceptionType = 'Feriado Nacional' | 'Mantenimiento' | 'Horario reducido';

export interface ScheduleException {
  id: string;
  date: string; // yyyy-MM-dd
  type: ScheduleExceptionType;
  reason: string;
  branch: string;
}

// [fecha, tipo, motivo, sede]
const RAW_EXCEPTIONS: ReadonlyArray<[string, ScheduleExceptionType, string, string]> = [
  ['2026-01-01', 'Feriado Nacional', 'Año Nuevo', 'Sede Centro'],
  ['2026-02-16', 'Feriado Nacional', 'Carnaval', 'Sede Centro'],
  ['2026-03-24', 'Feriado Nacional', 'Día Nacional de la Memoria por la Verdad y la Justicia', 'Sede Norte'],
  ['2026-04-02', 'Feriado Nacional', 'Día del Veterano y de los Caídos en la Guerra de Malvinas', 'Sede Centro'],
  ['2026-04-03', 'Feriado Nacional', 'Viernes Santo', 'Sede Norte'],
  ['2026-05-01', 'Feriado Nacional', 'Día del Trabajador', 'Sede Centro'],
  ['2026-05-25', 'Feriado Nacional', 'Día de la Revolución de Mayo', 'Sede Norte'],
  ['2026-06-15', 'Mantenimiento', 'Corte de suministro eléctrico programado por la distribuidora', 'Sede Centro'],
  ['2026-07-09', 'Feriado Nacional', 'Día de la Independencia', 'Sede Centro'],
  ['2026-07-20', 'Horario reducido', 'Refacción del sector de pesas: cierre 20 a 22 h', 'Sede Norte'],
  ['2026-08-17', 'Feriado Nacional', 'Paso a la Inmortalidad del Gral. José de San Martín', 'Sede Centro'],
  ['2026-10-12', 'Feriado Nacional', 'Día del Respeto a la Diversidad Cultural', 'Sede Norte'],
  ['2026-12-08', 'Feriado Nacional', 'Inmaculada Concepción de María', 'Sede Centro'],
  ['2026-12-25', 'Feriado Nacional', 'Navidad', 'Sede Centro'],
];

/** Excepciones/feriados del calendario. Factory pura, sin `Date`. */
export function createScheduleExceptions(): ScheduleException[] {
  return RAW_EXCEPTIONS.map(([date, type, reason, branch], index) => ({
    id: `exception-${index + 1}`,
    date,
    type,
    reason,
    branch,
  }));
}

/** Etiqueta corta para mostrar en el badge de `MonthCalendar` según el tipo de excepción. */
export function exceptionShortLabel(type: ScheduleExceptionType): string {
  return type === 'Feriado Nacional' ? 'Feriado' : type;
}

// ---------------------------------------------------------------------------
// Reservas del mes actual
// ---------------------------------------------------------------------------

export type ReservationStatus = 'Confirmada' | 'Cancelada';

export interface DailyReservation {
  id: string;
  time: string;
  activity: ScheduleActivity;
  memberName: string;
  status: ReservationStatus;
}

export interface MonthlyReservationsDataset {
  /** yyyy-MM-dd → cantidad de reservas del día (0-18). */
  reservationsByDay: Record<string, number>;
  /** yyyy-MM-dd → etiqueta de excepción ("Feriado", "Mantenimiento", "Horario reducido"). */
  exceptionsByDay: Record<string, string>;
  /** yyyy-MM-dd → detalle de reservas (hora, actividad, socio, estado). */
  detailsByDay: Record<string, DailyReservation[]>;
}

const MEMBER_NAMES = [
  'Bruno García',
  'Lucía Fernández',
  'Martín Álvarez',
  'Sofía Romero',
  'Nicolás Torres',
  'Camila Díaz',
  'Agustín Pérez',
  'Valentina Ruiz',
  'Tomás Sosa',
  'Julieta Molina',
  'Franco Ledesma',
  'Micaela Acosta',
  'Ezequiel Vega',
  'Antonella Rojas',
  'Federico Núñez',
];

/** Patrón fijo de reservas por día del mes (0-18), con varios días en 0. */
const COUNT_PATTERN = [
  0, 3, 7, 12, 0, 5, 9, 14, 2, 0, 6, 10, 15, 3, 0, 8, 11, 18, 4, 0, 7, 13, 1, 0, 9, 16, 5, 0, 10, 14, 6,
];

const TIME_SLOTS = ['07:00', '08:00', '09:00', '18:00', '19:00'];

/**
 * Genera las reservas del mes de `anchor` de forma determinista (mismo mes →
 * mismos números). Se llama desde el factory de `useMockData`, nunca en el
 * cuerpo del módulo, así que usar `anchor` (que en la práctica es `new Date()`)
 * es seguro para la hidratación.
 */
export function createMonthlyReservations(anchor: Date): MonthlyReservationsDataset {
  const monthStart = startOfMonth(anchor);
  const monthEnd = endOfMonth(anchor);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const exceptions = createScheduleExceptions();
  const exceptionsByDate = new Map(exceptions.map((e) => [e.date, e]));

  const reservationsByDay: Record<string, number> = {};
  const exceptionsByDay: Record<string, string> = {};
  const detailsByDay: Record<string, DailyReservation[]> = {};

  for (const day of days) {
    const key = format(day, 'yyyy-MM-dd');
    const dayOfMonth = Number(format(day, 'd'));
    const exception = exceptionsByDate.get(key);

    if (exception) {
      exceptionsByDay[key] = exceptionShortLabel(exception.type);
    }

    // Los feriados y mantenimientos no tienen reservas; el resto sigue el patrón.
    const count = exception ? 0 : (COUNT_PATTERN[(dayOfMonth - 1) % COUNT_PATTERN.length] ?? 0);
    reservationsByDay[key] = count;

    if (count > 0) {
      detailsByDay[key] = Array.from({ length: count }, (_, i) => {
        const time = TIME_SLOTS[(dayOfMonth + i) % TIME_SLOTS.length] ?? '08:00';
        const activity = SCHEDULE_ACTIVITIES[(dayOfMonth + i) % SCHEDULE_ACTIVITIES.length] ?? 'CrossFit';
        const memberName = MEMBER_NAMES[(dayOfMonth * 3 + i) % MEMBER_NAMES.length] ?? 'Socio Demo';
        const status: ReservationStatus = (dayOfMonth + i) % 6 === 0 ? 'Cancelada' : 'Confirmada';
        return {
          id: `${key}-reserva-${i + 1}`,
          time,
          activity,
          memberName,
          status,
        };
      }).sort((a, b) => a.time.localeCompare(b.time));
    }
  }

  return { reservationsByDay, exceptionsByDay, detailsByDay };
}
