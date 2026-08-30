'use client';

import { useCallback, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export interface MemberFiltersState {
  q: string;
  status: string;
  membershipStatus: string;
  hasDebt: boolean;
  page: number;
}

const DEFAULTS: MemberFiltersState = {
  q: '',
  status: '',
  membershipStatus: '',
  hasDebt: false,
  page: 1,
};

/**
 * Filtros de `/members` en la URL (FRONTEND_PLAN §6.4): sobreviven a un F5 y
 * son un link compartible. `page` vuelve a 1 cada vez que cambia otro filtro.
 */
export function useMemberFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const filters: MemberFiltersState = useMemo(
    () => ({
      q: searchParams.get('q') ?? DEFAULTS.q,
      status: searchParams.get('status') ?? DEFAULTS.status,
      membershipStatus: searchParams.get('membershipStatus') ?? DEFAULTS.membershipStatus,
      hasDebt: searchParams.get('hasDebt') === 'true',
      page: Number(searchParams.get('page') ?? DEFAULTS.page),
    }),
    [searchParams],
  );

  const isFiltered =
    filters.q.length > 0 ||
    filters.status.length > 0 ||
    filters.membershipStatus.length > 0 ||
    filters.hasDebt;

  const update = useCallback(
    (patch: Partial<MemberFiltersState>, opts: { resetPage?: boolean } = {}) => {
      const next = new URLSearchParams(searchParams.toString());
      const merged = { ...filters, ...patch, page: opts.resetPage === false ? filters.page : 1 };

      for (const [key, value] of Object.entries(merged)) {
        const isDefault =
          value === DEFAULTS[key as keyof MemberFiltersState] || value === '' || value === false;
        if (isDefault) next.delete(key);
        else next.set(key, String(value));
      }
      router.push(`${pathname}?${next.toString()}`);
    },
    [filters, pathname, router, searchParams],
  );

  const setPage = useCallback(
    (page: number) => {
      const next = new URLSearchParams(searchParams.toString());
      next.set('page', String(page));
      router.push(`${pathname}?${next.toString()}`);
    },
    [pathname, router, searchParams],
  );

  const clearFilters = useCallback(() => {
    router.push(pathname);
  }, [pathname, router]);

  return { filters, isFiltered, update, setPage, clearFilters };
}
