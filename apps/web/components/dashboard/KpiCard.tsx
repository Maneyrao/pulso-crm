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

export function KpiCard({ title, loading, error, value, hint }: KpiCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-(--text-sm) font-medium text-(--color-muted)">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-8 w-24" />
        ) : error ? (
          <p role="alert" className="text-(--text-sm) text-(--color-danger)">
            {error}
          </p>
        ) : (
          <>
            <p className="text-(--text-2xl) font-semibold text-(--color-text)">{value}</p>
            {hint ? <p className="mt-1 text-(--text-xs) text-(--color-muted)">{hint}</p> : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
