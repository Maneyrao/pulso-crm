'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useRouter, useSearchParams } from 'next/navigation';
import type { z } from 'zod';
import { loginRequestSchema } from '@pulso/contracts/auth';
import { Button, FormField, Input } from '@pulso/ui';
import { login, resolveActiveBranchId } from '@/lib/api/auth';
import { ApiError } from '@/lib/api/errors';
import { useSessionStore } from '@/lib/stores/session';

// Sin `gymSlug`: ese campo sólo se usa en el flujo de "más de un gimnasio"
// (409 MULTIPLE_GYMS), fuera de alcance de este formulario base.
const formSchema = loginRequestSchema.pick({ email: true, password: true });
type LoginFormValues = z.infer<typeof formSchema>;

const GENERIC_ERROR = 'Email o contraseña incorrectos.';

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setSession = useSessionStore((s) => s.setSession);
  const [formError, setFormError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setFocus,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { email: '', password: '' },
  });

  // Foco inicial en el primer campo: acelera el flujo de teclado en recepción.
  useEffect(() => {
    setFocus('email');
  }, [setFocus]);

  useEffect(() => {
    if (errors.email) setFocus('email');
    else if (errors.password) setFocus('password');
  }, [errors.email, errors.password, setFocus]);

  const mutation = useMutation({
    mutationFn: (values: LoginFormValues) => login(values),
    onSuccess: (session) => {
      const activeBranchId = resolveActiveBranchId(session);
      if (!activeBranchId) {
        setFormError(
          'Tu usuario no tiene sedes asignadas. Contactá al administrador del gimnasio.',
        );
        return;
      }
      setSession({
        user: session.user,
        gym: session.gym,
        branches: session.branches,
        activeBranchId,
        permissions: session.permissions,
      });
      const returnTo = searchParams.get('returnTo');
      router.push(returnTo && returnTo.startsWith('/') ? returnTo : '/dashboard');
    },
    onError: (error: unknown) => {
      if (error instanceof ApiError) {
        if (error.code === 'ACCOUNT_LOCKED') {
          setFormError(
            error.detail ?? 'Tu cuenta está bloqueada temporalmente. Probá de nuevo más tarde.',
          );
          return;
        }
        if (error.code === 'GYM_SUSPENDED') {
          setFormError('El gimnasio está suspendido. Contactá a soporte.');
          return;
        }
        if (error.isNetworkError) {
          setFormError('No pudimos conectarnos con el servidor. Probá de nuevo.');
          return;
        }
      }
      // INVALID_CREDENTIALS y cualquier otro caso caen acá: un solo mensaje
      // genérico, nunca se distingue si falló el email o la contraseña.
      setFormError(GENERIC_ERROR);
    },
  });

  const loading = mutation.isPending;

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    mutation.mutate(values);
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex w-full max-w-sm flex-col gap-4">
      {formError ? (
        <p
          role="alert"
          className="rounded-(--radius-md) border border-(--color-danger) bg-(--color-danger-subtle) p-3 text-(--text-sm) text-(--color-danger-subtle-foreground)"
        >
          {formError}
        </p>
      ) : null}

      <FormField label="Email" error={errors.email?.message} required>
        {(field) => (
          <Input
            {...field}
            {...register('email')}
            type="email"
            autoComplete="username"
            disabled={loading}
            invalid={Boolean(errors.email)}
          />
        )}
      </FormField>

      <FormField label="Contraseña" error={errors.password?.message} required>
        {(field) => (
          <Input
            {...field}
            {...register('password')}
            type="password"
            autoComplete="current-password"
            disabled={loading}
            invalid={Boolean(errors.password)}
          />
        )}
      </FormField>

      <Button type="submit" loading={loading} loadingText="Iniciando sesión" className="mt-2">
        Iniciar sesión
      </Button>
    </form>
  );
}
