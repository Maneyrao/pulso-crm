'use client';

import { User } from 'lucide-react';
import { Badge, Card, CardContent } from '@pulso/ui';
import { PageHeader } from '@/components/shared/PageHeader';
import { useSessionStore } from '@/lib/stores/session';

/**
 * Mi cuenta: datos de la sesión activa (`GET /auth/me`, ya en el store — no
 * hace falta una query nueva).
 *
 * No hay endpoint de cambio de contraseña propio en `lib/api/auth.ts` ni en
 * `lib/api/iam.ts` — sólo `resetUserPassword(id)` en `iam.ts`, que es una
 * acción administrativa sobre OTRO usuario (`POST /users/:id/reset-password`,
 * pensada para IAM), no un "cambiar mi contraseña" con actual/nueva/repetir.
 * Por eso esta pantalla es de sólo lectura, sin esa sección.
 */
export default function AccountPage() {
  const user = useSessionStore((s) => s.user);
  const gym = useSessionStore((s) => s.gym);
  const branches = useSessionStore((s) => s.branches);
  const activeBranchId = useSessionStore((s) => s.activeBranchId);

  if (!user) return null;

  const initials = getInitials(user.firstName, user.lastName);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={User} title="Mi cuenta" description="Datos de tu usuario en el gimnasio actual." />

      <Card>
        <CardContent className="flex flex-col gap-6">
          <div className="flex items-center gap-4">
            <span
              aria-hidden="true"
              className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-(--color-primary-subtle) text-(--text-xl) font-semibold text-(--color-primary-subtle-foreground)"
            >
              {initials}
            </span>
            <div className="min-w-0">
              <p className="text-(--text-lg) font-semibold text-(--color-text)">
                {user.firstName} {user.lastName}
              </p>
              <p className="text-(--text-sm) text-(--color-muted)">{user.email}</p>
            </div>
          </div>

          <dl className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-2">
            <div>
              <dt className="text-(--text-xs) uppercase tracking-wide text-(--color-muted)">Gimnasio</dt>
              <dd className="mt-0.5 text-(--text-base) text-(--color-text)">{gym?.name ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-(--text-xs) uppercase tracking-wide text-(--color-muted)">Sede activa</dt>
              <dd className="mt-0.5 text-(--text-base) text-(--color-text)">
                {branches.find((b) => b.id === activeBranchId)?.name ?? '—'}
              </dd>
            </div>
            <div className="md:col-span-2">
              <dt className="text-(--text-xs) uppercase tracking-wide text-(--color-muted)">
                Sedes con acceso
              </dt>
              <dd className="mt-1.5 flex flex-wrap gap-2">
                {branches.length === 0 ? (
                  <span className="text-(--text-sm) text-(--color-muted)">—</span>
                ) : (
                  branches.map((b) => (
                    <Badge key={b.id} tone={b.id === activeBranchId ? 'primary' : 'neutral'}>
                      {b.name}
                    </Badge>
                  ))
                )}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}

function getInitials(firstName: string, lastName: string): string {
  const a = firstName.trim().charAt(0);
  const b = lastName.trim().charAt(0);
  return `${a}${b}`.toUpperCase() || '?';
}
