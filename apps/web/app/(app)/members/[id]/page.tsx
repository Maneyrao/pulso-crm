'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  DeactivateMemberRequest,
  LedgerEntry,
  LedgerReason,
  MemberDetail,
  MemberPayment,
  UpdateMemberRequest,
} from '@pulso/contracts/members';
import type {
  CancelMembershipRequest,
  CreateMembershipRequest,
  Membership,
  MembershipStatus,
} from '@pulso/contracts/memberships';
import type { Plan } from '@pulso/contracts/catalog';
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
  MoneyInput,
  Pagination,
  Select,
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
import {
  deactivateMember,
  getMember,
  getMemberLedger,
  listMemberPayments,
  updateMember,
} from '@/lib/api/members';
import { listPlans } from '@/lib/api/catalog';
import { listBranches } from '@/lib/api/tenancy';
import { cancelMembership, createMembership, listMemberMemberships } from '@/lib/api/memberships';
import { useIdempotencyKey } from '@/lib/api/idempotency';
import { ApiError } from '@/lib/api/errors';
import { PermissionGate, usePermission } from '@/lib/auth/permissions';
import { BiometricsTab } from '@/components/biometrics/BiometricsTab';
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

/**
 * La tarjeta de resultado de acceso (`components/access/AccessResultCard.tsx`)
 * linkea a `?tab=cuenta` (cuenta corriente) y `?tab=membresias`; acá se
 * mapean a los `value` reales de `Tabs`. Cualquier otro valor (o ausencia)
 * cae en el tab de resumen, igual que antes.
 */
const TAB_PARAM_TO_VALUE: Record<string, string> = {
  cuenta: 'ledger',
  membresias: 'memberships',
  pagos: 'payments',
};

function MemberDetailScreen() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = params.id;
  const gymId = useSessionStore((s) => s.gym?.id ?? '');
  const initialTab = TAB_PARAM_TO_VALUE[searchParams.get('tab') ?? ''] ?? 'summary';
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
  const canConfirmDeactivate = !reasonRequired || deactivateReason.trim().length >= 5;

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
            {hasDebt ? <StatusBadge tone="warning" label="Con deuda" /> : null}
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

      <Tabs defaultValue={initialTab}>
        <TabsList>
          <TabsTrigger value="summary">Resumen</TabsTrigger>
          <TabsTrigger value="memberships">Membresías</TabsTrigger>
          <TabsTrigger value="payments">Pagos</TabsTrigger>
          <TabsTrigger value="ledger">Cuenta corriente</TabsTrigger>
          <TabsTrigger value="biometrics">Biometría</TabsTrigger>
        </TabsList>

        <TabsContent value="summary">
          <SummarySection member={member} />
        </TabsContent>

        <TabsContent value="memberships">
          <MembershipsSection memberId={id} gymId={gymId} />
        </TabsContent>

        <TabsContent value="payments">
          <PaymentsSection memberId={id} gymId={gymId} />
        </TabsContent>

        <TabsContent value="ledger">
          <LedgerSection memberId={id} gymId={gymId} />
        </TabsContent>

        <TabsContent value="biometrics">
          <BiometricsTab memberId={id} memberName={`${member.firstName} ${member.lastName}`} />
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
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
          <dt className="text-(--text-xs) uppercase tracking-wide text-(--color-muted)">
            Deuda actual
          </dt>
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

const PAYMENT_PAGE_SIZE = 25;

function PaymentsSection({ memberId, gymId }: { memberId: string; gymId: string }) {
  const [page, setPage] = React.useState(1);
  const query = useQuery({
    queryKey: qk.memberPayments(gymId, memberId, page),
    queryFn: () => listMemberPayments(memberId, { page, limit: PAYMENT_PAGE_SIZE }),
    enabled: Boolean(gymId && memberId),
  });

  const columns: DataTableColumn<MemberPayment>[] = [
    {
      id: 'date',
      header: 'Fecha',
      cell: (payment) => (
        <div className="flex flex-col tabular-nums">
          <span className="text-(--color-text)">
            {new Date(`${payment.paidOn}T12:00:00`).toLocaleDateString('es-AR')}
          </span>
          <span className="text-(--text-xs) text-(--color-muted)">
            {new Date(payment.createdAt).toLocaleTimeString('es-AR', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </div>
      ),
    },
    {
      id: 'detail',
      header: 'Detalle',
      cell: (payment) => (
        <div className="flex flex-col">
          <span className="text-(--color-text)">
            {payment.membership?.planName ?? payment.concept.name}
          </span>
          <span className="text-(--text-xs) text-(--color-muted)">
            {payment.membership
              ? payment.concept.name
              : (payment.description ?? 'Cobro registrado')}
          </span>
        </div>
      ),
    },
    {
      id: 'method',
      header: 'Medio',
      cell: (payment) => payment.paymentMethod.name,
    },
    {
      id: 'operator',
      header: 'Registró',
      cell: (payment) => payment.registeredBy.fullName,
    },
    {
      id: 'status',
      header: 'Estado',
      cell: (payment) =>
        payment.status === 'VALID' ? (
          <StatusBadge tone="success" label="Registrado" />
        ) : (
          <div className="flex flex-col gap-1">
            <StatusBadge tone="danger" label="Anulado" />
            {payment.reversalReason ? (
              <span className="max-w-52 text-(--text-xs) text-(--color-muted)">
                {payment.reversalReason}
              </span>
            ) : null}
          </div>
        ),
    },
    {
      id: 'amount',
      header: 'Importe',
      cell: (payment) => (
        <span
          className={payment.status === 'REVERSED' ? 'line-through opacity-60' : 'font-semibold'}
        >
          <MoneyDisplay value={payment.amount} />
        </span>
      ),
      headerClassName: 'text-right',
      cellClassName: 'text-right',
    },
  ];

  const total = query.data?.pageInfo.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAYMENT_PAGE_SIZE));

  return (
    <div className="flex flex-col gap-4">
      {query.data ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <PaymentSummary label="Pagos válidos" value={String(query.data.summary.paymentCount)} />
          <PaymentSummary
            label="Total abonado"
            value={<MoneyDisplay value={query.data.summary.totalPaid} />}
          />
          <PaymentSummary
            label="Último pago"
            value={
              query.data.summary.lastPaymentAt
                ? new Date(query.data.summary.lastPaymentAt).toLocaleDateString('es-AR')
                : '—'
            }
          />
        </div>
      ) : null}

      <DataTable
        caption="Historial de pagos del socio"
        columns={columns}
        data={query.data?.data ?? []}
        rowKey={(payment) => payment.id}
        loading={query.isLoading}
        error={query.isError ? errorMessage(query.error) : undefined}
        onRetry={() => query.refetch()}
        emptyTitle="Todavía no hay pagos"
        emptyDescription="Cuando se registre un cobro asociado a este socio va a aparecer acá."
      />

      {query.data && total > PAYMENT_PAGE_SIZE ? (
        <Pagination
          page={page}
          pageCount={pageCount}
          totalItems={total}
          pageSize={PAYMENT_PAGE_SIZE}
          onPageChange={setPage}
        />
      ) : null}
    </div>
  );
}

function PaymentSummary({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Card className="p-4">
      <p className="text-(--text-xs) uppercase tracking-wide text-(--color-muted)">{label}</p>
      <div className="mt-1 text-(--text-lg) font-semibold text-(--color-text)">{value}</div>
    </Card>
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

const MEMBERSHIP_STATUS_LABEL: Record<MembershipStatus, string> = {
  ACTIVE: 'Activa',
  EXPIRED: 'Vencida',
  CANCELLED: 'Cancelada',
  SUSPENDED: 'Suspendida',
};

function membershipStatusTone(status: MembershipStatus): 'success' | 'warning' | 'neutral' {
  if (status === 'ACTIVE') return 'success';
  if (status === 'SUSPENDED') return 'warning';
  return 'neutral';
}

function todayYmd(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

interface AssignFormState {
  planId: string;
  branchId: string;
  startDate: string;
  priceOverride: string;
}

/**
 * Tab "Membresías" de la ficha del socio: lista el historial y permite dar
 * de alta una nueva. `mode: NOW` (cobro por caja) llega en M5; hasta
 * entonces el alta corre siempre en `mode: DEBT` — se crea el `DEBIT` en
 * la cuenta corriente sin tocar caja.
 */
function MembershipsSection({ memberId, gymId }: { memberId: string; gymId: string }) {
  const branchId = useSessionStore((s) => s.activeBranchId);
  const branches = useSessionStore((s) => s.branches);
  const canWrite = usePermission('membership:write');
  const canDelete = usePermission('membership:delete');
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const idempotency = useIdempotencyKey();

  const [assignOpen, setAssignOpen] = React.useState(false);
  const [assignError, setAssignError] = React.useState<string | undefined>();
  const [assignForm, setAssignForm] = React.useState<AssignFormState>(() => ({
    planId: '',
    branchId: branchId ?? '',
    startDate: todayYmd(),
    priceOverride: '',
  }));

  const [toCancel, setToCancel] = React.useState<Membership | null>(null);
  const [cancelReason, setCancelReason] = React.useState('');
  const [cancelError, setCancelError] = React.useState<string | undefined>();

  const membershipsQuery = useQuery({
    queryKey: qk.memberMemberships(gymId, memberId),
    queryFn: () => listMemberMemberships(memberId),
    enabled: Boolean(gymId && memberId),
  });

  const plansQuery = useQuery({
    queryKey: qk.plans(gymId),
    queryFn: listPlans,
    enabled: Boolean(gymId),
  });

  const branchesQuery = useQuery({
    queryKey: qk.branches(gymId),
    queryFn: listBranches,
    enabled: Boolean(gymId),
  });

  const planById = React.useMemo(() => {
    const map = new Map<string, Plan>();
    for (const p of plansQuery.data?.data ?? []) map.set(p.id, p);
    return map;
  }, [plansQuery.data]);

  const branchNameById = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const b of branchesQuery.data?.data ?? []) map.set(b.id, b.name);
    return map;
  }, [branchesQuery.data]);

  const activePlans = React.useMemo(
    () => (plansQuery.data?.data ?? []).filter((p) => p.isActive),
    [plansQuery.data],
  );

  const planOptions = React.useMemo(
    () => activePlans.map((p) => ({ value: p.id, label: p.name })),
    [activePlans],
  );

  const branchOptions = React.useMemo(
    () => branches.map((b) => ({ value: b.id, label: b.name })),
    [branches],
  );

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: qk.memberMemberships(gymId, memberId) });
    queryClient.invalidateQueries({ queryKey: qk.memberLedger(gymId, memberId) });
    queryClient.invalidateQueries({ queryKey: qk.member(gymId, memberId) });
  };

  const createMutation = useMutation({
    mutationFn: (payload: CreateMembershipRequest) =>
      createMembership(memberId, payload, idempotency.getKey()),
    onSuccess: () => {
      toast({ title: 'Membresía asignada', tone: 'success' });
      idempotency.renew();
      setAssignOpen(false);
      invalidateAll();
    },
    onError: (err: unknown) => setAssignError(errorMessage(err)),
  });

  const cancelMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: CancelMembershipRequest }) =>
      cancelMembership(id, payload),
    onSuccess: () => {
      toast({ title: 'Membresía cancelada', tone: 'success' });
      setToCancel(null);
      setCancelReason('');
      queryClient.invalidateQueries({ queryKey: qk.memberMemberships(gymId, memberId) });
    },
    onError: (err: unknown) => setCancelError(errorMessage(err)),
  });

  const openAssign = () => {
    setAssignForm({
      planId: '',
      branchId: branchId ?? branches[0]?.id ?? '',
      startDate: todayYmd(),
      priceOverride: '',
    });
    setAssignError(undefined);
    setAssignOpen(true);
  };

  const onPlanChange = (planId: string) => {
    const plan = planById.get(planId);
    setAssignForm((f) => ({
      ...f,
      planId,
      // Autocompleta con el precio del plan como default; el usuario puede
      // sobrescribirlo (descuento/beca) sin volver a mirar el listado.
      priceOverride: plan?.price ?? f.priceOverride,
    }));
  };

  const handleAssignSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAssignError(undefined);

    if (!assignForm.planId) {
      setAssignError('Elegí un plan.');
      return;
    }
    if (!assignForm.branchId) {
      setAssignError('Elegí una sede.');
      return;
    }
    if (!assignForm.startDate) {
      setAssignError('Elegí una fecha de inicio.');
      return;
    }

    const plan = planById.get(assignForm.planId);
    const price = assignForm.priceOverride.trim() || plan?.price || '';
    if (!price) {
      setAssignError('El plan elegido no tiene precio.');
      return;
    }

    const useOverride = plan && price !== plan.price;
    const payload: CreateMembershipRequest = {
      planId: assignForm.planId,
      branchId: assignForm.branchId,
      startDate: assignForm.startDate,
      ...(useOverride ? { priceOverride: price } : {}),
      charge: { mode: 'DEBT' },
    };
    createMutation.mutate(payload);
  };

  const openCancel = (membership: Membership) => {
    setToCancel(membership);
    setCancelReason('');
    setCancelError(undefined);
  };

  const handleCancelConfirm = () => {
    if (!toCancel) return;
    setCancelError(undefined);
    const reason = cancelReason.trim();
    if (reason.length < 5) {
      setCancelError('El motivo debe tener al menos 5 caracteres.');
      return;
    }
    cancelMutation.mutate({ id: toCancel.id, payload: { reason } });
  };

  const columns: DataTableColumn<Membership>[] = [
    {
      id: 'plan',
      header: 'Plan',
      cell: (m) => {
        const plan = planById.get(m.planId);
        return (
          <div className="flex flex-col">
            <span className="font-medium text-(--color-text)">{plan?.name ?? '—'}</span>
            {m.branchId ? (
              <span className="text-(--text-xs) text-(--color-muted)">
                {branchNameById.get(m.branchId) ?? '—'}
              </span>
            ) : null}
          </div>
        );
      },
    },
    {
      id: 'status',
      header: 'Estado',
      cell: (m) => (
        <StatusBadge
          tone={membershipStatusTone(m.status)}
          label={MEMBERSHIP_STATUS_LABEL[m.status]}
        />
      ),
    },
    {
      id: 'range',
      header: 'Vigencia',
      cell: (m) => (
        <span className="tabular-nums text-(--color-muted)">
          {m.startDate} → {m.endDate ?? 'sin vencimiento'}
        </span>
      ),
    },
    {
      id: 'price',
      header: 'Precio',
      cell: (m) => <MoneyDisplay value={m.pricePaid} />,
      headerClassName: 'text-right',
      cellClassName: 'text-right',
    },
    {
      id: 'actions',
      header: '',
      cell: (m) =>
        canDelete && m.status === 'ACTIVE' ? (
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={() => openCancel(m)}>
              Cancelar
            </Button>
          </div>
        ) : null,
      headerClassName: 'text-right',
      cellClassName: 'text-right',
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-end">
        <PermissionGate permission="membership:write">
          <Button onClick={openAssign} disabled={!canWrite}>
            Asignar membresía
          </Button>
        </PermissionGate>
      </div>

      <DataTable
        caption="Historial de membresías"
        columns={columns}
        data={membershipsQuery.data?.data ?? []}
        rowKey={(m) => m.id}
        loading={membershipsQuery.isLoading}
        error={membershipsQuery.isError ? errorMessage(membershipsQuery.error) : undefined}
        onRetry={() => membershipsQuery.refetch()}
        emptyTitle="Todavía no hay membresías"
        emptyDescription="Asigná el primer plan para dejar constancia del vínculo con el socio."
        emptyAction={
          <PermissionGate permission="membership:write">
            <Button onClick={openAssign}>Asignar membresía</Button>
          </PermissionGate>
        }
      />

      <Modal
        open={assignOpen}
        onOpenChange={setAssignOpen}
        title="Asignar membresía"
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setAssignOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="submit"
              form="assign-membership-form"
              loading={createMutation.isPending}
              disabled={createMutation.isPending}
            >
              Asignar
            </Button>
          </>
        }
      >
        <form
          id="assign-membership-form"
          onSubmit={handleAssignSubmit}
          className="flex flex-col gap-4"
        >
          {assignError ? (
            <p role="alert" className="text-(--text-sm) font-medium text-(--color-danger)">
              {assignError}
            </p>
          ) : null}

          <Alert tone="info" title="Cobro por caja llega en el próximo milestone">
            La membresía se registra como deuda en la cuenta corriente del socio (modo DEBT). En M5
            se agrega el cobro directo por caja.
          </Alert>

          <FormField label="Plan" required>
            {(field) => (
              <Select
                {...field}
                options={planOptions}
                value={assignForm.planId || undefined}
                onValueChange={onPlanChange}
                placeholder={planOptions.length === 0 ? 'No hay planes activos' : 'Elegí un plan'}
                disabled={planOptions.length === 0}
              />
            )}
          </FormField>

          <FormField label="Sede" required>
            {(field) => (
              <Select
                {...field}
                options={branchOptions}
                value={assignForm.branchId || undefined}
                onValueChange={(v) => setAssignForm((f) => ({ ...f, branchId: v }))}
                placeholder="Elegí una sede"
              />
            )}
          </FormField>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <FormField label="Fecha de inicio" required>
              {(field) => (
                <Input
                  {...field}
                  type="date"
                  value={assignForm.startDate}
                  onChange={(e) => setAssignForm((f) => ({ ...f, startDate: e.target.value }))}
                  required
                />
              )}
            </FormField>
            <FormField
              label="Precio"
              hint="Sobrescribe el precio del plan (descuento, beca, etc.)."
            >
              {(field) => (
                <MoneyInput
                  {...field}
                  value={assignForm.priceOverride}
                  onChange={(v) => setAssignForm((f) => ({ ...f, priceOverride: v }))}
                />
              )}
            </FormField>
          </div>
        </form>
      </Modal>

      <Modal
        open={toCancel !== null}
        onOpenChange={(open) => {
          if (!open) {
            setToCancel(null);
            setCancelReason('');
            setCancelError(undefined);
          }
        }}
        title="Cancelar membresía"
        description="Se detiene la membresía activa. El motivo queda registrado en el audit log."
        footer={
          <>
            <Button
              variant="outline"
              onClick={() => {
                setToCancel(null);
                setCancelReason('');
                setCancelError(undefined);
              }}
            >
              Cerrar
            </Button>
            <Button
              variant="danger"
              onClick={handleCancelConfirm}
              loading={cancelMutation.isPending}
              disabled={cancelMutation.isPending || cancelReason.trim().length < 5}
            >
              Cancelar membresía
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          {cancelError ? (
            <p role="alert" className="text-(--text-sm) font-medium text-(--color-danger)">
              {cancelError}
            </p>
          ) : null}
          <FormField label="Motivo" required hint="Mínimo 5 caracteres.">
            {(field) => (
              <Textarea
                {...field}
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Ej.: mudanza, se pasa al plan trimestral, baja voluntaria."
              />
            )}
          </FormField>
        </div>
      </Modal>
    </div>
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.detail ?? error.message;
  return 'Ocurrió un error inesperado.';
}
