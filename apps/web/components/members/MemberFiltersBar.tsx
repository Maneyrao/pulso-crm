'use client';

import { useEffect, useState } from 'react';
import { Checkbox, Input, Select } from '@pulso/ui';
import type { MemberFiltersState } from '@/lib/hooks/useMemberFilters';

export interface MemberFiltersBarProps {
  filters: MemberFiltersState;
  onChange: (patch: Partial<MemberFiltersState>) => void;
}

const STATUS_OPTIONS = [
  { value: '', label: 'Todos los estados' },
  { value: 'ACTIVE', label: 'Activo' },
  { value: 'INACTIVE', label: 'Inactivo' },
];

const MEMBERSHIP_OPTIONS = [
  { value: '', label: 'Cualquier membresía' },
  { value: 'ACTIVE', label: 'Con membresía activa' },
  { value: 'EXPIRED', label: 'Membresía vencida' },
  { value: 'NONE', label: 'Sin membresía' },
];

/** Búsqueda con debounce de 300 ms y mínimo 2 caracteres (API_CONTRACTS §searchQuerySchema). */
export function MemberFiltersBar({ filters, onChange }: MemberFiltersBarProps) {
  const [searchValue, setSearchValue] = useState(filters.q);

  useEffect(() => setSearchValue(filters.q), [filters.q]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchValue === filters.q) return;
      if (searchValue.length === 0 || searchValue.length >= 2) {
        onChange({ q: searchValue });
      }
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchValue]);

  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="member-search" className="text-(--text-sm) font-medium text-(--color-text)">
          Buscar
        </label>
        <Input
          id="member-search"
          value={searchValue}
          onChange={(e) => setSearchValue(e.target.value)}
          placeholder="Nombre, apellido o documento"
          className="w-64"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="member-status" className="text-(--text-sm) font-medium text-(--color-text)">
          Estado
        </label>
        <Select
          id="member-status"
          value={filters.status || undefined}
          onValueChange={(value) => onChange({ status: value })}
          options={STATUS_OPTIONS}
          placeholder="Todos los estados"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="member-membership" className="text-(--text-sm) font-medium text-(--color-text)">
          Membresía
        </label>
        <Select
          id="member-membership"
          value={filters.membershipStatus || undefined}
          onValueChange={(value) => onChange({ membershipStatus: value })}
          options={MEMBERSHIP_OPTIONS}
          placeholder="Cualquier membresía"
        />
      </div>

      <label className="flex items-center gap-2 pb-2 text-(--text-sm) text-(--color-text)">
        <Checkbox
          checked={filters.hasDebt}
          onChange={(e) => onChange({ hasDebt: e.target.checked })}
        />
        Con deuda
      </label>
    </div>
  );
}
