'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { AccessCheckResponse, AccessMethod } from '@pulso/contracts/access';
import { EmptyState, Skeleton } from '@pulso/ui';
import { checkAccess } from '@/lib/api/access';
import { ApiError } from '@/lib/api/errors';
import { PermissionGate } from '@/lib/auth/permissions';
import { useDelayedFlag } from '@/lib/hooks/useDelayedFlag';
import { useSessionStore } from '@/lib/stores/session';
import { AccessResultCard } from '@/components/access/AccessResultCard';

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

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const identifier = value.trim();
    if (!identifier || mutation.isPending) return;
    setValue('');
    mutation.mutate(identifier);
  };

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-(--text-2xl) font-semibold text-(--color-text)">Control de acceso</h1>

      <form onSubmit={handleSubmit}>
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
          className="h-14 w-full max-w-md rounded-(--radius-lg) border border-(--color-border-strong) bg-(--color-surface) px-4 text-(--text-xl) text-(--color-text) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)"
          placeholder="Escaneá o tipeá y presioná Enter"
        />
      </form>

      {isNetworkError ? (
        <p role="alert" className="text-(--text-sm) font-medium text-(--color-danger)">
          Sin conexión — reintentando…
        </p>
      ) : null}

      {showSkeleton && !lastResult ? (
        <div className="flex flex-col gap-4 rounded-(--radius-lg) border-2 border-(--color-border) p-6">
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
    </div>
  );
}
