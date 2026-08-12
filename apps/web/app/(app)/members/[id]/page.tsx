'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  DeactivateMemberRequest,
  LedgerEntry,
  LedgerReason,
  MemberDetail,
  UpdateMemberRequest,
} from '@pulso/contracts/members';
import {
  Alert,
  Button,
  Card,
  DataTable,
  EmptyState,
  FormField,
  Input,
  Modal,
  MoneyDisplay,
  Skeleton,
  StatusBadge,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  useToast,
  type DataTableColumn,
} from '@pulso/ui';
import { deactivateMember, getMember, getMemberLedger, updateMember } from '@/lib/api/members';
import { ApiError } from '@/lib/api/errors';
import { PermissionGate, usePermission } from '@/lib/auth/permissions';
import { qk } from '@/lib/query/keys';
import { useSessionStore } from '@/lib/stores/session';

export default function MemberDetailPage() {
  return (
    <PermissionGate
      permission="member:read"
      fallback={
        <EmptyState title="Sin acceso" description="Tu usuario no tiene permiso para ver socios." />
      }
    >
      <MemberDetailScreen />
    </PermissionGate>
  );
}

interface EditFormState {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address: string;
  notes: string;
}

function toEditForm(m: MemberDetail): EditFormState {
  return {
    firstName: m.firstName,
    lastName: m.lastName,
    email: m.email ?? '',
    phone: m.phone ?? '',
    address: m.address ?? '',
    notes: m.notes ?? '',
  };
}

function MemberDetailScreen() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;
  const gymId = useSessionStore((s) => s.gym?.id ?? '');
  const canWrite = usePermission('member:write');
  const canDelete = usePermission('member:delete');
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [editOpen, setEditOpen] = React.useState(false);
  const [editForm, setEditForm] = React.useState<EditFormState | null>(null);
  const [editError, setEditError] = React.useState<string | undefined>();
  const [deactivateOpen, setDeactivateOpen] = React.useState(false);
  const [deactivateReason, setDeactivateReason] = React.useState('');
  const [deactivateError, setDeactivateError] = React.useState<string | undefined>();

  const memberQuery = useQuery({
    queryKey: qk.member(gymId, id),
    queryFn: () => getMember(id),
    enabled: Boolean(gymId && id),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: qk.member(gymId, id) });

  const updateMutation = useMutation({
    mutationFn: (payload: UpdateMemberRequest) => updateMember(id, payload),
    onSuccess: () => {
      toast({ title: 'Socio actualizado', tone: 'success' });
      setEditOpen(false);
      invalidate();
    },
    onError: (err: unknown) => setEditError(errorMessage(err)),
  });

  const deactivateMutation = useMutation({
    mutationFn: (payload: DeactivateMemberRequest) => deactivateMember(id, payload),
    onSuccess: () => {
      toast({ title: 'Socio desactivado', tone: 'success' });
      router.push('/members');
    },
    onError: (err: unknown) => setDeactivateError(errorMessage(err)),
  });

  const openEdit = (m: MemberDetail): void => {
    setEditForm(toEditForm(m));
    setEditError(undefined);
    setEditOpen(true);
  };

  const openDeactivate = (): void => {
    setDeactivateReason('');
    setDeactivateError(undefined);
    setDeactivateOpen(true);
  };

  if (memberQuery.isLoading) {
    return <MemberDetailSkeleton />;
  }

  if (memberQuery.isError) {
    const problem = memberQuery.error instanceof ApiError ? memberQuery.error : null;
    if (problem?.status === 404) {
      return (
        <EmptyState
          title="Socio no encontrado"
          description="Puede que haya sido dado de baja o que el link esté equivocado."
          action={
            <Button asChild variant="outline">
              <Link href="/members">Volver a socios</Link>
            </Button>
          }
        />
      );
    }
    return (
      <Alert tone="danger" title="No pudimos cargar el socio" live>
        {errorMessage(memberQuery.error)}
        <div className="mt-3">
          <Button size="sm" variant="outline" onClick={() => memberQuery.refetch()}>
            Reintentar
          </Button>
        </div>
      </Alert>
    );
  }

  const member = memberQuery.data;
  if (!member) return null;

  const hasDebt = Number(member.balance) > 0;
  const reasonRequired = hasDebt;
  const canConfirmDeactivate =
    !reasonRequired || deactivateReason.trim().length >= 5;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <p className="text-(--text-sm) text-(--color-muted)">Socio #{member.memberNumber}</p>
          <h1 className="text-(--text-2xl) font-semibold text-(--color-text)">
            {member.lastName}, {member.firstName}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            {member.status === 'ACTIVE' ? (
              <StatusBadge tone="success" label="Activo" />
            ) : (
              <StatusBadge tone="neutral" label="Inactivo" />
            )}
            {hasDebt ? (
              <StatusBadge tone="warning" label="Con deuda" />
            ) : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="ghost">
            <Link href="/members">Volver</Link>
          </Button>
          {canWrite && member.status === 'ACTIVE' ? (
            <Button variant="outline" onClick={() => openEdit(member)}>
              Editar
            </Button>
          ) : null}
          {canDelete && member.status === 'ACTIVE' ? (
            <Button variant="danger" onClick={openDeactivate}>
              Desactivar
            </Button>
          ) : null}
        </div>
      </div>

      <Tabs defaultValue="summary">
        <TabsList>
          <TabsTrigger value="summary">Resumen</TabsTrigger>
          <TabsTrigger value="memberships">Membresías</TabsTrigger>
          <TabsTrigger value="ledger">Cuenta corriente</TabsTrigger>
        </TabsList>

        <TabsContent value="summary">
          <SummarySection member={member} />
        </TabsContent>

        <TabsContent value="memberships">
          <EmptyState
            title="Membresías"
            description="Este módulo se completa en el próximo milestone."
          />
        </TabsContent>

        <TabsContent value="ledger">
          <LedgerSection memberId={id} gymId={gymId} />
        </TabsContent>
      </Tabs>

      <Modal
        open={editOpen}
        onOpenChange={setEditOpen}
        title="Editar socio"
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setEditOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="submit"
              form="member-edit-form"
              loading={updateMutation.isPending}
              disabled={updateMutation.isPending}
            >
              Guardar
            </Button>
          </>
        }
      >
        {editForm ? (
          <form
            id="member-edit-form"
            onSubmit={(event) => {
              event.preventDefault();
              setEditError(undefined);
              updateMutation.mutate({
                firstName: editForm.firstName.trim(),
                lastName: editForm.lastName.trim(),
                email: editForm.email.trim() ? editForm.email.trim() : null,
                phone: editForm.phone.trim() ? editForm.phone.trim() : null,
                address: editForm.address.trim() ? editForm.address.trim() : null,
                notes: editForm.notes.trim() ? editForm.notes.trim() : null,
              });
            }}
            className="flex flex-col gap-4"
          >
            {editError ? (
              <p role="alert" className="text-(--text-sm) font-medium text-(--color-danger)">
                {editError}
              </p>
            ) : null}
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Nombre" required>
                {(field) => (
                  <Input
                    {...field}
                    value={editForm.firstName}
                    onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })}
                    required
                  />
                )}
              </FormField>
              <FormField label="Apellido" required>
                {(field) => (
                  <Input
                    {...field}
                    value={editForm.lastName}
                    onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })}
                    required
                  />
                )}
              </FormField>
            </div>
            <FormField label="Email">
              {(field) => (
                <Input
                  {...field}
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                />
              )}
            </FormField>
            <FormField label="Teléfono">
              {(field) => (
                <Input
                  {...field}
                  type="tel"
                  value={editForm.phone}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                />
              )}
            </FormField>
            <FormField label="Dirección">
              {(field) => (
                <Input
                  {...field}
                  value={editForm.address}
                  onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                />
              )}
            </FormField>
            <FormField label="Notas">
              {(field) => (
                <Textarea
                  {...field}
                  value={editForm.notes}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                />
              )}
            </FormField>
          </form>
        ) : null}
      </Modal>

      <Modal
        open={deactivateOpen}
        onOpenChange={setDeactivateOpen}
        title="Desactivar socio"
        description={
          hasDebt
            ? 'El socio tiene deuda pendiente. Hace falta un motivo (mínimo 5 caracteres) para forzar la baja.'
            : `"${member.firstName} ${member.lastName}" dejará de operar. Podés reactivarlo desde su ficha.`
        }
        footer={
          <>
            <Button variant="outline" onClick={() => setDeactivateOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setDeactivateError(undefined);
                const payload: DeactivateMemberRequest = hasDebt
                  ? { force: true, reason: deactivateReason.trim() }
                  : { force: false };
                deactivateMutation.mutate(payload);
              }}
              disabled={!canConfirmDeactivate || deactivateMutation.isPending}
              loading={deactivateMutation.isPending}
            >
              Desactivar
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          {deactivateError ? (
            <p role="alert" className="text-(--text-sm) font-medium text-(--color-danger)">
              {deactivateError}
            </p>
          ) : null}
          {hasDebt ? (
            <FormField label="Motivo" required>
              {(field) => (
                <Textarea
                  {...field}
                  value={deactivateReason}
                  onChange={(e) => setDeactivateReason(e.target.value)}
                  placeholder="Ej.: baja voluntaria con saldo pendiente por acuerdo."
                />
              )}
            </FormField>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}

function SummarySection({ member }: { member: MemberDetail }) {
  return (
    <Card className="p-6">
      <dl className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-2">
        <SummaryRow label="Nombre" value={`${member.firstName} ${member.lastName}`} />
        <SummaryRow label="N° de socio" value={String(member.memberNumber)} />
        <SummaryRow label="Documento" value={`${member.documentType} ${member.documentNumber}`} />
        <SummaryRow label="Teléfono" value={member.phone ?? '—'} />
        <SummaryRow label="Email" value={member.email ?? '—'} />
        <SummaryRow label="Fecha de nacimiento" value={member.birthDate ?? '—'} />
        <SummaryRow label="Estado" value={member.status === 'ACTIVE' ? 'Activo' : 'Inactivo'} />
        <div>
          <dt className="text-(--text-xs) uppercase tracking-wide text-(--color-muted)">Deuda actual</dt>
          <dd className="mt-0.5 text-(--text-lg) font-semibold">
            <MoneyDisplay value={member.balance} emphasizeNegative />
          </dd>
        </div>
      </dl>
    </Card>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-(--text-xs) uppercase tracking-wide text-(--color-muted)">{label}</dt>
      <dd className="mt-0.5 text-(--text-base) text-(--color-text)">{value}</dd>
    </div>
  );
}

const REASON_LABEL: Record<LedgerReason, string> = {
  MEMBERSHIP_CHARGE: 'Cargo por membresía',
  PRODUCT_CHARGE: 'Cargo por producto',
  ADJUSTMENT_CHARGE: 'Ajuste manual',
  PAYMENT: 'Pago',
  REFUND: 'Devolución',
  REVERSAL: 'Reversa',
  DISCOUNT: 'Descuento',
};

function LedgerSection({ memberId, gymId }: { memberId: string; gymId: string }) {
  const query = useQuery({
    queryKey: qk.memberLedger(gymId, memberId),
    queryFn: () => getMemberLedger(memberId),
    enabled: Boolean(gymId && memberId),
  });

  const columns: DataTableColumn<LedgerEntry>[] = [
    {
      id: 'date',
      header: 'Fecha',
      cell: (e) => (
        <span className="text-(--color-muted) tabular-nums">
          {new Date(e.createdAt).toLocaleString('es-AR')}
        </span>
      ),
    },
    {
      id: 'reason',
      header: 'Motivo',
      cell: (e) => (
        <div className="flex flex-col">
          <span className="text-(--color-text)">{REASON_LABEL[e.reason]}</span>
          {e.description ? (
            <span className="text-(--text-xs) text-(--color-muted)">{e.description}</span>
          ) : null}
        </div>
      ),
    },
    {
      id: 'type',
      header: 'Tipo',
      cell: (e) =>
        e.type === 'DEBIT' ? (
          <StatusBadge tone="warning" label="Débito" />
        ) : (
          <StatusBadge tone="success" label="Crédito" />
        ),
    },
    {
      id: 'amount',
      header: 'Importe',
      cell: (e) => (
        <span className={e.type === 'DEBIT' ? 'text-(--color-danger)' : 'text-(--color-text)'}>
          {e.type === 'DEBIT' ? '-' : '+'} <MoneyDisplay value={e.amount} />
        </span>
      ),
      headerClassName: 'text-right',
      cellClassName: 'text-right',
    },
    {
      id: 'balance',
      header: 'Saldo',
      cell: (e) => <MoneyDisplay value={e.balanceAfter} emphasizeNegative />,
      headerClassName: 'text-right',
      cellClassName: 'text-right',
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      {query.data ? (
        <Card className="flex items-center justify-between p-4">
          <span className="text-(--text-sm) text-(--color-muted)">Saldo actual</span>
          <span className="text-(--text-lg) font-semibold">
            <MoneyDisplay value={query.data.balance} emphasizeNegative />
          </span>
        </Card>
      ) : null}
      <DataTable
        caption="Movimientos de cuenta corriente"
        columns={columns}
        data={query.data?.entries ?? []}
        rowKey={(e) => e.id}
        loading={query.isLoading}
        error={query.isError ? errorMessage(query.error) : undefined}
        onRetry={() => query.refetch()}
        emptyTitle="Todavía no hay movimientos"
        emptyDescription="Cuando el socio genere cargos o pagos van a aparecer acá."
      />
    </div>
  );
}

function MemberDetailSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-5 w-32" />
      </div>
      <Skeleton className="h-56 w-full" />
    </div>
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.detail ?? error.message;
  return 'Ocurrió un error inesperado.';
}
