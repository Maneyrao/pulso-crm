'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { ChevronDown, LogOut, User } from 'lucide-react';
import { Badge, Button, StatusBadge } from '@pulso/ui';
import { PageHeader } from '@/components/shared/PageHeader';
import { logout } from '@/lib/api/auth';
import { useSessionStore } from '@/lib/stores/session';

/**
 * Mi cuenta: datos reales de la sesión activa (`GET /auth/me`, ya en el
 * store — no hace falta una query nueva) + logout.
 *
 * No hay campo "Rol" en `AuthUser`/`AuthSession` (API_CONTRACTS §3): sólo
 * viaja `permissions: Permission[]`, sin un nombre de rol resuelto para el
 * usuario en sesión. Por eso esta pantalla muestra los permisos reales en
 * vez de inventar un rol. Tampoco hay endpoint de "cambiar mi contraseña"
 * (sólo `resetUserPassword(id)`, una acción administrativa sobre OTRO
 * usuario) ni datos de segundo factor / última actividad: no se muestran
 * porque no existen en el backend.
 */
export default function AccountPage() {
  const user = useSessionStore((s) => s.user);
  const gym = useSessionStore((s) => s.gym);
  const branches = useSessionStore((s) => s.branches);
  const activeBranchId = useSessionStore((s) => s.activeBranchId);
  const permissions = useSessionStore((s) => s.permissions);
  const clearSession = useSessionStore((s) => s.clearSession);
  const router = useRouter();
  const queryClient = useQueryClient();
  const [loggingOut, setLoggingOut] = React.useState(false);

  if (!user) return null;

  const initials = getInitials(user.firstName, user.lastName);
  const activeBranch = branches.find((b) => b.id === activeBranchId);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await logout();
    } finally {
      clearSession();
      queryClient.clear();
      router.push('/login');
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={User}
        title="Mi cuenta"
        description="Datos de tu usuario y permisos en el gimnasio actual."
        actions={
          <Button variant="danger" onClick={() => void handleLogout()} loading={loggingOut}>
            <LogOut className="h-4 w-4" aria-hidden={true} />
            Cerrar sesión
          </Button>
        }
      />

      <div className="flex flex-col gap-3">
        <AccordionSection title="Perfil" defaultOpen>
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
              <dd className="mt-0.5 text-(--text-base) text-(--color-text)">{activeBranch?.name ?? '—'}</dd>
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
        </AccordionSection>

        <AccordionSection title={`Permisos (${permissions.length})`}>
          {permissions.length === 0 ? (
            <p className="text-(--text-sm) text-(--color-muted)">Sin permisos asignados.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {[...permissions].sort().map((permission) => (
                <StatusBadge key={permission} tone="info" label={permission} />
              ))}
            </div>
          )}
        </AccordionSection>
      </div>
    </div>
  );
}

function AccordionSection({
  title,
  defaultOpen,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details
      open={defaultOpen}
      className="group rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface)"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-(--text-base) font-medium text-(--color-text) [&::-webkit-details-marker]:hidden">
        {title}
        <ChevronDown
          className="h-4 w-4 shrink-0 text-(--color-muted) transition-transform duration-200 group-open:rotate-180"
          aria-hidden={true}
        />
      </summary>
      <div className="flex flex-col gap-4 border-t border-(--color-border) px-4 py-4">{children}</div>
    </details>
  );
}

function getInitials(firstName: string, lastName: string): string {
  const a = firstName.trim().charAt(0);
  const b = lastName.trim().charAt(0);
  return `${a}${b}`.toUpperCase() || '?';
}
