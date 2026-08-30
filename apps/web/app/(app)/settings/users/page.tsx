'use client';

import * as React from 'react';
import { Users as UsersIcon } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateUserRequest, UpdateUserRequest, User } from '@pulso/contracts/iam';
import {
  Button,
  Checkbox,
  ConfirmDialog,
  DataTable,
  EmptyState,
  FormField,
  Input,
  Modal,
  StatusBadge,
  useToast,
  type DataTableColumn,
} from '@pulso/ui';
import { PageHeader } from '@/components/shared/PageHeader';
import { listBranches } from '@/lib/api/tenancy';
import {
  createUser,
  deactivateUser,
  listRoles,
  listUsers,
  resetUserPassword,
  updateUser,
} from '@/lib/api/iam';
import { ApiError } from '@/lib/api/errors';
import { PermissionGate } from '@/lib/auth/permissions';
import { qk } from '@/lib/query/keys';
import { useSessionStore } from '@/lib/stores/session';

/**
 * T-2.6 — Settings › Usuarios.
 *
 * Alta, edición, desactivación y reset de contraseña. La contraseña temporal
 * NUNCA la elige quien completa el formulario (API_CONTRACTS §5): el backend
 * la genera y este componente la muestra en un diálogo aparte, UNA sola vez
 * — no queda guardada en ningún estado que sobreviva a cerrar ese diálogo
 * (criterio de aceptación #5 de T-2.6).
 */
export default function UsersSettingsPage() {
  return (
    <PermissionGate
      permission="user:read"
      fallback={
        <EmptyState
          title="Sin acceso"
          description="Tu usuario no tiene permiso para ver esta pantalla."
        />
      }
    >
      <UsersScreen />
    </PermissionGate>
  );
}

interface UserFormState {
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  roleIds: string[];
  branchIds: string[];
}

const EMPTY_FORM: UserFormState = {
  email: '',
  firstName: '',
  lastName: '',
  phone: '',
  roleIds: [],
  branchIds: [],
};

function UsersScreen() {
  const gymId = useSessionStore((s) => s.gym?.id);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<User | null>(null);
  const [form, setForm] = React.useState<UserFormState>(EMPTY_FORM);
  const [formError, setFormError] = React.useState<string | undefined>();
  const [toDeactivate, setToDeactivate] = React.useState<User | null>(null);
  const [toResetPassword, setToResetPassword] = React.useState<User | null>(null);
  /** Se muestra UNA vez y se descarta — nunca se persiste en la query cache ni en localStorage. */
  const [revealedPassword, setRevealedPassword] = React.useState<{
    email: string;
    password: string;
  } | null>(null);

  const usersQuery = useQuery({
    queryKey: qk.users(gymId ?? '', {}),
    queryFn: () => listUsers(),
    enabled: Boolean(gymId),
  });
  const rolesQuery = useQuery({
    queryKey: qk.roles(gymId ?? ''),
    queryFn: listRoles,
    enabled: Boolean(gymId),
  });
  const branchesQuery = useQuery({
    queryKey: qk.branches(gymId ?? ''),
    queryFn: listBranches,
    enabled: Boolean(gymId),
  });

  const roleName = React.useCallback(
    (roleId: string) => rolesQuery.data?.data.find((r) => r.id === roleId)?.name ?? roleId,
    [rolesQuery.data],
  );
  const branchName = React.useCallback(
    (branchId: string) => branchesQuery.data?.data.find((b) => b.id === branchId)?.name ?? branchId,
    [branchesQuery.data],
  );

  const invalidateUsers = () => queryClient.invalidateQueries({ queryKey: ['users', gymId ?? ''] });

  const createMutation = useMutation({
    mutationFn: (payload: CreateUserRequest) => createUser(payload),
    onSuccess: (result) => {
      setFormOpen(false);
      invalidateUsers();
      setRevealedPassword({ email: result.user.email, password: result.temporaryPassword });
    },
    onError: (error: unknown) => setFormError(errorMessage(error)),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: UpdateUserRequest }) =>
      updateUser(id, payload),
    onSuccess: () => {
      toast({ title: 'Usuario actualizado', tone: 'success' });
      setFormOpen(false);
      invalidateUsers();
    },
    onError: (error: unknown) => setFormError(errorMessage(error)),
  });

  const deactivateMutation = useMutation({
    mutationFn: (id: string) => deactivateUser(id),
    onSuccess: () => {
      toast({ title: 'Usuario desactivado', tone: 'success' });
      setToDeactivate(null);
      invalidateUsers();
    },
    onError: (error: unknown) => {
      // El invariante "último OWNER" (409 LAST_OWNER) llega acá: se muestra
      // el detail del backend tal cual, no se reinterpreta en el frontend.
      toast({ title: 'No se pudo desactivar', description: errorMessage(error), tone: 'danger' });
      setToDeactivate(null);
    },
  });

  const resetPasswordMutation = useMutation({
    mutationFn: (id: string) => resetUserPassword(id),
    onSuccess: (result, id) => {
      setToResetPassword(null);
      const user = usersQuery.data?.data.find((u) => u.id === id);
      setRevealedPassword({ email: user?.email ?? '', password: result.temporaryPassword });
      invalidateUsers();
    },
    onError: (error: unknown) => {
      toast({
        title: 'No se pudo resetear la contraseña',
        description: errorMessage(error),
        tone: 'danger',
      });
      setToResetPassword(null);
    },
  });

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setFormError(undefined);
    setFormOpen(true);
  };

  const openEdit = (user: User) => {
    setEditing(user);
    setForm({
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone ?? '',
      roleIds: [...user.roleIds],
      branchIds: [...user.branchIds],
    });
    setFormError(undefined);
    setFormOpen(true);
  };

  const toggleRole = (roleId: string) => {
    setForm((f) => ({
      ...f,
      roleIds: f.roleIds.includes(roleId)
        ? f.roleIds.filter((id) => id !== roleId)
        : [...f.roleIds, roleId],
    }));
  };
  const toggleBranch = (branchId: string) => {
    setForm((f) => ({
      ...f,
      branchIds: f.branchIds.includes(branchId)
        ? f.branchIds.filter((id) => id !== branchId)
        : [...f.branchIds, branchId],
    }));
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(undefined);

    if (editing) {
      updateMutation.mutate({
        id: editing.id,
        payload: {
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          phone: form.phone.trim() || null,
          roleIds: form.roleIds,
          branchIds: form.branchIds,
        },
      });
      return;
    }

    if (form.roleIds.length === 0) {
      setFormError('Elegí al menos un rol.');
      return;
    }
    createMutation.mutate({
      email: form.email.trim().toLowerCase(),
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
      roleIds: form.roleIds,
      branchIds: form.branchIds,
    });
  };

  const columns: DataTableColumn<User>[] = [
    {
      id: 'name',
      header: 'Usuario',
      cell: (u) => (
        <span className="font-medium">
          {u.firstName} {u.lastName}
        </span>
      ),
    },
    {
      id: 'email',
      header: 'Email',
      cell: (u) => <span className="text-(--text-sm) text-(--color-muted)">{u.email}</span>,
    },
    {
      id: 'roles',
      header: 'Rol',
      cell: (u) => (
        <div className="flex flex-wrap gap-1">
          {u.roleIds.length === 0 ? (
            <span className="text-(--color-muted)">—</span>
          ) : (
            u.roleIds.map((roleId) => (
              <StatusBadge key={roleId} tone="info" label={roleName(roleId)} />
            ))
          )}
        </div>
      ),
    },
    {
      id: 'branches',
      header: 'Sede',
      cell: (u) =>
        u.branchIds.length === 0 ? (
          <StatusBadge tone="neutral" label="Todas" />
        ) : (
          <div className="flex flex-wrap gap-1">
            {u.branchIds.map((branchId) => (
              <StatusBadge key={branchId} tone="neutral" label={branchName(branchId)} />
            ))}
          </div>
        ),
    },
    {
      id: 'status',
      header: 'Estado',
      cell: (u) => {
        if (u.status === 'ACTIVE') return <StatusBadge tone="success" label="Activo" />;
        if (u.status === 'LOCKED') return <StatusBadge tone="warning" label="Bloqueado" />;
        return <StatusBadge tone="neutral" label="Inactivo" />;
      },
    },
    {
      id: 'actions',
      header: '',
      cell: (u) => (
        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => openEdit(u)}>
            Editar
          </Button>
          <PermissionGate permission="user:write">
            <Button variant="ghost" size="sm" onClick={() => setToResetPassword(u)}>
              Resetear contraseña
            </Button>
          </PermissionGate>
          {u.status === 'ACTIVE' ? (
            <PermissionGate permission="user:write">
              <Button variant="danger" size="sm" onClick={() => setToDeactivate(u)}>
                Desactivar
              </Button>
            </PermissionGate>
          ) : null}
        </div>
      ),
      headerClassName: 'text-right',
      cellClassName: 'text-right',
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={UsersIcon}
        title="Usuarios"
        description="Personas con acceso al sistema, su rol y su sede."
        actions={
          <PermissionGate permission="user:write">
            <Button onClick={openCreate}>Nuevo usuario</Button>
          </PermissionGate>
        }
      />

      <DataTable
        caption="Usuarios del gimnasio"
        columns={columns}
        data={usersQuery.data?.data ?? []}
        rowKey={(u) => u.id}
        loading={usersQuery.isLoading}
        error={usersQuery.isError ? errorMessage(usersQuery.error) : undefined}
        onRetry={() => usersQuery.refetch()}
        emptyTitle="Todavía no hay usuarios"
        emptyDescription="Creá el primer usuario para dar acceso al sistema."
      />

      <Modal
        open={formOpen}
        onOpenChange={setFormOpen}
        title={editing ? 'Editar usuario' : 'Nuevo usuario'}
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setFormOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="submit"
              form="user-form"
              loading={createMutation.isPending || updateMutation.isPending}
            >
              Guardar
            </Button>
          </>
        }
      >
        <form id="user-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
          {formError ? (
            <p role="alert" className="text-(--text-sm) font-medium text-(--color-danger)">
              {formError}
            </p>
          ) : null}

          <div className="grid grid-cols-2 gap-4">
            <FormField label="Nombre" required>
              {(field) => (
                <Input
                  {...field}
                  value={form.firstName}
                  onChange={(e) => setForm((f) => ({ ...f, firstName: e.target.value }))}
                  required
                />
              )}
            </FormField>
            <FormField label="Apellido" required>
              {(field) => (
                <Input
                  {...field}
                  value={form.lastName}
                  onChange={(e) => setForm((f) => ({ ...f, lastName: e.target.value }))}
                  required
                />
              )}
            </FormField>
          </div>

          <FormField
            label="Email"
            required
            hint={editing ? 'El email no se puede editar.' : undefined}
          >
            {(field) => (
              <Input
                {...field}
                type="email"
                value={form.email}
                disabled={Boolean(editing)}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                required
              />
            )}
          </FormField>

          <FormField label="Teléfono">
            {(field) => (
              <Input
                {...field}
                value={form.phone}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              />
            )}
          </FormField>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-(--text-sm) font-medium text-(--color-text)">Roles</legend>
            <div className="flex flex-col gap-2">
              {(rolesQuery.data?.data ?? []).map((role) => (
                <label
                  key={role.id}
                  className="flex items-center gap-2 text-(--text-sm) text-(--color-text)"
                >
                  <Checkbox
                    checked={form.roleIds.includes(role.id)}
                    onChange={() => toggleRole(role.id)}
                  />
                  {role.name}
                </label>
              ))}
            </div>
          </fieldset>

          <fieldset className="flex flex-col gap-2">
            <legend className="text-(--text-sm) font-medium text-(--color-text)">Sedes</legend>
            <p className="text-(--text-xs) text-(--color-muted)">
              Sin selección = acceso a todas las sedes activas del gimnasio.
            </p>
            <div className="flex flex-col gap-2">
              {(branchesQuery.data?.data ?? []).map((branch) => (
                <label
                  key={branch.id}
                  className="flex items-center gap-2 text-(--text-sm) text-(--color-text)"
                >
                  <Checkbox
                    checked={form.branchIds.includes(branch.id)}
                    onChange={() => toggleBranch(branch.id)}
                  />
                  {branch.name}
                </label>
              ))}
            </div>
          </fieldset>
        </form>
      </Modal>

      <ConfirmDialog
        open={toDeactivate !== null}
        onOpenChange={(open) => !open && setToDeactivate(null)}
        title="Desactivar usuario"
        description={`"${toDeactivate?.firstName} ${toDeactivate?.lastName}" no va a poder iniciar sesión. Se revocan sus sesiones activas.`}
        tone="danger"
        confirmLabel="Desactivar"
        loading={deactivateMutation.isPending}
        onConfirm={() => {
          if (toDeactivate) deactivateMutation.mutate(toDeactivate.id);
        }}
      />

      <ConfirmDialog
        open={toResetPassword !== null}
        onOpenChange={(open) => !open && setToResetPassword(null)}
        title="Resetear contraseña"
        description={`Se genera una contraseña temporal nueva para "${toResetPassword?.firstName} ${toResetPassword?.lastName}" y se cierran sus sesiones activas.`}
        confirmLabel="Resetear"
        loading={resetPasswordMutation.isPending}
        onConfirm={() => {
          if (toResetPassword) resetPasswordMutation.mutate(toResetPassword.id);
        }}
      />

      {/* Criterio de aceptación #5: la temporal se muestra UNA sola vez. Cerrar
          este diálogo descarta `revealedPassword` del estado — no hay forma
          de volver a verla desde acá; sólo un nuevo reset la genera de nuevo. */}
      <Modal
        open={revealedPassword !== null}
        onOpenChange={(open) => !open && setRevealedPassword(null)}
        title="Contraseña temporal"
        description={`Compartíla con ${revealedPassword?.email ?? 'el usuario'} por un canal seguro. No se va a volver a mostrar.`}
        footer={<Button onClick={() => setRevealedPassword(null)}>Listo, ya la copié</Button>}
      >
        <div className="flex items-center justify-between gap-2 rounded-(--radius-md) border border-(--color-border-strong) bg-(--color-muted-subtle) px-4 py-3">
          <code className="text-(--text-lg) font-mono tracking-wide text-(--color-text)">
            {revealedPassword?.password}
          </code>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              if (revealedPassword) void navigator.clipboard?.writeText(revealedPassword.password);
            }}
          >
            Copiar
          </Button>
        </div>
        <p className="mt-3 text-(--text-sm) text-(--color-muted)">
          El usuario va a tener que cambiarla en su primer inicio de sesión.
        </p>
      </Modal>
    </div>
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.detail ?? error.message;
  return 'Ocurrió un error inesperado.';
}
