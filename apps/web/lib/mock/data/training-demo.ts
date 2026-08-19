/**
 * Dataset determinista para las pantallas DEMO de Entrenamiento (Rutinas,
 * Ejercicios) e Instructores (Listado, Asistencias) — módulos sin backend
 * todavía (docs/CONTROLFIT_PARITY_AUDIT.md §2, permisos `routine:*` /
 * `instructor:*`).
 *
 * Regla: nada de `Math.random()` ni `Date.now()` acá — todo fijo, para no
 * romper la hidratación entre server y cliente vía `useMockData`.
 */

export type RoutineStatusTone = 'success' | 'neutral' | 'warning';

export interface DemoRoutine {
  id: string;
  name: string;
  goal: string;
  daysPerWeek: number;
  exerciseCount: number;
  instructorName: string | null;
  assignedMembers: number;
  statusLabel: 'Activa' | 'Borrador' | 'Archivada';
  statusTone: RoutineStatusTone;
}

export type ExerciseCategory = 'Tren superior' | 'Tren inferior' | 'Core' | 'Cardio';
export type ExerciseEquipment = 'Barra' | 'Mancuernas' | 'Polea' | 'Máquina' | 'Peso corporal';
export type ExerciseOrigin = 'Catálogo' | 'Propio';

export interface DemoExercise {
  id: string;
  name: string;
  category: ExerciseCategory;
  muscle: string;
  equipment: ExerciseEquipment;
  origin: ExerciseOrigin;
  hasVideo: boolean;
}

export interface DemoInstructor {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  specialty: string;
  assignedMembers: number;
  active: boolean;
}

export interface DemoInstructorAttendance {
  id: string;
  date: string;
  instructorId: string;
  instructorName: string;
  checkIn: string;
  checkOut: string;
  hours: number;
}

// ─────────────────────────────────────────────────────────────────────────
// Instructores
// ─────────────────────────────────────────────────────────────────────────

export const DEMO_INSTRUCTORS: readonly DemoInstructor[] = [
  {
    id: 'instructor-1',
    firstName: 'Martín',
    lastName: 'Sosa',
    email: 'martin.sosa@pulsogym.com',
    phone: '+54 9 11 4455-1200',
    specialty: 'Musculación',
    assignedMembers: 32,
    active: true,
  },
  {
    id: 'instructor-2',
    firstName: 'Rocío',
    lastName: 'Fernández',
    email: 'rocio.fernandez@pulsogym.com',
    phone: '+54 9 11 4455-1201',
    specialty: 'Entrenamiento funcional',
    assignedMembers: 41,
    active: true,
  },
  {
    id: 'instructor-3',
    firstName: 'Diego',
    lastName: 'Álvarez',
    email: 'diego.alvarez@pulsogym.com',
    phone: '+54 9 11 4455-1202',
    specialty: 'Crossfit',
    assignedMembers: 27,
    active: true,
  },
  {
    id: 'instructor-4',
    firstName: 'Camila',
    lastName: 'Torres',
    email: 'camila.torres@pulsogym.com',
    phone: '+54 9 11 4455-1203',
    specialty: 'Yoga y movilidad',
    assignedMembers: 15,
    active: true,
  },
  {
    id: 'instructor-5',
    firstName: 'Nicolás',
    lastName: 'Romero',
    email: 'nicolas.romero@pulsogym.com',
    phone: '+54 9 11 4455-1204',
    specialty: 'Powerlifting',
    assignedMembers: 0,
    active: false,
  },
  {
    id: 'instructor-6',
    firstName: 'Julieta',
    lastName: 'Medina',
    email: 'julieta.medina@pulsogym.com',
    phone: '+54 9 11 4455-1205',
    specialty: 'Spinning',
    assignedMembers: 19,
    active: true,
  },
] as const;

function instructorFullName(instructor: DemoInstructor): string {
  return `${instructor.firstName} ${instructor.lastName}`;
}

// ─────────────────────────────────────────────────────────────────────────
// Rutinas
// ─────────────────────────────────────────────────────────────────────────

export const DEMO_ROUTINES: readonly DemoRoutine[] = [
  {
    id: 'routine-1',
    name: 'Fuerza total',
    goal: 'Fuerza',
    daysPerWeek: 4,
    exerciseCount: 10,
    instructorName: instructorFullName(DEMO_INSTRUCTORS[0]!),
    assignedMembers: 32,
    statusLabel: 'Activa',
    statusTone: 'success',
  },
  {
    id: 'routine-2',
    name: 'Hipertrofia tren superior',
    goal: 'Hipertrofia',
    daysPerWeek: 5,
    exerciseCount: 12,
    instructorName: instructorFullName(DEMO_INSTRUCTORS[2]!),
    assignedMembers: 27,
    statusLabel: 'Activa',
    statusTone: 'success',
  },
  {
    id: 'routine-3',
    name: 'Quema grasa funcional',
    goal: 'Pérdida de grasa',
    daysPerWeek: 3,
    exerciseCount: 8,
    instructorName: instructorFullName(DEMO_INSTRUCTORS[1]!),
    assignedMembers: 41,
    statusLabel: 'Activa',
    statusTone: 'success',
  },
  {
    id: 'routine-4',
    name: 'Full body principiantes',
    goal: 'Acondicionamiento general',
    daysPerWeek: 3,
    exerciseCount: 6,
    instructorName: instructorFullName(DEMO_INSTRUCTORS[5]!),
    assignedMembers: 19,
    statusLabel: 'Activa',
    statusTone: 'success',
  },
  {
    id: 'routine-5',
    name: 'Powerlifting básico',
    goal: 'Fuerza',
    daysPerWeek: 4,
    exerciseCount: 9,
    instructorName: instructorFullName(DEMO_INSTRUCTORS[4]!),
    assignedMembers: 8,
    statusLabel: 'Archivada',
    statusTone: 'warning',
  },
  {
    id: 'routine-6',
    name: 'Movilidad y yoga',
    goal: 'Movilidad',
    daysPerWeek: 2,
    exerciseCount: 7,
    instructorName: instructorFullName(DEMO_INSTRUCTORS[3]!),
    assignedMembers: 15,
    statusLabel: 'Activa',
    statusTone: 'success',
  },
  {
    id: 'routine-7',
    name: 'Resistencia cardio',
    goal: 'Resistencia',
    daysPerWeek: 5,
    exerciseCount: 7,
    instructorName: instructorFullName(DEMO_INSTRUCTORS[1]!),
    assignedMembers: 23,
    statusLabel: 'Borrador',
    statusTone: 'neutral',
  },
  {
    id: 'routine-8',
    name: 'Tonificación general',
    goal: 'Tonificación',
    daysPerWeek: 3,
    exerciseCount: 8,
    instructorName: null,
    assignedMembers: 0,
    statusLabel: 'Borrador',
    statusTone: 'neutral',
  },
] as const;

// ─────────────────────────────────────────────────────────────────────────
// Ejercicios (~40, catálogo de gimnasio en español)
// ─────────────────────────────────────────────────────────────────────────

export const DEMO_EXERCISES: readonly DemoExercise[] = [
  // Tren superior
  { id: 'exercise-1', name: 'Press de banca plano', category: 'Tren superior', muscle: 'Pectorales', equipment: 'Barra', origin: 'Catálogo', hasVideo: true },
  { id: 'exercise-2', name: 'Press militar', category: 'Tren superior', muscle: 'Hombros', equipment: 'Barra', origin: 'Catálogo', hasVideo: true },
  { id: 'exercise-3', name: 'Remo con barra', category: 'Tren superior', muscle: 'Espalda', equipment: 'Barra', origin: 'Catálogo', hasVideo: true },
  { id: 'exercise-4', name: 'Curl de bíceps con mancuernas', category: 'Tren superior', muscle: 'Bíceps', equipment: 'Mancuernas', origin: 'Catálogo', hasVideo: true },
  { id: 'exercise-5', name: 'Press de hombros con mancuernas', category: 'Tren superior', muscle: 'Hombros', equipment: 'Mancuernas', origin: 'Catálogo', hasVideo: false },
  { id: 'exercise-6', name: 'Jalón al pecho en polea', category: 'Tren superior', muscle: 'Espalda', equipment: 'Polea', origin: 'Catálogo', hasVideo: true },
  { id: 'exercise-7', name: 'Remo en polea baja', category: 'Tren superior', muscle: 'Espalda', equipment: 'Polea', origin: 'Catálogo', hasVideo: false },
  { id: 'exercise-8', name: 'Press de pecho en máquina', category: 'Tren superior', muscle: 'Pectorales', equipment: 'Máquina', origin: 'Catálogo', hasVideo: true },
  { id: 'exercise-9', name: 'Fondos en paralelas', category: 'Tren superior', muscle: 'Tríceps', equipment: 'Peso corporal', origin: 'Catálogo', hasVideo: true },
  { id: 'exercise-10', name: 'Flexiones de brazos', category: 'Tren superior', muscle: 'Pectorales', equipment: 'Peso corporal', origin: 'Propio', hasVideo: false },
  { id: 'exercise-11', name: 'Extensión de tríceps en polea', category: 'Tren superior', muscle: 'Tríceps', equipment: 'Polea', origin: 'Propio', hasVideo: true },

  // Tren inferior
  { id: 'exercise-12', name: 'Sentadilla con barra', category: 'Tren inferior', muscle: 'Cuádriceps', equipment: 'Barra', origin: 'Catálogo', hasVideo: true },
  { id: 'exercise-13', name: 'Peso muerto convencional', category: 'Tren inferior', muscle: 'Isquiotibiales', equipment: 'Barra', origin: 'Catálogo', hasVideo: true },
  { id: 'exercise-14', name: 'Zancadas con mancuernas', category: 'Tren inferior', muscle: 'Cuádriceps', equipment: 'Mancuernas', origin: 'Catálogo', hasVideo: true },
  { id: 'exercise-15', name: 'Prensa de piernas', category: 'Tren inferior', muscle: 'Cuádriceps', equipment: 'Máquina', origin: 'Catálogo', hasVideo: true },
  { id: 'exercise-16', name: 'Extensión de cuádriceps en máquina', category: 'Tren inferior', muscle: 'Cuádriceps', equipment: 'Máquina', origin: 'Catálogo', hasVideo: false },
  { id: 'exercise-17', name: 'Curl femoral en máquina', category: 'Tren inferior', muscle: 'Isquiotibiales', equipment: 'Máquina', origin: 'Catálogo', hasVideo: true },
  { id: 'exercise-18', name: 'Elevación de talones en máquina', category: 'Tren inferior', muscle: 'Gemelos', equipment: 'Máquina', origin: 'Catálogo', hasVideo: false },
  { id: 'exercise-19', name: 'Sentadilla búlgara', category: 'Tren inferior', muscle: 'Glúteos', equipment: 'Mancuernas', origin: 'Propio', hasVideo: true },
  { id: 'exercise-20', name: 'Puente de glúteos', category: 'Tren inferior', muscle: 'Glúteos', equipment: 'Peso corporal', origin: 'Propio', hasVideo: false },
  { id: 'exercise-21', name: 'Peso muerto rumano con mancuernas', category: 'Tren inferior', muscle: 'Isquiotibiales', equipment: 'Mancuernas', origin: 'Catálogo', hasVideo: true },
  { id: 'exercise-22', name: 'Sentadilla goblet', category: 'Tren inferior', muscle: 'Cuádriceps', equipment: 'Mancuernas', origin: 'Propio', hasVideo: false },

  // Core
  { id: 'exercise-23', name: 'Plancha abdominal', category: 'Core', muscle: 'Core', equipment: 'Peso corporal', origin: 'Catálogo', hasVideo: true },
  { id: 'exercise-24', name: 'Crunch abdominal', category: 'Core', muscle: 'Abdominales', equipment: 'Peso corporal', origin: 'Catálogo', hasVideo: false },
  { id: 'exercise-25', name: 'Elevación de piernas colgado', category: 'Core', muscle: 'Abdominales', equipment: 'Peso corporal', origin: 'Catálogo', hasVideo: true },
  { id: 'exercise-26', name: 'Rueda abdominal', category: 'Core', muscle: 'Core', equipment: 'Peso corporal', origin: 'Propio', hasVideo: true },
  { id: 'exercise-27', name: 'Giro ruso con disco', category: 'Core', muscle: 'Oblicuos', equipment: 'Peso corporal', origin: 'Propio', hasVideo: false },
  { id: 'exercise-28', name: 'Plancha lateral', category: 'Core', muscle: 'Oblicuos', equipment: 'Peso corporal', origin: 'Catálogo', hasVideo: false },
  { id: 'exercise-29', name: 'Abdominales en polea', category: 'Core', muscle: 'Abdominales', equipment: 'Polea', origin: 'Catálogo', hasVideo: true },
  { id: 'exercise-30', name: 'Hollow body hold', category: 'Core', muscle: 'Core', equipment: 'Peso corporal', origin: 'Propio', hasVideo: false },
  { id: 'exercise-31', name: 'Press Pallof en polea', category: 'Core', muscle: 'Core', equipment: 'Polea', origin: 'Propio', hasVideo: true },

  // Cardio
  { id: 'exercise-32', name: 'Cinta de correr', category: 'Cardio', muscle: 'Cardiovascular', equipment: 'Máquina', origin: 'Catálogo', hasVideo: false },
  { id: 'exercise-33', name: 'Bicicleta fija', category: 'Cardio', muscle: 'Cardiovascular', equipment: 'Máquina', origin: 'Catálogo', hasVideo: false },
  { id: 'exercise-34', name: 'Remo en máquina', category: 'Cardio', muscle: 'Cardiovascular', equipment: 'Máquina', origin: 'Catálogo', hasVideo: true },
  { id: 'exercise-35', name: 'Elíptico', category: 'Cardio', muscle: 'Cardiovascular', equipment: 'Máquina', origin: 'Catálogo', hasVideo: false },
  { id: 'exercise-36', name: 'Salto a la soga', category: 'Cardio', muscle: 'Cardiovascular', equipment: 'Peso corporal', origin: 'Catálogo', hasVideo: true },
  { id: 'exercise-37', name: 'Burpees', category: 'Cardio', muscle: 'Cardiovascular', equipment: 'Peso corporal', origin: 'Propio', hasVideo: true },
  { id: 'exercise-38', name: 'Escaladores', category: 'Cardio', muscle: 'Cardiovascular', equipment: 'Peso corporal', origin: 'Propio', hasVideo: false },
  { id: 'exercise-39', name: 'Sprint en cinta', category: 'Cardio', muscle: 'Cardiovascular', equipment: 'Máquina', origin: 'Propio', hasVideo: false },
  { id: 'exercise-40', name: 'Step con banco', category: 'Cardio', muscle: 'Cardiovascular', equipment: 'Peso corporal', origin: 'Propio', hasVideo: false },
] as const;

export const EXERCISE_CATEGORIES: readonly ExerciseCategory[] = ['Tren superior', 'Tren inferior', 'Core', 'Cardio'];
export const EXERCISE_ORIGINS: readonly ExerciseOrigin[] = ['Catálogo', 'Propio'];

// ─────────────────────────────────────────────────────────────────────────
// Asistencias de instructores
// ─────────────────────────────────────────────────────────────────────────

/** Dos semanas hábiles fijas (lunes a viernes) para las asistencias demo. */
const WEEK_1 = ['2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06', '2026-08-07'] as const;
const WEEK_2 = ['2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13', '2026-08-14'] as const;
const ALL_WEEKDAYS = [...WEEK_1, ...WEEK_2] as const;

interface AttendanceSeed {
  instructor: DemoInstructor;
  dates: readonly string[];
  checkIn: string;
  checkOut: string;
}

/** Diferencia en horas entre dos strings `HH:mm`, redondeada a 2 decimales. */
function hoursBetween(checkIn: string, checkOut: string): number {
  const [inHours, inMinutes] = checkIn.split(':').map(Number);
  const [outHours, outMinutes] = checkOut.split(':').map(Number);
  const minutes = outHours! * 60 + outMinutes! - (inHours! * 60 + inMinutes!);
  return Math.round((minutes / 60) * 100) / 100;
}

const ATTENDANCE_SEEDS: readonly AttendanceSeed[] = [
  { instructor: DEMO_INSTRUCTORS[0]!, dates: ALL_WEEKDAYS, checkIn: '08:00', checkOut: '16:00' },
  { instructor: DEMO_INSTRUCTORS[1]!, dates: ALL_WEEKDAYS, checkIn: '14:00', checkOut: '22:00' },
  { instructor: DEMO_INSTRUCTORS[2]!, dates: ALL_WEEKDAYS, checkIn: '06:00', checkOut: '14:00' },
  { instructor: DEMO_INSTRUCTORS[3]!, dates: ALL_WEEKDAYS, checkIn: '09:00', checkOut: '13:00' },
  // Nicolás Romero está de baja: sólo tiene asistencias de la primera semana.
  { instructor: DEMO_INSTRUCTORS[4]!, dates: WEEK_1, checkIn: '08:00', checkOut: '16:00' },
  { instructor: DEMO_INSTRUCTORS[5]!, dates: ALL_WEEKDAYS, checkIn: '16:00', checkOut: '22:00' },
];

export const DEMO_INSTRUCTOR_ATTENDANCE: readonly DemoInstructorAttendance[] = ATTENDANCE_SEEDS.flatMap((seed) =>
  seed.dates.map((date) => ({
    id: `${seed.instructor.id}-${date}`,
    date,
    instructorId: seed.instructor.id,
    instructorName: instructorFullName(seed.instructor),
    checkIn: seed.checkIn,
    checkOut: seed.checkOut,
    hours: hoursBetween(seed.checkIn, seed.checkOut),
  })),
);
