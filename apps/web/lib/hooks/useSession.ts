'use client';

import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { fetchMe, resolveActiveBranchId } from '../api/auth.js';
import { ApiError } from '../api/errors.js';
import { qk } from '../query/keys.js';
import { useSessionStore } from '../stores/session.js';

/**
 * Trae `GET /auth/me` y sincroniza el store de Zustand. Se llama una vez
 * desde el AppShell; el resto de la app lee del store, no de este hook.
 */
export function useBootstrapSession() {
  const setSession = useSessionStore((s) => s.setSession);
  const setStatus = useSessionStore((s) => s.setStatus);
  const clearSession = useSessionStore((s) => s.clearSession);

  const query = useQuery({
    queryKey: qk.me(),
    queryFn: fetchMe,
    retry: false,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (query.data) {
      const activeBranchId = resolveActiveBranchId(query.data);
      if (activeBranchId) {
        setSession({
          user: query.data.user,
          gym: query.data.gym,
          branches: query.data.branches,
          activeBranchId,
          permissions: query.data.permissions,
        });
      }
    }
  }, [query.data, setSession]);

  useEffect(() => {
    if (query.isError) {
      clearSession();
    }
  }, [query.isError, clearSession]);

  useEffect(() => {
    setStatus(query.isLoading ? 'loading' : query.isError ? 'unauthenticated' : 'idle');
  }, [query.isLoading, query.isError, setStatus]);

  return query;
}

/** Sesión expirada de forma irrecuperable (refresh también falló). */
export function isSessionExpiredError(error: unknown): boolean {
  return error instanceof ApiError && (error.code === 'SESSION_EXPIRED' || error.status === 401);
}
