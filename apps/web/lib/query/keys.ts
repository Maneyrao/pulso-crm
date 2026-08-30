/**
 * Factory de query keys (FRONTEND_PLAN §5). Toda key de un recurso por
 * gimnasio/sede incluye `gymId` y `branchId`: evita que un `queryClient.clear()`
 * a medias deje datos de otro contexto visibles tras cambiar de sede.
 */
export const qk = {
  me: () => ['me'] as const,

  members: (gymId: string, branchId: string | null, filters: Readonly<Record<string, unknown>>) =>
    ['members', gymId, branchId, filters] as const,
  member: (gymId: string, id: string) => ['member', gymId, id] as const,
  memberLedger: (gymId: string, id: string) => ['member-ledger', gymId, id] as const,
  memberAttendances: (gymId: string, id: string) => ['member-attendances', gymId, id] as const,
  memberMemberships: (gymId: string, memberId: string) =>
    ['member-memberships', gymId, memberId] as const,
  debtors: (gymId: string, branchId: string | null, filters: Readonly<Record<string, unknown>>) =>
    ['debtors', gymId, branchId, filters] as const,

  plans: (gymId: string) => ['plans', gymId] as const,
  activities: (gymId: string) => ['activities', gymId] as const,

  gym: (gymId: string) => ['gym', gymId] as const,
  branches: (gymId: string) => ['branches', gymId] as const,
  users: (gymId: string, filters: Readonly<Record<string, unknown>>) =>
    ['users', gymId, filters] as const,
  roles: (gymId: string) => ['roles', gymId] as const,

  cashSession: (gymId: string, branchId: string | null) =>
    ['cash-session', gymId, branchId] as const,
  cashSessions: (
    gymId: string,
    branchId: string | null,
    filters: Readonly<Record<string, unknown>>,
  ) => ['cash-sessions', gymId, branchId, filters] as const,
  cashRegisters: (gymId: string, branchId: string | null) =>
    ['cash-registers', gymId, branchId] as const,
  cashMovements: (gymId: string, cashSessionId: string) =>
    ['cash-movements', gymId, cashSessionId] as const,
  cashOperations: (gymId: string, branchId: string | null) =>
    ['cash-operations', gymId, branchId] as const,
  paymentMethods: (gymId: string) => ['payment-methods', gymId] as const,
  cashConcepts: (gymId: string) => ['cash-concepts', gymId] as const,
  daybook: (gymId: string, branchId: string | null, from: string, to: string) =>
    ['daybook', gymId, branchId, from, to] as const,

  accessAttempts: (
    gymId: string,
    branchId: string | null,
    filters: Readonly<Record<string, unknown>>,
  ) => ['access-attempts', gymId, branchId, filters] as const,
  attendances: (
    gymId: string,
    branchId: string | null,
    filters: Readonly<Record<string, unknown>>,
  ) => ['attendances', gymId, branchId, filters] as const,

  dashboard: (gymId: string, branchId: string | null) => ['dashboard', gymId, branchId] as const,
} as const;
