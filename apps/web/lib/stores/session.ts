import { create } from 'zustand';
import type { AuthBranch, AuthGym, AuthUser } from '@pulso/contracts/auth';
import type { FeatureKey } from '@pulso/contracts/features';
import type { Permission } from '@pulso/contracts/permissions';

/**
 * Estado de sesión en memoria (Zustand, SIN middleware de persistencia).
 *
 * Regla dura #1 del brief: nunca se guarda un token acá ni en ningún storage
 * del navegador. Lo que vive en este store es lo mismo que ya viajó en el
 * body de `GET /auth/me` — nombre, permisos, features — nunca la cookie de
 * sesión en sí. Un F5 pierde este store y lo repuebla con un nuevo `me`.
 */
export interface SessionState {
  user: AuthUser | null;
  gym: AuthGym | null;
  branches: readonly AuthBranch[];
  activeBranchId: string | null;
  permissions: readonly Permission[];
  status: 'idle' | 'loading' | 'authenticated' | 'unauthenticated';

  setSession: (session: {
    user: AuthUser;
    gym: AuthGym;
    branches: readonly AuthBranch[];
    activeBranchId: string;
    permissions: readonly Permission[];
  }) => void;
  setActiveBranchId: (branchId: string) => void;
  setStatus: (status: SessionState['status']) => void;
  clearSession: () => void;
  hasPermission: (permission: Permission) => boolean;
  hasFeature: (feature: FeatureKey) => boolean;
}

const initial = {
  user: null,
  gym: null,
  branches: [] as readonly AuthBranch[],
  activeBranchId: null,
  permissions: [] as readonly Permission[],
  status: 'idle' as const,
};

export const useSessionStore = create<SessionState>((set, get) => ({
  ...initial,

  setSession: ({ user, gym, branches, activeBranchId, permissions }) =>
    set({ user, gym, branches, activeBranchId, permissions, status: 'authenticated' }),

  setActiveBranchId: (branchId) => set({ activeBranchId: branchId }),

  setStatus: (status) => set({ status }),

  clearSession: () => set({ ...initial, status: 'unauthenticated' }),

  hasPermission: (permission) => get().permissions.includes(permission),

  hasFeature: (feature) => get().gym?.features.includes(feature) ?? false,
}));
