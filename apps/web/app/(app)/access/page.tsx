'use client';

import { useEffect, useRef, useState } from 'react';
import { DoorOpen } from 'lucide-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { AccessCheckResponse, AccessMethod } from '@pulso/contracts/access';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, EmptyState, Skeleton } from '@pulso/ui';
import { checkAccess, listAccessAttempts } from '@/lib/api/access';
import { ApiError } from '@/lib/api/errors';
import { PermissionGate, usePermission } from '@/lib/auth/permissions';
import { useDelayedFlag } from '@/lib/hooks/useDelayedFlag';
import { useSessionStore } from '@/lib/stores/session';
import { ACCESS_REASON_CONFIG } from '@/components/access/reason-config';
import { AccessResultCard } from '@/components/access/AccessResultCard';
import { FingerprintAccessPanel } from '@/components/access/FingerprintAccessPanel';
import { PageHeader } from '@/components/shared/PageHeader';
import { qk } from '@/lib/query/keys';

const RECENT_ATTEMPTS_LIMIT = 8;
const RECENT_ATTEMPTS_REFETCH_MS = 5000;

const ACCESS_METHOD_LABEL: Record<AccessMethod, string> = {
  DOCUMENT: 'Documento',
  CARD: 'Tarjeta',
  MEMBER_NUMBER: 'N° socio',
  FINGERPRINT: 'Huella',
  MANUAL: 'Manual',
};

/** Sólo dígitos -> documento; cualquier otra cosa -> tarjeta (FRONTEND_PLAN §6.3). */
function detectMethod(identifier: string): AccessMethod {
  return /^\d+$/.test(identifier) ? 'DOCUMENT' : 'CARD';
}

export default function AccessPage() {
  return (
    <PermissionGate
      permission="access:operate"
      fallback={
        <EmptyState title="Sin acceso" description="Tu usuario no tiene permiso para operar esta pantalla." />
      }
    >
      <AccessScreen />
    </PermissionGate>
  );
}

function AccessScreen() {
  const activeBranchId = useSessionStore((s) => s.activeBranchId);
  const gymId = useSessionStore((s) => s.gym?.id ?? '');
  const canReadHistory = usePermission('access:read_history');
  const [value, setValue] = useState('');
  const [lastResult, setLastResult] = useState<AccessCheckResponse | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const mutation = useMutation({
    mutationFn: (identifier: string) =>
      checkAccess({
        branchId: activeBranchId ?? '',
        method: detectMethod(identifier),
        identifier,
        registerAttendance: true,
      }),
    onSuccess: (data) => {
      setLastResult(data);
    },
    onSettled: () => {
      // El foco vuelve siempre al input: un lector de tarjetas no puede
      // depender de que alguien haga click (FRONTEND_PLAN §6.3).
      inputRef.current?.focus();
    },
  });

  const isNetworkError = mutation.isError && mutation.error instanceof ApiError && mutation.error.isNetworkError;

  // Reintento automático ante un corte de red: el resultado anterior no se
  // borra mientras tanto (FRONTEND_PLAN §6.3 "Error de red").
  useEffect(() => {
    if (isNetworkError && mutation.variables) {
      retryTimer.current = setTimeout(() => {
        mutation.mutate(mutation.variables);
      }, 2500);
    }
    return () => {
      if (retryTimer.current) clearTimeout(retryTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNetworkError]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const showSkeleton = useDelayedFlag(mutation.isPending, 150);

  const recentAttempts = useQuery({
    queryKey: qk.accessAttempts(gymId, activeBranchId, { limit: RECENT_ATTEMPTS_LIMIT }),
    queryFn: () => listAccessAttempts(activeBranchId, RECENT_ATTEMPTS_LIMIT),
    enabled: canReadHistory,
    refetchInterval: RECENT_ATTEMPTS_REFETCH_MS,
  });

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const identifier = value.trim();
    if (!identifier || mutation.isPending) return;
    setValue('');
    mutation.mutate(identifier);
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={DoorOpen}
        title="Control de acceso"
        description="Registrá ingresos por documento, tarjeta o huella y validá la membresía al instante."
        className="mb-0"
      />

      <form onSubmit={handleSubmit} className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1">
          <label htmlFor="access-input" className="mb-1.5 block text-(--text-sm) font-medium text-(--color-text)">
            Documento o tarjeta
          </label>
          <input
            id="access-input"
            ref={inputRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={() => {
              // El input tiene que mantener el foco siempre: si algo se lo
              // saca (click accidental, etc.), vuelve solo.
              window.setTimeout(() => inputRef.current?.focus(), 0);
            }}
            autoComplete="off"
            autoFocus
            className="h-14 w-full border-2 border-(--color-border-strong) bg-(--color-surface) px-4 text-(--text-xl) font-bold tabular-nums text-(--color-text) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)"
            placeholder="Ingresá DNI o pasá tarjeta…"
          />
        </div>
        <Button type="submit" size="lg" disabled={mutation.isPending} loading={mutation.isPending} className="sm:w-auto">
          Registrar
        </Button>
      </form>

      <FingerprintAccessPanel
        branchId={activeBranchId}
        onResult={setLastResult}
        onAttemptRecorded={() => void recentAttempts.refetch()}
      />

      {isNetworkError ? (
        <p role="alert" className="text-(--text-sm) font-medium text-(--color-danger)">
          Sin conexión — reintentando…
        </p>
      ) : null}

      {showSkeleton && !lastResult ? (
        <div className="flex flex-col gap-4 border-2 border-(--color-border) p-6">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-16 w-full max-w-sm" />
        </div>
      ) : lastResult ? (
        <AccessResultCard result={lastResult} />
      ) : (
        <EmptyState
          title="Esperando una lectura"
          description="Escaneá una tarjeta o tipeá el documento del socio y presioná Enter."
        />
      )}

      {canReadHistory ? (
        <Card>
          <CardHeader>
            <CardTitle>Actividad reciente</CardTitle>
          </CardHeader>
          <CardContent>
            {recentAttempts.isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  // Placeholders sin identidad propia: el índice es una key estable válida acá.
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : recentAttempts.isError ? (
              <p role="alert" className="text-(--text-sm) text-(--color-danger)">
                No pudimos cargar la actividad reciente.
              </p>
            ) : recentAttempts.data && recentAttempts.data.data.length > 0 ? (
              <ul>
                {recentAttempts.data.data.map((attempt) => {
                  const config = ACCESS_REASON_CONFIG[attempt.reasonCode];
                  const allowed = attempt.decision === 'ALLOWED';
                  return (
                    <li
                      key={attempt.id}
                      className="flex items-center gap-3 border-b border-(--color-border) py-3 last:border-0"
                    >
                      <span
                        aria-hidden={true}
                        className={`h-2.5 w-2.5 shrink-0 rounded-(--radius-full) ${
                          allowed ? 'bg-(--color-access-allowed)' : 'bg-(--color-access-denied)'
                        }`}
                      />
                      <span className="sr-only">{allowed ? 'Permitido' : 'Denegado'}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-bold text-(--color-text)">
                          {attempt.rawInputMasked ?? ACCESS_METHOD_LABEL[attempt.method]}
                        </p>
                        <p className="truncate text-(--text-xs) text-(--color-muted)">
                          {ACCESS_METHOD_LABEL[attempt.method]} · {config.title}
                        </p>
                      </div>
                      <Badge tone={config.tone}>{allowed ? 'Permitido' : 'Denegado'}</Badge>
                      <span className="shrink-0 text-(--text-xs) tabular-nums text-(--color-muted)">
                        {formatTime(attempt.occurredAt)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="py-4 text-center text-(--text-sm) text-(--color-muted)">
                Todavía no hay actividad registrada.
              </p>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}
