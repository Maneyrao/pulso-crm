'use client';

import type { ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle, Skeleton } from '@pulso/ui';

export interface KpiCardProps {
  title: string;
  loading?: boolean;
  /** Mensaje de error propio de ESTA tarjeta: una caída no rompe el resto del dashboard. */
  error?: string;
  value?: ReactNode;
  hint?: string;
}

/**
 * KPI del inicio: label uppercase chico (CardTitle sin overrides — mismo
 * tratamiento que "ÚLTIMOS ACCESOS"/"CAJA · HOY") y valor grande en negrita
 * (30px, `--text-3xl`), sin deltas inventados (LEODARROSAFIT_ALIGNMENT_PLAN.md
 * Fase 2A, misión dashboard).
 */
export function KpiCard({ title, loading, error, value, hint }: KpiCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-9 w-24" />
        ) : error ? (
          <p role="alert" className="text-(--text-sm) text-(--color-danger)">
            {error}
          </p>
        ) : (
          <>
            <p className="text-(--text-3xl) font-bold tabular-nums text-(--color-text)">{value}</p>
            {hint ? <p className="mt-1 text-(--text-xs) text-(--color-muted)">{hint}</p> : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
