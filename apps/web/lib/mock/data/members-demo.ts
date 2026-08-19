/**
 * Dataset determinista para las páginas demo de socios (asistencias, baja de
 * socios y entrenamientos). Sin backend todavía — ver
 * docs/CONTROLFIT_PARITY_AUDIT.md §2. Nada de `Math.random()`: todos los
 * valores están fijos para que el render sea igual en server y cliente.
 */

export interface DemoMember {
  id: string;
  firstName: string;
  lastName: string;
  dni: string;
  email: string;
  phone: string;
  plan: string;
}

/** Roster base: ~25 socios argentinos, usado como fuente para las tres páginas. */
export const MEMBERS_DEMO: readonly DemoMember[] = [
  { id: 'mem-01', firstName: 'Bruno', lastName: 'García', dni: '34567890', email: 'bruno.garcia@gmail.com', phone: '+54 9 11 4321-0987', plan: 'Musculación' },
  { id: 'mem-02', firstName: 'Lucía', lastName: 'Fernández', dni: '29876543', email: 'lucia.fernandez@gmail.com', phone: '+54 9 11 4456-1234', plan: 'Full' },
  { id: 'mem-03', firstName: 'Martín', lastName: 'Rodríguez', dni: '31234567', email: 'martin.rodriguez@gmail.com', phone: '+54 9 11 4789-3456', plan: 'CrossFit' },
  { id: 'mem-04', firstName: 'Sofía', lastName: 'Gómez', dni: '40123456', email: 'sofia.gomez@gmail.com', phone: '+54 9 11 4012-7788', plan: 'Pilates' },
  { id: 'mem-05', firstName: 'Nicolás', lastName: 'Pérez', dni: '27890123', email: 'nicolas.perez@gmail.com', phone: '+54 9 11 4654-2211', plan: '3 veces/semana' },
  { id: 'mem-06', firstName: 'Valentina', lastName: 'López', dni: '38456789', email: 'valentina.lopez@gmail.com', phone: '+54 9 11 4890-5566', plan: 'Musculación' },
  { id: 'mem-07', firstName: 'Federico', lastName: 'Díaz', dni: '25678901', email: 'federico.diaz@gmail.com', phone: '+54 9 11 4223-9900', plan: 'Full' },
  { id: 'mem-08', firstName: 'Camila', lastName: 'Martínez', dni: '41987654', email: 'camila.martinez@gmail.com', phone: '+54 9 11 4567-3321', plan: 'CrossFit' },
  { id: 'mem-09', firstName: 'Agustín', lastName: 'Sánchez', dni: '33012345', email: 'agustin.sanchez@gmail.com', phone: '+54 9 11 4098-6644', plan: 'Pilates' },
  { id: 'mem-10', firstName: 'Julieta', lastName: 'Romero', dni: '39456123', email: 'julieta.romero@gmail.com', phone: '+54 9 11 4332-1188', plan: '3 veces/semana' },
  { id: 'mem-11', firstName: 'Tomás', lastName: 'Álvarez', dni: '28765432', email: 'tomas.alvarez@gmail.com', phone: '+54 9 11 4776-4433', plan: 'Musculación' },
  { id: 'mem-12', firstName: 'Micaela', lastName: 'Torres', dni: '42109876', email: 'micaela.torres@gmail.com', phone: '+54 9 11 4445-7722', plan: 'Full' },
  { id: 'mem-13', firstName: 'Ignacio', lastName: 'Ruiz', dni: '26543210', email: 'ignacio.ruiz@gmail.com', phone: '+54 9 11 4998-2255', plan: 'CrossFit' },
  { id: 'mem-14', firstName: 'Florencia', lastName: 'Ramírez', dni: '37890234', email: 'florencia.ramirez@gmail.com', phone: '+54 9 11 4667-8899', plan: 'Pilates' },
  { id: 'mem-15', firstName: 'Franco', lastName: 'Flores', dni: '44123890', email: 'franco.flores@gmail.com', phone: '+54 9 11 4551-3300', plan: '3 veces/semana' },
  { id: 'mem-16', firstName: 'Antonella', lastName: 'Benítez', dni: '30987651', email: 'antonella.benitez@gmail.com', phone: '+54 9 11 4223-6677', plan: 'Musculación' },
  { id: 'mem-17', firstName: 'Joaquín', lastName: 'Acosta', dni: '45678012', email: 'joaquin.acosta@gmail.com', phone: '+54 9 11 4890-1122', plan: 'Full' },
  { id: 'mem-18', firstName: 'Milagros', lastName: 'Medina', dni: '32456789', email: 'milagros.medina@gmail.com', phone: '+54 9 11 4334-5599', plan: 'CrossFit' },
  { id: 'mem-19', firstName: 'Santiago', lastName: 'Herrera', dni: '24678905', email: 'santiago.herrera@gmail.com', phone: '+54 9 11 4776-0033', plan: 'Pilates' },
  { id: 'mem-20', firstName: 'Rocío', lastName: 'Aguirre', dni: '43210567', email: 'rocio.aguirre@gmail.com', phone: '+54 9 11 4109-8845', plan: '3 veces/semana' },
  { id: 'mem-21', firstName: 'Emiliano', lastName: 'Castro', dni: '29345678', email: 'emiliano.castro@gmail.com', phone: '+54 9 11 4562-7711', plan: 'Musculación' },
  { id: 'mem-22', firstName: 'Abril', lastName: 'Molina', dni: '46789012', email: 'abril.molina@gmail.com', phone: '+54 9 11 4890-4433', plan: 'Full' },
  { id: 'mem-23', firstName: 'Lautaro', lastName: 'Ortiz', dni: '31567890', email: 'lautaro.ortiz@gmail.com', phone: '+54 9 11 4223-1199', plan: 'CrossFit' },
  { id: 'mem-24', firstName: 'Delfina', lastName: 'Silva', dni: '27456123', email: 'delfina.silva@gmail.com', phone: '+54 9 11 4667-2200', plan: 'Pilates' },
  { id: 'mem-25', firstName: 'Matías', lastName: 'Vega', dni: '40890234', email: 'matias.vega@gmail.com', phone: '+54 9 11 4551-9988', plan: '3 veces/semana' },
];

function fullName(member: DemoMember): string {
  return `${member.firstName} ${member.lastName}`;
}

// ---------------------------------------------------------------------------
// Asistencias
// ---------------------------------------------------------------------------

export type AccessMethod = 'Documento' | 'Tarjeta' | 'Huella';

export interface AttendanceRecord {
  id: string;
  time: string; // HH:mm
  memberId: string;
  memberName: string;
  memberDni: string;
  activity: string;
  branch: string;
  accessMethod: AccessMethod;
}

const ATTENDANCE_TIMES = [
  '06:15', '07:05', '07:40', '08:10', '08:45', '09:20', '10:05', '11:15',
  '12:30', '14:10', '15:25', '17:00', '18:05', '18:20', '18:35', '18:55',
  '19:30', '20:15',
] as const;

const ACTIVITIES = ['Musculación', 'CrossFit', 'Pilates', 'Funcional', 'Spinning'] as const;
const BRANCHES = ['Sede Centro', 'Sede Belgrano', 'Sede Palermo'] as const;
const ACCESS_METHODS: readonly AccessMethod[] = ['Documento', 'Tarjeta', 'Huella'];

/** ~18 asistencias del día de hoy, con horas, actividades y sedes variadas. */
export const ATTENDANCE_TODAY: readonly AttendanceRecord[] = ATTENDANCE_TIMES.map((time, index) => {
  const member = MEMBERS_DEMO[index % MEMBERS_DEMO.length]!;
  return {
    id: `att-${String(index + 1).padStart(2, '0')}`,
    time,
    memberId: member.id,
    memberName: fullName(member),
    memberDni: member.dni,
    activity: ACTIVITIES[index % ACTIVITIES.length]!,
    branch: BRANCHES[index % BRANCHES.length]!,
    accessMethod: ACCESS_METHODS[index % ACCESS_METHODS.length]!,
  };
});

/** Asistencias totales de los últimos 7 días (hoy incluido), para el promedio diario. */
const WEEKLY_ATTENDANCE_COUNTS: readonly number[] = [16, 15, 18, 17, 19, 20, ATTENDANCE_TODAY.length];

export interface AttendanceKpis {
  attendanceToday: number;
  peakHour: string;
  avgDaily7d: number;
}

/** Deriva los KPIs de asistencia a partir de `ATTENDANCE_TODAY` (sin azar: mismo dataset, mismo resultado). */
export function getAttendanceKpis(): AttendanceKpis {
  const hourCounts = new Map<string, number>();
  for (const record of ATTENDANCE_TODAY) {
    const hour = record.time.slice(0, 2);
    hourCounts.set(hour, (hourCounts.get(hour) ?? 0) + 1);
  }

  let peakHourValue = '00';
  let peakCount = -1;
  for (const [hour, count] of hourCounts) {
    if (count > peakCount) {
      peakCount = count;
      peakHourValue = hour;
    }
  }
  const nextHour = String((Number(peakHourValue) + 1) % 24).padStart(2, '0');

  const avgDaily7d = Math.round(
    WEEKLY_ATTENDANCE_COUNTS.reduce((sum, count) => sum + count, 0) / WEEKLY_ATTENDANCE_COUNTS.length,
  );

  return {
    attendanceToday: ATTENDANCE_TODAY.length,
    peakHour: `${peakHourValue}:00–${nextHour}:00`,
    avgDaily7d,
  };
}

// ---------------------------------------------------------------------------
// Baja de socios
// ---------------------------------------------------------------------------

export type InactiveReason = 'debt' | 'no-attendance';

export interface InactiveMember {
  id: string;
  name: string;
  email: string;
  dni: string;
  membership: string;
  /** Fecha ISO (`yyyy-MM-dd`): vencimiento de cuota o última asistencia, según `reason`. */
  dueDate: string;
  daysOverdue: number;
  reason: InactiveReason;
}

interface InactiveSeed {
  id: string;
  memberIndex: number;
  dueDate: string;
  daysOverdue: number;
  reason: InactiveReason;
}

function buildInactiveMember(seed: InactiveSeed): InactiveMember {
  const member = MEMBERS_DEMO[seed.memberIndex]!;
  return {
    id: seed.id,
    name: fullName(member),
    email: member.email,
    dni: member.dni,
    membership: member.plan,
    dueDate: seed.dueDate,
    daysOverdue: seed.daysOverdue,
    reason: seed.reason,
  };
}

/** Socios con cuota vencida hace más de 45 días. */
const OVERDUE_SEEDS: readonly InactiveSeed[] = [
  { id: 'inact-01', memberIndex: 17, dueDate: '2026-06-01', daysOverdue: 79, reason: 'debt' },
  { id: 'inact-02', memberIndex: 18, dueDate: '2026-05-15', daysOverdue: 96, reason: 'debt' },
  { id: 'inact-03', memberIndex: 19, dueDate: '2026-06-20', daysOverdue: 60, reason: 'debt' },
  { id: 'inact-04', memberIndex: 20, dueDate: '2026-04-10', daysOverdue: 131, reason: 'debt' },
  { id: 'inact-05', memberIndex: 21, dueDate: '2026-06-30', daysOverdue: 50, reason: 'debt' },
  { id: 'inact-06', memberIndex: 22, dueDate: '2026-05-01', daysOverdue: 110, reason: 'debt' },
  { id: 'inact-07', memberIndex: 23, dueDate: '2026-06-05', daysOverdue: 75, reason: 'debt' },
];
export const OVERDUE_MEMBERS: readonly InactiveMember[] = OVERDUE_SEEDS.map(buildInactiveMember);

/** Socios sin asistir hace más de 30 días. */
const NO_ATTENDANCE_SEEDS: readonly InactiveSeed[] = [
  { id: 'inact-08', memberIndex: 0, dueDate: '2026-07-01', daysOverdue: 49, reason: 'no-attendance' },
  { id: 'inact-09', memberIndex: 1, dueDate: '2026-07-10', daysOverdue: 40, reason: 'no-attendance' },
  { id: 'inact-10', memberIndex: 2, dueDate: '2026-06-25', daysOverdue: 55, reason: 'no-attendance' },
  { id: 'inact-11', memberIndex: 3, dueDate: '2026-07-15', daysOverdue: 35, reason: 'no-attendance' },
  { id: 'inact-12', memberIndex: 4, dueDate: '2026-06-15', daysOverdue: 65, reason: 'no-attendance' },
];
export const NO_ATTENDANCE_MEMBERS: readonly InactiveMember[] = NO_ATTENDANCE_SEEDS.map(buildInactiveMember);

/** Total de socios candidatos a baja (las dos listas combinadas), para el badge del header. */
export function getInactiveMembersCount(): number {
  return OVERDUE_MEMBERS.length + NO_ATTENDANCE_MEMBERS.length;
}

// ---------------------------------------------------------------------------
// Entrenamientos
// ---------------------------------------------------------------------------

export interface WorkoutMember {
  id: string;
  name: string;
  dni: string;
  avgScore: number;
  hasRoutine: boolean;
  instructor: string | null;
}

const INSTRUCTORS = ['Prof. Diego Sosa', 'Prof. Carla Núñez', 'Prof. Bruno Ibáñez', 'Prof. Lucía Paz'] as const;

/** Puntajes fijos (60-99) para que la tabla se vea con variedad real sin usar azar. */
const WORKOUT_SCORES: readonly number[] = [
  92, 88, 95, 76, 84, 69, 91, 73, 87, 99,
  65, 80, 94, 71, 89, 62, 96, 78, 85, 90,
  67, 93, 74, 82, 97,
];

const WORKOUT_HAS_ROUTINE: readonly boolean[] = [
  true, true, true, false, true, false, true, true, true, true,
  false, true, true, false, true, false, true, true, true, true,
  false, true, false, true, true,
];

const RAW_WORKOUT_MEMBERS: readonly WorkoutMember[] = MEMBERS_DEMO.map((member, index) => {
  const hasRoutine = WORKOUT_HAS_ROUTINE[index]!;
  return {
    id: member.id,
    name: fullName(member),
    dni: member.dni,
    avgScore: WORKOUT_SCORES[index]!,
    hasRoutine,
    instructor: hasRoutine ? INSTRUCTORS[index % INSTRUCTORS.length]! : null,
  };
});

/** Socios con su puntaje de entrenamiento, ordenados de mayor a menor. */
export function getWorkoutMembersSorted(): readonly WorkoutMember[] {
  return [...RAW_WORKOUT_MEMBERS].sort((a, b) => b.avgScore - a.avgScore);
}
