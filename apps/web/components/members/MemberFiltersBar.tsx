'use client';

import { useEffect, useState } from 'react';
import { Input } from '@pulso/ui';
import { SegmentControl } from '@/components/shared/SegmentControl';
import type { MemberFiltersState } from '@/lib/hooks/useMemberFilters';

export interface MemberFiltersBarProps {
  filters: MemberFiltersState;
  onChange: (patch: Partial<MemberFiltersState>) => void;
}

type Segment = 'all' | 'active' | 'debt' | 'expired';

const SEGMENT_OPTIONS: Array<{ value: Segment; label: string }> = [
  { value: 'all', label: 'Todos' },
  { value: 'active', label: 'Activos' },
  { value: 'debt', label: 'En deuda' },
  { value: 'expired', label: 'Vencidos' },
];

/**
 * Segmento activo derivado de los tres query params reales de `GET /members`
 * (status/membershipStatus/hasDebt). Son mutuamente excluyentes en esta UI —
 * elegir un segmento limpia los otros dos — igual que el filtro `fl` de la
 * referencia LeoDarrosaFIT.
 */
function segmentFromFilters(filters: MemberFiltersState): Segment {
  if (filters.hasDebt) return 'debt';
  if (filters.membershipStatus === 'EXPIRED') return 'expired';
  if (filters.status === 'ACTIVE') return 'active';
  return 'all';
}

function patchForSegment(segment: Segment): Partial<MemberFiltersState> {
  switch (segment) {
    case 'active':
      return { status: 'ACTIVE', membershipStatus: '', hasDebt: false };
    case 'debt':
      return { status: '', membershipStatus: '', hasDebt: true };
    case 'expired':
      return { status: '', membershipStatus: 'EXPIRED', hasDebt: false };
    case 'all':
    default:
      return { status: '', membershipStatus: '', hasDebt: false };
  }
}

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

      <SegmentControl
        aria-label="Filtrar socios por estado"
        options={SEGMENT_OPTIONS}
        value={segmentFromFilters(filters)}
        onChange={(segment) => onChange(patchForSegment(segment))}
      />
    </div>
  );
}
