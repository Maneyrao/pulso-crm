'use client';

import * as React from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CashConcept,
  CashMovement,
  CashRegister,
  CashSession,
  CloseCashSessionRequest,
  CreateCashMovementRequest,
  OpenCashSessionRequest,
  PaymentMethod,
  ReverseCashMovementRequest,
} from '@pulso/contracts/cash';
import { ZERO_MONEY, formatMoney, isMoneyString } from '@pulso/config/money';
import {
  Button,
  DataTable,
  EmptyState,
  FormField,
  Input,
  Modal,
  MoneyDisplay,
  MoneyInput,
  Select,
  StatusBadge,
  Textarea,
  useToast,
  type DataTableColumn,
} from '@pulso/ui';
import {
  closeCashSession,
  createCashMovement,
  getCurrentCashSession,
  listCashConcepts,
  listCashMovements,
  listCashRegisters,
  listPaymentMethods,
  openCashSession,
  reverseCashMovement,
} from '@/lib/api/cash';
import { useIdempotencyKey } from '@/lib/api/idempotency';
import { ApiError } from '@/lib/api/errors';
import { PermissionGate, usePermission } from '@/lib/auth/permissions';
import { qk } from '@/lib/query/keys';
import { useSessionStore } from '@/lib/stores/session';

/**
 * Pantalla operativa de caja: abrir/cerrar sesión, listar movements, altas
 * de INCOME/EXPENSE con `Idempotency-Key` y reversas con motivo.
 *
 * Toda escritura viaja idempotente (ADR-016). El `memberId` en un movement
 * es opcional (MVP: input libre de UUID); la validación de existencia la
 * hace el backend con 404/422 tal cual, y su `detail` se muestra en el toast.
 */
export default function CashPage() {
  return (
    <PermissionGate
      permission="cash:read"
      fallback={
        <EmptyState title="Sin acceso" description="Tu usuario no tiene permiso para ver esta pantalla." />
      }
    >
      <CashScreen />
    </PermissionGate>
  );
}

function CashScreen() {
  const gymId = useSessionStore((s) => s.gym?.id);
  const activeBranchId = useSessionStore((s) => s.activeBranchId ?? null);
  const canOperate = usePermission('cash:operate');
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const sessionQuery = useQuery({
    queryKey: qk.cashSession(gymId ?? '', activeBranchId),
    queryFn: getCurrentCashSession,
    enabled: Boolean(gymId),
  });

  const session = sessionQuery.data ?? null;

  const movementsQuery = useQuery({
    queryKey: qk.cashMovements(gymId ?? '', session?.id ?? ''),
    queryFn: () => listCashMovements({ cashSessionId: session!.id }),
    enabled: Boolean(gymId && session?.id),
  });

  const paymentMethodsQuery = useQuery({
    queryKey: qk.paymentMethods(gymId ?? ''),
    queryFn: listPaymentMethods,
    enabled: Boolean(gymId),
  });

  const conceptsQuery = useQuery({
    queryKey: qk.cashConcepts(gymId ?? ''),
    queryFn: listCashConcepts,
    enabled: Boolean(gymId),
  });

  const paymentMethods = React.useMemo(
    () => paymentMethodsQuery.data?.data ?? [],
    [paymentMethodsQuery.data],
  );
  const concepts = React.useMemo(
    () => conceptsQuery.data?.data ?? [],
    [conceptsQuery.data],
  );
  const movements = React.useMemo(
    () => movementsQuery.data?.data ?? [],
    [movementsQuery.data],
  );

  const paymentMethodById = React.useMemo(
    () => new Map(paymentMethods.map((m) => [m.id, m])),
    [paymentMethods],
  );
  const conceptById = React.useMemo(() => new Map(concepts.map((c) => [c.id, c])), [concepts]);

  return (
    <div className="flex flex-col gap-6">
      <SessionHeader
        session={session}
        loading={sessionQuery.isLoading}
        canOperate={canOperate}
        onOpened={() => {
          queryClient.invalidateQueries({ queryKey: qk.cashSession(gymId ?? '', activeBranchId) });
        }}
        onClosed={() => {
          queryClient.invalidateQueries({ queryKey: qk.cashSession(gymId ?? '', activeBranchId) });
        }}
        movements={movements}
        paymentMethods={paymentMethods}
      />

      {session ? (
        <MovementsSection
          session={session}
          movements={movements}
          loading={movementsQuery.isLoading}
          error={movementsQuery.isError ? errorMessage(movementsQuery.error) : undefined}
          onRetry={() => movementsQuery.refetch()}
          paymentMethodById={paymentMethodById}
          conceptById={conceptById}
          paymentMethods={paymentMethods}
          concepts={concepts}
          canOperate={canOperate}
          onChanged={() => {
            void movementsQuery.refetch();
            queryClient.invalidateQueries({ queryKey: qk.cashSession(gymId ?? '', activeBranchId) });
          }}
          onReverseError={(err) =>
            toast({
              title: 'No se pudo revertir el movimiento',
              description: errorMessage(err),
              tone: 'danger',
            })
          }
        />
      ) : sessionQuery.isLoading ? (
        <EmptyState title="Cargando caja" description="Buscando la sesión actual..." />
      ) : (
        <OpenCashCard
          canOperate={canOperate}
          onOpened={() =>
            queryClient.invalidateQueries({ queryKey: qk.cashSession(gymId ?? '', activeBranchId) })
          }
        />
      )}
    </div>
  );
}

// ── Header y estado de sesión ───────────────────────────────────────────

interface SessionHeaderProps {
  session: CashSession | null;
  loading: boolean;
  canOperate: boolean;
  onOpened: () => void;
  onClosed: () => void;
  movements: readonly CashMovement[];
  paymentMethods: readonly PaymentMethod[];
}

function SessionHeader({
  session,
  loading,
  canOperate,
  onOpened,
  onClosed,
  movements,
  paymentMethods,
}: SessionHeaderProps) {
  const [openModal, setOpenModal] = React.useState(false);
  const [closeModal, setCloseModal] = React.useState(false);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-(--text-2xl) font-semibold text-(--color-text)">Caja</h1>
          <p className="text-(--text-sm) text-(--color-muted)">
            Sesión operativa: apertura, ingresos, egresos y arqueo de cierre.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {loading ? null : session ? (
            <StatusBadge tone="success" label="Caja abierta" />
          ) : (
            <StatusBadge tone="neutral" label="Sin caja abierta" />
          )}
          {canOperate ? (
            session ? (
              <Button variant="danger" onClick={() => setCloseModal(true)}>
                Cerrar caja
              </Button>
            ) : (
              <Button onClick={() => setOpenModal(true)}>Abrir caja</Button>
            )
          ) : null}
        </div>
      </div>

      {session ? (
        <dl className="grid grid-cols-1 gap-3 rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface) p-4 md:grid-cols-3">
          <div>
            <dt className="text-(--text-xs) text-(--color-muted)">Fondo de apertura</dt>
            <dd className="text-(--text-base) font-medium text-(--color-text)">
              <MoneyDisplay value={session.openingAmount} />
            </dd>
          </div>
          <div>
            <dt className="text-(--text-xs) text-(--color-muted)">Abrió a las</dt>
            <dd className="text-(--text-base) font-medium text-(--color-text) tabular-nums">
              {formatTime(session.openedAt)}
            </dd>
          </div>
          <div>
            <dt className="text-(--text-xs) text-(--color-muted)">Día de negocio</dt>
            <dd className="text-(--text-base) font-medium text-(--color-text) tabular-nums">
              {session.businessDate}
            </dd>
          </div>
        </dl>
      ) : null}

      <OpenCashModal open={openModal} onOpenChange={setOpenModal} onOpened={onOpened} />
      {session ? (
        <CloseCashModal
          open={closeModal}
          onOpenChange={setCloseModal}
          session={session}
          movements={movements}
          paymentMethods={paymentMethods}
          onClosed={onClosed}
        />
      ) : null}
    </div>
  );
}

// ── Sección de movements ────────────────────────────────────────────────

interface MovementsSectionProps {
  session: CashSession;
  movements: readonly CashMovement[];
  loading: boolean;
  error: string | undefined;
  onRetry: () => void;
  paymentMethodById: ReadonlyMap<string, PaymentMethod>;
  conceptById: ReadonlyMap<string, CashConcept>;
  paymentMethods: readonly PaymentMethod[];
  concepts: readonly CashConcept[];
  canOperate: boolean;
  onChanged: () => void;
  onReverseError: (err: unknown) => void;
}

function MovementsSection({
  session,
  movements,
  loading,
  error,
  onRetry,
  paymentMethodById,
  conceptById,
  paymentMethods,
  concepts,
  canOperate,
  onChanged,
  onReverseError,
}: MovementsSectionProps) {
  const [newOpen, setNewOpen] = React.useState(false);
  const [toReverse, setToReverse] = React.useState<CashMovement | null>(null);

  const columns: DataTableColumn<CashMovement>[] = [
    {
      id: 'time',
      header: 'Hora',
      cell: (m) => <span className="tabular-nums">{formatTime(m.createdAt)}</span>,
    },
    {
      id: 'concept',
      header: 'Concepto',
      cell: (m) => conceptById.get(m.cashConceptId)?.name ?? '—',
    },
    {
      id: 'method',
      header: 'Método',
      cell: (m) => paymentMethodById.get(m.paymentMethodId)?.name ?? '—',
    },
    {
      id: 'type',
      header: 'Tipo',
      cell: (m) =>
        m.type === 'INCOME' ? (
          <StatusBadge tone="success" label="Ingreso" />
        ) : (
          <StatusBadge tone="danger" label="Egreso" />
        ),
    },
    {
      id: 'amount',
      header: 'Importe',
      cell: (m) => (
        <MoneyDisplay
          value={m.type === 'EXPENSE' ? `-${m.amount}` : m.amount}
          emphasizeNegative={m.type === 'EXPENSE'}
        />
      ),
      headerClassName: 'text-right',
      cellClassName: 'text-right',
    },
    {
      id: 'member',
      header: 'Socio',
      cell: (m) =>
        m.memberId ? (
          <span className="font-mono text-(--text-xs) text-(--color-muted)">{m.memberId.slice(0, 8)}</span>
        ) : (
          <span className="text-(--color-muted)">—</span>
        ),
    },
    {
      id: 'actions',
      header: '',
      cell: (m) =>
        canOperate && !m.isReversed && !m.reversalOfId ? (
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={() => setToReverse(m)}>
              Revertir
            </Button>
          </div>
        ) : m.isReversed ? (
          <div className="flex justify-end">
            <StatusBadge tone="neutral" label="Revertido" />
          </div>
        ) : null,
      headerClassName: 'text-right',
      cellClassName: 'text-right',
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-(--text-lg) font-semibold text-(--color-text)">Movimientos de la sesión</h2>
        {canOperate ? <Button onClick={() => setNewOpen(true)}>Nuevo movimiento</Button> : null}
      </div>

      <DataTable
        caption="Movimientos de la sesión de caja"
        columns={columns}
        data={movements}
        rowKey={(m) => m.id}
        loading={loading}
        error={error}
        onRetry={onRetry}
        emptyTitle="Todavía no hay movimientos"
        emptyDescription="Cargá el primer ingreso o egreso desde “Nuevo movimiento”."
      />

      <NewMovementModal
        open={newOpen}
        onOpenChange={setNewOpen}
        session={session}
        paymentMethods={paymentMethods}
        concepts={concepts}
        onCreated={() => {
          setNewOpen(false);
          onChanged();
        }}
      />

      <ReverseMovementModal
        movement={toReverse}
        onOpenChange={(open) => !open && setToReverse(null)}
        onReversed={() => {
          setToReverse(null);
          onChanged();
        }}
        onError={(err) => {
          onReverseError(err);
          setToReverse(null);
        }}
      />
    </div>
  );
}

// ── Modales: abrir caja ─────────────────────────────────────────────────

interface OpenCashCardProps {
  canOperate: boolean;
  onOpened: () => void;
}

function OpenCashCard({ canOperate, onOpened }: OpenCashCardProps) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <EmptyState
        title="No hay caja abierta"
        description={
          canOperate
            ? 'Abrí una caja para empezar a registrar ingresos y egresos.'
            : 'Cuando alguien con permiso abra la caja podrás ver los movimientos.'
        }
        action={
          canOperate ? <Button onClick={() => setOpen(true)}>Abrir caja</Button> : undefined
        }
      />
      <OpenCashModal open={open} onOpenChange={setOpen} onOpened={onOpened} />
    </>
  );
}

interface OpenCashModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpened: () => void;
}

function OpenCashModal({ open, onOpenChange, onOpened }: OpenCashModalProps) {
  const gymId = useSessionStore((s) => s.gym?.id);
  const activeBranchId = useSessionStore((s) => s.activeBranchId ?? null);
  const idempotency = useIdempotencyKey();
  const { toast } = useToast();

  const registersQuery = useQuery({
    queryKey: qk.cashRegisters(gymId ?? '', activeBranchId),
    queryFn: () => listCashRegisters(activeBranchId ?? undefined),
    enabled: open && Boolean(gymId),
  });

  const [cashRegisterId, setCashRegisterId] = React.useState('');
  const [openingAmount, setOpeningAmount] = React.useState('0.00');
  const [notes, setNotes] = React.useState('');
  const [formError, setFormError] = React.useState<string | undefined>();

  React.useEffect(() => {
    if (!open) {
      setCashRegisterId('');
      setOpeningAmount('0.00');
      setNotes('');
      setFormError(undefined);
    }
  }, [open]);

  const registers = React.useMemo<CashRegister[]>(
    () => (registersQuery.data?.data ?? []).filter((r) => r.isActive),
    [registersQuery.data],
  );

  const openMutation = useMutation({
    mutationFn: (payload: OpenCashSessionRequest) => openCashSession(payload, idempotency.getKey()),
    onSuccess: () => {
      toast({ title: 'Caja abierta', tone: 'success' });
      idempotency.renew();
      onOpened();
      onOpenChange(false);
    },
    onError: (err: unknown) => setFormError(errorMessage(err)),
  });

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(undefined);
    if (!cashRegisterId) {
      setFormError('Elegí una caja.');
      return;
    }
    if (!isMoneyString(openingAmount)) {
      setFormError('El fondo de apertura no es válido.');
      return;
    }
    const payload: OpenCashSessionRequest = {
      cashRegisterId,
      openingAmount,
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    };
    openMutation.mutate(payload);
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Abrir caja"
      description="Elegí la caja física, el fondo inicial y una nota opcional."
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" form="open-cash-form" loading={openMutation.isPending}>
            Abrir caja
          </Button>
        </>
      }
    >
      <form id="open-cash-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
        {formError ? (
          <p role="alert" className="text-(--text-sm) font-medium text-(--color-danger)">
            {formError}
          </p>
        ) : null}

        <FormField
          label="Caja"
          required
          hint={registersQuery.isLoading ? 'Cargando cajas de la sede...' : undefined}
        >
          {(field) => (
            <Select
              {...field}
              options={registers.map((r) => ({ value: r.id, label: r.name }))}
              value={cashRegisterId}
              onValueChange={setCashRegisterId}
              placeholder={registers.length === 0 ? 'No hay cajas disponibles' : 'Seleccioná una caja'}
              disabled={registers.length === 0}
            />
          )}
        </FormField>

        <FormField label="Fondo de apertura" required hint="Ingresá 0 si abrís sin efectivo inicial.">
          {(field) => <MoneyInput {...field} value={openingAmount} onChange={setOpeningAmount} />}
        </FormField>

        <FormField label="Notas">
          {(field) => (
            <Textarea
              {...field}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Detalle opcional (turno, arqueo previo, etc.)"
            />
          )}
        </FormField>
      </form>
    </Modal>
  );
}

// ── Modal: nuevo movement ───────────────────────────────────────────────

interface NewMovementModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: CashSession;
  paymentMethods: readonly PaymentMethod[];
  concepts: readonly CashConcept[];
  onCreated: () => void;
}

const MOVEMENT_TYPE_OPTIONS = [
  { value: 'INCOME', label: 'Ingreso' },
  { value: 'EXPENSE', label: 'Egreso' },
] as const;

function NewMovementModal({
  open,
  onOpenChange,
  session,
  paymentMethods,
  concepts,
  onCreated,
}: NewMovementModalProps) {
  const idempotency = useIdempotencyKey();
  const { toast } = useToast();

  const [type, setType] = React.useState<'INCOME' | 'EXPENSE'>('INCOME');
  const [cashConceptId, setCashConceptId] = React.useState('');
  const [paymentMethodId, setPaymentMethodId] = React.useState('');
  const [amount, setAmount] = React.useState('');
  const [detail, setDetail] = React.useState('');
  const [memberId, setMemberId] = React.useState('');
  const [formError, setFormError] = React.useState<string | undefined>();

  React.useEffect(() => {
    if (!open) {
      setType('INCOME');
      setCashConceptId('');
      setPaymentMethodId('');
      setAmount('');
      setDetail('');
      setMemberId('');
      setFormError(undefined);
    }
  }, [open]);

  // Cambiar de tipo limpia el concepto: los conceptos son de un solo type.
  React.useEffect(() => {
    setCashConceptId('');
  }, [type]);

  const filteredConcepts = React.useMemo(
    () => concepts.filter((c) => c.type === type && c.isActive),
    [concepts, type],
  );
  const activeMethods = React.useMemo(
    () => paymentMethods.filter((m) => m.isActive),
    [paymentMethods],
  );

  const createMutation = useMutation({
    mutationFn: (payload: CreateCashMovementRequest) =>
      createCashMovement(payload, idempotency.getKey()),
    onSuccess: (res) => {
      if (res.status === 'REQUIRES_APPROVAL') {
        toast({
          title: 'Egreso enviado a aprobación',
          description: 'Un supervisor debe aprobar la operación antes de que impacte en la caja.',
          tone: 'info',
        });
      } else {
        toast({ title: 'Movimiento cargado', tone: 'success' });
      }
      idempotency.renew();
      onCreated();
    },
    onError: (err: unknown) => setFormError(errorMessage(err)),
  });

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(undefined);

    if (!cashConceptId) {
      setFormError('Elegí un concepto.');
      return;
    }
    if (!paymentMethodId) {
      setFormError('Elegí un método de pago.');
      return;
    }
    if (!isMoneyString(amount) || amount === '0.00' || amount === '0' || amount.startsWith('-')) {
      setFormError('El importe debe ser mayor a cero.');
      return;
    }
    const trimmedMemberId = memberId.trim();
    if (trimmedMemberId && !UUID_RE.test(trimmedMemberId)) {
      setFormError('El ID del socio no tiene un formato UUID válido.');
      return;
    }
    const payload: CreateCashMovementRequest = {
      type,
      cashConceptId,
      paymentMethodId,
      amount,
      ...(detail.trim() ? { detail: detail.trim() } : {}),
      ...(trimmedMemberId ? { memberId: trimmedMemberId } : {}),
    };
    createMutation.mutate(payload);
  };

  void session; // el `session` viene por si el diseño futuro quiere mostrarla.

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Nuevo movimiento"
      description="Cargá un ingreso o egreso contra la caja abierta."
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="submit" form="new-movement-form" loading={createMutation.isPending}>
            Guardar
          </Button>
        </>
      }
    >
      <form id="new-movement-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
        {formError ? (
          <p role="alert" className="text-(--text-sm) font-medium text-(--color-danger)">
            {formError}
          </p>
        ) : null}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormField label="Tipo" required>
            {(field) => (
              <Select
                {...field}
                options={[...MOVEMENT_TYPE_OPTIONS]}
                value={type}
                onValueChange={(v) => setType(v as 'INCOME' | 'EXPENSE')}
              />
            )}
          </FormField>
          <FormField label="Concepto" required>
            {(field) => (
              <Select
                {...field}
                options={filteredConcepts.map((c) => ({ value: c.id, label: c.name }))}
                value={cashConceptId}
                onValueChange={setCashConceptId}
                placeholder={
                  filteredConcepts.length === 0 ? 'No hay conceptos disponibles' : 'Elegí un concepto'
                }
                disabled={filteredConcepts.length === 0}
              />
            )}
          </FormField>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormField label="Método de pago" required>
            {(field) => (
              <Select
                {...field}
                options={activeMethods.map((m) => ({ value: m.id, label: m.name }))}
                value={paymentMethodId}
                onValueChange={setPaymentMethodId}
                placeholder={
                  activeMethods.length === 0 ? 'No hay métodos disponibles' : 'Elegí un método'
                }
                disabled={activeMethods.length === 0}
              />
            )}
          </FormField>
          <FormField label="Importe" required>
            {(field) => <MoneyInput {...field} value={amount} onChange={setAmount} />}
          </FormField>
        </div>

        <FormField
          label="Socio (opcional)"
          hint="Pegá el ID del socio si el movimiento se asocia a alguien puntual."
        >
          {(field) => (
            <Input
              {...field}
              value={memberId}
              onChange={(e) => setMemberId(e.target.value)}
              placeholder="00000000-0000-0000-0000-000000000000"
            />
          )}
        </FormField>

        <FormField label="Detalle">
          {(field) => (
            <Textarea
              {...field}
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
              placeholder="Descripción del movimiento (opcional)"
              rows={3}
            />
          )}
        </FormField>
      </form>
    </Modal>
  );
}

// ── Modal: revertir movement ────────────────────────────────────────────

interface ReverseMovementModalProps {
  movement: CashMovement | null;
  onOpenChange: (open: boolean) => void;
  onReversed: () => void;
  onError: (err: unknown) => void;
}

const REVERSE_REASON_MIN = 10;

function ReverseMovementModal({
  movement,
  onOpenChange,
  onReversed,
  onError,
}: ReverseMovementModalProps) {
  const idempotency = useIdempotencyKey();
  const { toast } = useToast();
  const [reason, setReason] = React.useState('');

  React.useEffect(() => {
    if (!movement) setReason('');
  }, [movement]);

  const reverseMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: ReverseCashMovementRequest }) =>
      reverseCashMovement(id, payload, idempotency.getKey()),
    onSuccess: () => {
      toast({ title: 'Movimiento revertido', tone: 'success' });
      idempotency.renew();
      onReversed();
    },
    onError,
  });

  const trimmed = reason.trim();
  const canConfirm = trimmed.length >= REVERSE_REASON_MIN;

  const handleConfirm = () => {
    if (!movement || !canConfirm) return;
    reverseMutation.mutate({ id: movement.id, payload: { reason: trimmed } });
  };

  return (
    <Modal
      open={movement !== null}
      onOpenChange={onOpenChange}
      title="Revertir movimiento"
      description="Se crea un movimiento contrario que anula al original. Es irreversible."
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            onClick={handleConfirm}
            disabled={!canConfirm}
            loading={reverseMutation.isPending}
          >
            Revertir
          </Button>
        </>
      }
    >
      <FormField
        label="Motivo"
        required
        hint={`Escribí al menos ${REVERSE_REASON_MIN} caracteres explicando por qué se revierte.`}
      >
        {(field) => (
          <Textarea
            {...field}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
          />
        )}
      </FormField>
    </Modal>
  );
}

// ── Modal: cerrar caja (arqueo) ─────────────────────────────────────────

interface CloseCashModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: CashSession;
  movements: readonly CashMovement[];
  paymentMethods: readonly PaymentMethod[];
  onClosed: () => void;
}

function CloseCashModal({
  open,
  onOpenChange,
  session,
  movements,
  paymentMethods,
  onClosed,
}: CloseCashModalProps) {
  const idempotency = useIdempotencyKey();
  const { toast } = useToast();

  // Métodos que aparecen en la sesión: el arqueo se declara sobre ellos.
  const methodsInSession = React.useMemo(() => {
    const ids = new Set(movements.map((m) => m.paymentMethodId));
    // Incluye métodos que cuentan como efectivo aunque no tengan movements,
    // para poder declarar el fondo de apertura al cerrar.
    for (const m of paymentMethods) {
      if (m.countsAsCash && m.isActive) ids.add(m.id);
    }
    return paymentMethods.filter((m) => ids.has(m.id));
  }, [movements, paymentMethods]);

  const [declared, setDeclared] = React.useState<Record<string, string>>({});
  const [notes, setNotes] = React.useState('');
  const [formError, setFormError] = React.useState<string | undefined>();

  React.useEffect(() => {
    if (open) {
      const initial: Record<string, string> = {};
      for (const m of methodsInSession) initial[m.id] = ZERO_MONEY;
      setDeclared(initial);
      setNotes('');
      setFormError(undefined);
    }
  }, [open, methodsInSession]);

  const closeMutation = useMutation({
    mutationFn: (payload: CloseCashSessionRequest) =>
      closeCashSession(payload, idempotency.getKey()),
    onSuccess: (res) => {
      const diff = res.differenceTotal;
      const description = isZeroLike(diff)
        ? 'Sin diferencias en el arqueo.'
        : `Diferencia total del arqueo: ${formatMoney(diff)}.`;
      toast({
        title: 'Caja cerrada',
        description,
        tone: isZeroLike(diff) ? 'success' : 'warning',
      });
      idempotency.renew();
      onClosed();
      onOpenChange(false);
    },
    onError: (err: unknown) => setFormError(errorMessage(err)),
  });

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(undefined);
    const entries = Object.entries(declared);
    for (const [, amount] of entries) {
      if (!isMoneyString(amount) || amount.startsWith('-')) {
        setFormError('Todos los importes declarados deben ser positivos.');
        return;
      }
    }
    if (entries.length === 0) {
      setFormError('No hay métodos declarables en esta sesión.');
      return;
    }
    const payload: CloseCashSessionRequest = {
      declared: entries.map(([paymentMethodId, amount]) => ({ paymentMethodId, amount })),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    };
    closeMutation.mutate(payload);
  };

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Cerrar caja"
      description="Declará el efectivo y los totales por método. El backend calcula la diferencia."
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            type="submit"
            form="close-cash-form"
            variant="danger"
            loading={closeMutation.isPending}
          >
            Cerrar caja
          </Button>
        </>
      }
    >
      <form id="close-cash-form" onSubmit={handleSubmit} className="flex flex-col gap-4">
        {formError ? (
          <p role="alert" className="text-(--text-sm) font-medium text-(--color-danger)">
            {formError}
          </p>
        ) : null}

        <p className="text-(--text-sm) text-(--color-muted)">
          Fondo de apertura: <MoneyDisplay value={session.openingAmount} />
        </p>

        {methodsInSession.length === 0 ? (
          <EmptyState
            title="Sin métodos declarables"
            description="La sesión no tiene movimientos ni métodos que cuenten como efectivo."
          />
        ) : (
          <div className="flex flex-col gap-3">
            {methodsInSession.map((method) => (
              <FormField
                key={method.id}
                label={`${method.name}${method.countsAsCash ? ' (efectivo)' : ''}`}
              >
                {(field) => (
                  <MoneyInput
                    {...field}
                    value={declared[method.id] ?? ZERO_MONEY}
                    onChange={(v) => setDeclared((prev) => ({ ...prev, [method.id]: v }))}
                  />
                )}
              </FormField>
            ))}
          </div>
        )}

        <FormField label="Notas de cierre">
          {(field) => (
            <Textarea
              {...field}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Observaciones del arqueo (opcional)"
              rows={3}
            />
          )}
        </FormField>
      </form>
    </Modal>
  );
}

// ── helpers ─────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function formatTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

function isZeroLike(v: string): boolean {
  return v === '0.00' || v === '-0.00' || v === '0' || v === '';
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.detail ?? error.message;
  return 'Ocurrió un error inesperado.';
}
