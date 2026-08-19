/**
 * Dataset determinista para las páginas de demo de estadísticas y asistente
 * IA (sin backend todavía, ver docs/CONTROLFIT_PARITY_AUDIT.md §2). Todos los
 * valores derivados (KPIs, respuestas del chat) se calculan acá una sola vez
 * a partir de los datos crudos, para que nunca queden desincronizados de lo
 * que se muestra en los gráficos.
 *
 * Nada de `Math.random()` ni `new Date()` a nivel de módulo: el dataset tiene
 * que renderizar igual en el servidor y en el cliente.
 */
import { formatMoney, subMoney } from '@pulso/config/money';

export interface MonthKey {
  key: string;
  label: string;
}

export interface ActiveMembersPoint extends MonthKey {
  activeMembers: number;
}

export interface FinancePoint extends MonthKey {
  income: string;
  expenses: string;
}

export interface WeekdayAttendancePoint {
  key: string;
  label: string;
  count: number;
}

export interface PlanDistributionItem {
  planName: string;
  percentage: number;
  members: number;
}

export interface RetentionPoint extends MonthKey {
  retentionRate: number;
}

export interface InsightsKpis {
  activeMembers: number;
  growth12mPercent: number;
  averageRetentionPercent: number;
  averageMonthlyIncome: string;
}

export interface DebtSummary {
  debtorsCount: number;
  totalDebt: string;
  oldestDebtDays: number;
}

export interface UpcomingRenewals {
  next7Days: number;
  next30Days: number;
}

export interface SuggestedQuestion {
  id: string;
  question: string;
  /** Palabras clave para matchear texto libre escrito por el usuario. */
  keywords: readonly string[];
  answer: string;
}

export interface InsightsDemoDataset {
  activeMembersByMonth: readonly ActiveMembersPoint[];
  financeByMonth: readonly FinancePoint[];
  attendanceByWeekday: readonly WeekdayAttendancePoint[];
  planDistribution: readonly PlanDistributionItem[];
  retentionByMonth: readonly RetentionPoint[];
  kpis: InsightsKpis;
  debtSummary: DebtSummary;
  upcomingRenewals: UpcomingRenewals;
  suggestedQuestions: readonly SuggestedQuestion[];
}

const MONTHS: readonly MonthKey[] = [
  { key: '2025-09', label: 'Sep' },
  { key: '2025-10', label: 'Oct' },
  { key: '2025-11', label: 'Nov' },
  { key: '2025-12', label: 'Dic' },
  { key: '2026-01', label: 'Ene' },
  { key: '2026-02', label: 'Feb' },
  { key: '2026-03', label: 'Mar' },
  { key: '2026-04', label: 'Abr' },
  { key: '2026-05', label: 'May' },
  { key: '2026-06', label: 'Jun' },
  { key: '2026-07', label: 'Jul' },
  { key: '2026-08', label: 'Ago' },
];

const ACTIVE_MEMBERS_RAW: readonly number[] = [180, 185, 188, 194, 200, 205, 210, 215, 222, 228, 234, 240];

const INCOME_RAW: readonly number[] = [
  3200000, 3280000, 3350000, 3500000, 3650000, 3780000, 3900000, 4050000, 4200000, 4350000, 4480000, 4620000,
];
const EXPENSES_RAW: readonly number[] = [
  2100000, 2150000, 2180000, 2300000, 2350000, 2400000, 2450000, 2500000, 2600000, 2650000, 2700000, 2750000,
];

const RETENTION_RAW: readonly number[] = [88, 89, 90, 89, 91, 90, 92, 91, 93, 92, 94, 93];

function toMoneyString(value: number): string {
  return value.toFixed(2);
}

export const activeMembersByMonth: readonly ActiveMembersPoint[] = MONTHS.map((month, i) => ({
  ...month,
  activeMembers: ACTIVE_MEMBERS_RAW[i]!,
}));

export const financeByMonth: readonly FinancePoint[] = MONTHS.map((month, i) => ({
  ...month,
  income: toMoneyString(INCOME_RAW[i]!),
  expenses: toMoneyString(EXPENSES_RAW[i]!),
}));

export const attendanceByWeekday: readonly WeekdayAttendancePoint[] = [
  { key: 'mon', label: 'Lunes', count: 420 },
  { key: 'tue', label: 'Martes', count: 380 },
  { key: 'wed', label: 'Miércoles', count: 450 },
  { key: 'thu', label: 'Jueves', count: 400 },
  { key: 'fri', label: 'Viernes', count: 460 },
  { key: 'sat', label: 'Sábado', count: 300 },
  { key: 'sun', label: 'Domingo', count: 120 },
];

export const planDistribution: readonly PlanDistributionItem[] = [
  { planName: 'Mensual', percentage: 45, members: 108 },
  { planName: 'Trimestral', percentage: 20, members: 48 },
  { planName: 'Semestral', percentage: 15, members: 36 },
  { planName: 'Anual', percentage: 10, members: 24 },
  { planName: 'Clase suelta', percentage: 10, members: 24 },
];

export const retentionByMonth: readonly RetentionPoint[] = MONTHS.map((month, i) => ({
  ...month,
  retentionRate: RETENTION_RAW[i]!,
}));

const firstActiveMembers = ACTIVE_MEMBERS_RAW[0]!;
const lastActiveMembers = ACTIVE_MEMBERS_RAW[ACTIVE_MEMBERS_RAW.length - 1]!;
const growth12mPercent = Math.round(((lastActiveMembers - firstActiveMembers) / firstActiveMembers) * 1000) / 10;

const averageRetentionPercent =
  Math.round((RETENTION_RAW.reduce((acc, v) => acc + v, 0) / RETENTION_RAW.length) * 10) / 10;

const averageMonthlyIncome = toMoneyString(INCOME_RAW.reduce((acc, v) => acc + v, 0) / INCOME_RAW.length);

export const kpis: InsightsKpis = {
  activeMembers: lastActiveMembers,
  growth12mPercent,
  averageRetentionPercent,
  averageMonthlyIncome,
};

export const debtSummary: DebtSummary = {
  debtorsCount: 18,
  totalDebt: '540000.00',
  oldestDebtDays: 62,
};

export const upcomingRenewals: UpcomingRenewals = {
  next7Days: 14,
  next30Days: 52,
};

const lastFinance = financeByMonth[financeByMonth.length - 1]!;
const lastFinanceResult = subMoney(lastFinance.income, lastFinance.expenses);

const busiestWeekday = attendanceByWeekday.reduce((max, day) => (day.count > max.count ? day : max));
const totalWeeklyAttendance = attendanceByWeekday.reduce((acc, day) => acc + day.count, 0);

export const suggestedQuestions: readonly SuggestedQuestion[] = [
  {
    id: 'debtors',
    question: '¿Cuántos socios tienen deuda pendiente?',
    keywords: ['deuda', 'deudor', 'deudores', 'deben', 'pendiente', 'pendientes', 'saldo'],
    answer: `Hay ${debtSummary.debtorsCount} socios con deuda pendiente, por un total de ${formatMoney(debtSummary.totalDebt)}. La deuda más antigua tiene ${debtSummary.oldestDebtDays} días.`,
  },
  {
    id: 'income',
    question: `¿Cuáles fueron los ingresos de ${lastFinance.label}?`,
    keywords: ['ingreso', 'ingresos', 'facturación', 'facturacion', 'recaudación', 'recaudacion', 'caja'],
    answer: `En ${lastFinance.label} los ingresos fueron de ${formatMoney(lastFinance.income)} y los egresos de ${formatMoney(lastFinance.expenses)}, dejando un resultado de ${formatMoney(lastFinanceResult)}.`,
  },
  {
    id: 'attendance',
    question: '¿Qué día de la semana hay más asistencias?',
    keywords: ['asistencia', 'asistencias', 'concurrencia', 'concurrido', 'día', 'dia', 'check-in', 'checkin'],
    answer: `El día con más asistencias es ${busiestWeekday.label}, con ${busiestWeekday.count} check-ins. En total la semana suma ${totalWeeklyAttendance} asistencias.`,
  },
  {
    id: 'renewals',
    question: '¿Cuántos socios vencen pronto?',
    keywords: ['vencimiento', 'vencimientos', 'vencen', 'vence', 'renovación', 'renovacion', 'renovaciones'],
    answer: `En los próximos 7 días vencen ${upcomingRenewals.next7Days} membresías, y en los próximos 30 días vencen ${upcomingRenewals.next30Days}.`,
  },
];

/** Fábrica del dataset completo, para usar con `useMockData`. */
export function getInsightsDemoDataset(): InsightsDemoDataset {
  return {
    activeMembersByMonth,
    financeByMonth,
    attendanceByWeekday,
    planDistribution,
    retentionByMonth,
    kpis,
    debtSummary,
    upcomingRenewals,
    suggestedQuestions,
  };
}
