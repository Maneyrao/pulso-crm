'use client';

import * as React from 'react';
import { Checkbox } from '@pulso/ui';
import Link from 'next/link';
import { useMutation, useQuery } from '@tanstack/react-query';
import { DOCUMENT_TYPES, documentHint } from '@pulso/config/document';
import { enrollmentPriceBandLabel, quoteEnrollmentPrice } from '@pulso/config/billing';
import type { CreateMemberRequest, Member, MemberDocumentType } from '@pulso/contracts/members';
import type {
  CreateMembershipRequest,
  CreateMembershipResponse,
  MembershipCharge,
} from '@pulso/contracts/memberships';
import type { Plan } from '@pulso/contracts/catalog';
import {
  Alert,
  Button,
  Card,
  EmptyState,
  FormField,
  Input,
  MoneyDisplay,
  Select,
  Stepper,
  type StepperStep,
} from '@pulso/ui';
import { createMember } from '@/lib/api/members';
import { createMembership } from '@/lib/api/memberships';
import { listPlans } from '@/lib/api/catalog';
import { listBranches } from '@/lib/api/tenancy';
import { getCurrentCashSession, listPaymentMethods } from '@/lib/api/cash';
import { useIdempotencyKey } from '@/lib/api/idempotency';
import { ApiError } from '@/lib/api/errors';
import { PermissionGate } from '@/lib/auth/permissions';
import { PageHeader } from '@/components/shared/PageHeader';
import { qk } from '@/lib/query/keys';
import { useSessionStore } from '@/lib/stores/session';

/**
 * Alta de socio (Fase 2B, LEODARROSAFIT_ALIGNMENT_PLAN.md): wizard de tres
 * pasos que compone llamadas reales y ya probadas — `POST /members`,
 * `POST /members/:id/memberships` (con `charge` embebido: el backend crea el
 * `CashMovement` atómicamente cuando `mode: 'NOW'`, no hace falta un
 * `POST /cash/movements` aparte) — con manejo de error por paso: si el socio
 * ya se creó, un reintento NUNCA vuelve a crearlo, retoma desde el paso que
 * falló.
 *
 * Paso 2 (plan) y paso 3 (pago) son omitibles: un socio puede darse de alta
 * sin membresía, y una membresía puede quedar sin cobrar si no hay caja
 * abierta (o si el operador elige cobrar después).
 */

type StepId = 'personal' | 'plan' | 'payment';

const STEPS: readonly StepperStep[] = [
  { id: 'personal', label: 'Datos personales', description: 'Nombre, documento y contacto.' },
  { id: 'plan', label: 'Plan y membresía', description: 'Opcional: se puede omitir.' },
  { id: 'payment', label: 'Pago', description: 'Opcional: requiere caja abierta.' },
];

const DOCUMENT_OPTIONS = DOCUMENT_TYPES.map((type) => ({ value: type, label: type }));

interface PersonalFormState {
  documentType: MemberDocumentType;
  documentNumber: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  birthDate: string;
}

const EMPTY_PERSONAL: PersonalFormState = {
  documentType: 'DNI',
  documentNumber: '',
  firstName: '',
  lastName: '',
  phone: '',
  email: '',
  birthDate: '',
};

interface PlanFormState {
  planId: string;
  branchId: string;
  startDate: string;
}

function todayYmd(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

interface DoneSummary {
  member: Member;
  membership: CreateMembershipResponse | null;
}

export default function NewMemberPage() {
  return (
    <PermissionGate
      permission="member:write"
      fallback={
        <EmptyState
          title="Sin acceso"
          description="Tu usuario no tiene permiso para crear socios."
        />
      }
    >
      <NewMemberScreen />
    </PermissionGate>
  );
}

function NewMemberScreen() {
  const gymId = useSessionStore((s) => s.gym?.id ?? '');
  const branchId = useSessionStore((s) => s.activeBranchId);
  const branches = useSessionStore((s) => s.branches);
  const memberIdempotency = useIdempotencyKey();
  const membershipIdempotency = useIdempotencyKey();

  const [stepId, setStepId] = React.useState<StepId>('personal');
  const [completed, setCompleted] = React.useState<StepId[]>([]);
  const [personalForm, setPersonalForm] = React.useState<PersonalFormState>(EMPTY_PERSONAL);
  const [personalErrors, setPersonalErrors] = React.useState<
    Partial<Record<keyof PersonalFormState, string>>
  >({});
  const [personalError, setPersonalError] = React.useState<string | undefined>();

  const [member, setMember] = React.useState<Member | null>(null);

  const [planForm, setPlanForm] = React.useState<PlanFormState>(() => ({
    planId: '',
    branchId: branchId ?? '',
    startDate: todayYmd(),
  }));
  const [planError, setPlanError] = React.useState<string | undefined>();
  const [autoRenew, setAutoRenew] = React.useState(true);

  const [paymentMethodId, setPaymentMethodId] = React.useState('');
  const [chargeAmount, setChargeAmount] = React.useState('');
  const [paymentError, setPaymentError] = React.useState<string | undefined>();

  const [done, setDone] = React.useState<DoneSummary | null>(null);

  const plansQuery = useQuery({
    queryKey: qk.plans(gymId),
    queryFn: listPlans,
    enabled: Boolean(gymId) && stepId === 'plan',
  });
  const branchesQuery = useQuery({
    queryKey: qk.branches(gymId),
    queryFn: listBranches,
    enabled: Boolean(gymId) && stepId === 'plan',
  });
  const cashSessionQuery = useQuery({
    queryKey: qk.cashSession(gymId, branchId),
    queryFn: getCurrentCashSession,
    enabled: Boolean(gymId) && stepId === 'payment' && Boolean(planForm.planId),
  });
  const paymentMethodsQuery = useQuery({
    queryKey: qk.paymentMethods(gymId),
    queryFn: listPaymentMethods,
    enabled: Boolean(gymId) && stepId === 'payment' && Boolean(cashSessionQuery.data),
  });

  const activePlans = React.useMemo(
    () => (plansQuery.data?.data ?? []).filter((p) => p.isActive),
    [plansQuery.data],
  );
  const planOptions = React.useMemo(
    () => activePlans.map((p) => ({ value: p.id, label: p.name })),
    [activePlans],
  );
  const branchList = branchesQuery.data?.data ?? branches;
  const branchOptions = React.useMemo(
    () => branchList.map((b) => ({ value: b.id, label: b.name })),
    [branchList],
  );
  const paymentMethodOptions = React.useMemo(
    () =>
      (paymentMethodsQuery.data?.data ?? [])
        .filter((pm) => pm.isActive)
        .map((pm) => ({ value: pm.id, label: pm.name })),
    [paymentMethodsQuery.data],
  );
  const selectedPlan: Plan | undefined = activePlans.find((p) => p.id === planForm.planId);
  const selectedPaymentMethod = (paymentMethodsQuery.data?.data ?? []).find(
    (method) => method.id === paymentMethodId,
  );
  const priceQuote = React.useMemo(
    () =>
      selectedPlan
        ? quoteEnrollmentPrice(selectedPlan.price, planForm.startDate, selectedPaymentMethod?.code)
        : null,
    [planForm.startDate, selectedPaymentMethod?.code, selectedPlan],
  );

  React.useEffect(() => {
    if (priceQuote) setChargeAmount(priceQuote.total);
  }, [priceQuote]);

  const createMemberMutation = useMutation({
    mutationFn: (payload: CreateMemberRequest) => createMember(payload, memberIdempotency.getKey()),
    onSuccess: (created) => {
      setMember(created);
      setCompleted((c) => Array.from(new Set([...c, 'personal' as StepId])));
      setStepId('plan');
    },
    onError: (err: unknown) => {
      renewAfterServerRejection(err, memberIdempotency.renew);
      setPersonalError(errorMessage(err));
    },
  });

  const createMembershipMutation = useMutation({
    mutationFn: (payload: CreateMembershipRequest) => {
      if (!member) throw new Error('El socio todavía no se creó.');
      return createMembership(member.id, payload, membershipIdempotency.getKey());
    },
    onSuccess: (result) => {
      if (member) setDone({ member, membership: result });
    },
    onError: (err: unknown) => {
      renewAfterServerRejection(err, membershipIdempotency.renew);
      setPaymentError(errorMessage(err));
    },
  });

  const validatePersonal = (): boolean => {
    const errs: Partial<Record<keyof PersonalFormState, string>> = {};
    if (!personalForm.firstName.trim()) errs.firstName = 'Ingresá el nombre.';
    if (!personalForm.lastName.trim()) errs.lastName = 'Ingresá el apellido.';
    if (!personalForm.documentNumber.trim()) errs.documentNumber = 'Ingresá el documento.';
    if (personalForm.email.trim() && !/^\S+@\S+\.\S+$/.test(personalForm.email.trim())) {
      errs.email = 'Formato de email inválido.';
    }
    if (personalForm.phone.trim() && personalForm.phone.trim().length < 6) {
      errs.phone = 'Ingresá al menos 6 dígitos.';
    }
    setPersonalErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const setPersonalField = <K extends keyof PersonalFormState>(
    key: K,
    value: PersonalFormState[K],
  ): void => {
    setPersonalForm((f) => ({ ...f, [key]: value }));
    if (personalErrors[key]) setPersonalErrors((s) => ({ ...s, [key]: undefined }));
  };

  const handlePersonalSubmit = (): void => {
    setPersonalError(undefined);
    if (member) {
      // Ya se creó: no reintentar la creación, sólo avanzar (retomamos el flujo).
      setStepId('plan');
      return;
    }
    if (!validatePersonal()) return;
    if (!branchId) {
      setPersonalError('Elegí una sede activa antes de crear el socio.');
      return;
    }
    if (createMemberMutation.isPending) return;

    const payload: CreateMemberRequest = {
      documentType: personalForm.documentType,
      documentNumber: personalForm.documentNumber.trim(),
      firstName: personalForm.firstName.trim(),
      lastName: personalForm.lastName.trim(),
      branchId,
      ...(personalForm.email.trim() ? { email: personalForm.email.trim() } : {}),
      ...(personalForm.phone.trim() ? { phone: personalForm.phone.trim() } : {}),
      ...(personalForm.birthDate ? { birthDate: personalForm.birthDate } : {}),
    };
    createMemberMutation.mutate(payload);
  };

  const onPlanChange = (planId: string) => {
    const plan = activePlans.find((p) => p.id === planId);
    setPlanForm((f) => ({ ...f, planId }));
    setChargeAmount(plan ? quoteEnrollmentPrice(plan.price, planForm.startDate).total : '');
  };

  const handlePlanNext = (): void => {
    setPlanError(undefined);
    if (!planForm.planId) {
      setPlanError('Elegí un plan o tocá "Omitir" para dar de alta sin membresía.');
      return;
    }
    if (!planForm.branchId) {
      setPlanError('Elegí una sede.');
      return;
    }
    if (!planForm.startDate) {
      setPlanError('Elegí una fecha de inicio.');
      return;
    }
    setCompleted((c) => Array.from(new Set([...c, 'plan' as StepId])));
    setStepId('payment');
  };

  const handleSkipPlan = (): void => {
    setPlanForm((f) => ({ ...f, planId: '' }));
    setCompleted((c) => Array.from(new Set([...c, 'plan' as StepId])));
    // Sin plan no hay nada que cobrar: se salta directo al cierre.
    finalizeWithoutMembership();
  };

  const finalizeWithoutMembership = (): void => {
    if (member) setDone({ member, membership: null });
  };

  const submitMembership = (charge: MembershipCharge): void => {
    if (createMembershipMutation.isPending) return;
    setPaymentError(undefined);
    const price = selectedPlan?.price || '';
    if (!price) {
      setPaymentError('El plan elegido no tiene precio.');
      return;
    }
    const payload: CreateMembershipRequest = {
      autoRenew: selectedPlan?.billingCycle === 'MONTHLY' && autoRenew,
      planId: planForm.planId,
      branchId: planForm.branchId,
      startDate: planForm.startDate,
      charge,
    };
    createMembershipMutation.mutate(payload);
  };

  const handleChargeNow = (): void => {
    if (!paymentMethodId) {
      setPaymentError('Elegí un método de pago.');
      return;
    }
    const amount = chargeAmount.trim() || selectedPlan?.price || '';
    if (!amount) {
      setPaymentError('Ingresá el monto a cobrar.');
      return;
    }
    submitMembership({ mode: 'NOW', paymentMethodId, amount });
  };

  const handleFinishWithoutCharge = (): void => {
    submitMembership({ mode: 'DEBT' });
  };

  const hasCashSession = Boolean(cashSessionQuery.data);

  if (done) {
    return <DoneScreen summary={done} />;
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Nuevo socio"
        description="Completá los pasos que necesites: los de plan y pago se pueden omitir."
      />

      <Stepper steps={STEPS} currentStepId={stepId} completedStepIds={completed} />

      <Card className="p-6">
        {stepId === 'personal' ? (
          <PersonalStep
            form={personalForm}
            errors={personalErrors}
            onChange={setPersonalField}
            locked={Boolean(member)}
          />
        ) : null}
        {stepId === 'plan' ? (
          <PlanStep
            form={planForm}
            onChange={(patch) =>
              patch.planId !== undefined
                ? onPlanChange(patch.planId)
                : setPlanForm((f) => ({ ...f, ...patch }))
            }
            planOptions={planOptions}
            branchOptions={branchOptions}
            loading={plansQuery.isLoading || branchesQuery.isLoading}
          />
        ) : null}
        {stepId === 'payment' ? (
          <PaymentStep
            selectedPlan={selectedPlan}
            cashSessionLoading={cashSessionQuery.isLoading}
            hasCashSession={hasCashSession}
            paymentMethodOptions={paymentMethodOptions}
            paymentMethodId={paymentMethodId}
            onPaymentMethodChange={setPaymentMethodId}
            chargeAmount={chargeAmount || selectedPlan?.price || ''}
            priceQuote={priceQuote}
          />
        ) : null}
        {stepId === 'plan' && selectedPlan?.billingCycle === 'MONTHLY' && <label className="mt-4 flex items-center gap-2"><Checkbox checked={autoRenew} onChange={(event) => setAutoRenew(event.target.checked)} />Generar la próxima cuota cada mes</label>}
      </Card>

      {stepId === 'personal' && personalError ? (
        <Alert tone="danger" title="No pudimos crear el socio" live>
          {personalError}
        </Alert>
      ) : null}
      {stepId === 'plan' && planError ? (
        <Alert tone="danger" title="Revisá el paso" live>
          {planError}
        </Alert>
      ) : null}
      {stepId === 'payment' && paymentError ? (
        <Alert tone="danger" title="No pudimos registrar la membresía" live>
          {paymentError}
        </Alert>
      ) : null}

      <div className="flex items-center justify-between">
        <Button variant="ghost" asChild>
          <Link href="/members">Cancelar</Link>
        </Button>
        <div className="flex gap-2">
          {stepId === 'plan' ? (
            <Button variant="outline" onClick={handleSkipPlan}>
              Omitir plan y finalizar
            </Button>
          ) : null}
          {stepId === 'payment' ? (
            <Button variant="outline" onClick={() => setStepId('plan')}>
              Anterior
            </Button>
          ) : null}

          {stepId === 'personal' ? (
            <Button
              onClick={handlePersonalSubmit}
              loading={createMemberMutation.isPending}
              disabled={createMemberMutation.isPending}
            >
              {member ? 'Continuar' : 'Crear socio y continuar'}
            </Button>
          ) : null}
          {stepId === 'plan' ? <Button onClick={handlePlanNext}>Siguiente</Button> : null}
          {stepId === 'payment' && planForm.planId ? (
            hasCashSession ? (
              <>
                <Button
                  variant="outline"
                  onClick={handleFinishWithoutCharge}
                  loading={createMembershipMutation.isPending}
                  disabled={createMembershipMutation.isPending}
                >
                  Finalizar sin cobrar
                </Button>
                <Button
                  onClick={handleChargeNow}
                  loading={createMembershipMutation.isPending}
                  disabled={createMembershipMutation.isPending}
                >
                  Confirmar y cobrar
                </Button>
              </>
            ) : (
              <Button
                onClick={handleFinishWithoutCharge}
                loading={createMembershipMutation.isPending}
                disabled={createMembershipMutation.isPending || cashSessionQuery.isLoading}
              >
                Confirmar
              </Button>
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}

interface PersonalStepProps {
  form: PersonalFormState;
  errors: Partial<Record<keyof PersonalFormState, string>>;
  onChange: <K extends keyof PersonalFormState>(key: K, value: PersonalFormState[K]) => void;
  locked: boolean;
}

function PersonalStep({ form, errors, onChange, locked }: PersonalStepProps) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {locked ? (
        <Alert tone="info" className="md:col-span-2">
          Este socio ya se creó. Para corregir estos datos, editalo desde su ficha.
        </Alert>
      ) : null}
      <FormField label="Tipo de documento" required>
        {(field) => (
          <Select
            {...field}
            options={DOCUMENT_OPTIONS}
            value={form.documentType}
            disabled={locked}
            onValueChange={(v) => onChange('documentType', v as MemberDocumentType)}
          />
        )}
      </FormField>
      <FormField
        label="Número de documento"
        required
        hint={documentHint(form.documentType)}
        error={errors.documentNumber}
      >
        {(field) => (
          <Input
            {...field}
            value={form.documentNumber}
            onChange={(e) => onChange('documentNumber', e.target.value)}
            autoComplete="off"
            disabled={locked}
            required
          />
        )}
      </FormField>
      <FormField label="Nombre" required error={errors.firstName}>
        {(field) => (
          <Input
            {...field}
            value={form.firstName}
            onChange={(e) => onChange('firstName', e.target.value)}
            disabled={locked}
            required
          />
        )}
      </FormField>
      <FormField label="Apellido" required error={errors.lastName}>
        {(field) => (
          <Input
            {...field}
            value={form.lastName}
            onChange={(e) => onChange('lastName', e.target.value)}
            disabled={locked}
            required
          />
        )}
      </FormField>
      <FormField label="Teléfono" hint="Se normaliza a formato internacional." error={errors.phone}>
        {(field) => (
          <Input
            {...field}
            type="tel"
            value={form.phone}
            onChange={(e) => onChange('phone', e.target.value)}
            disabled={locked}
            autoComplete="tel"
          />
        )}
      </FormField>
      <FormField label="Email" error={errors.email}>
        {(field) => (
          <Input
            {...field}
            type="email"
            value={form.email}
            onChange={(e) => onChange('email', e.target.value)}
            disabled={locked}
            autoComplete="email"
          />
        )}
      </FormField>
      <FormField label="Fecha de nacimiento">
        {(field) => (
          <Input
            {...field}
            type="date"
            value={form.birthDate}
            onChange={(e) => onChange('birthDate', e.target.value)}
            disabled={locked}
          />
        )}
      </FormField>
    </div>
  );
}

interface PlanStepProps {
  form: PlanFormState;
  onChange: (patch: Partial<PlanFormState>) => void;
  planOptions: Array<{ value: string; label: string }>;
  branchOptions: Array<{ value: string; label: string }>;
  loading: boolean;
}

function PlanStep({ form, onChange, planOptions, branchOptions, loading }: PlanStepProps) {
  if (loading) {
    return <p className="text-(--text-sm) text-(--color-muted)">Cargando planes y sedes…</p>;
  }
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <FormField label="Plan" hint="Opcional: dejalo vacío y tocá 'Omitir plan y finalizar'.">
        {(field) => (
          <Select
            {...field}
            options={planOptions}
            value={form.planId}
            placeholder="Sin plan"
            onValueChange={(v) => onChange({ planId: v })}
          />
        )}
      </FormField>
      <FormField label="Sede">
        {(field) => (
          <Select
            {...field}
            options={branchOptions}
            value={form.branchId}
            onValueChange={(v) => onChange({ branchId: v })}
          />
        )}
      </FormField>
      <FormField label="Fecha de inicio">
        {(field) => (
          <Input
            {...field}
            type="date"
            value={form.startDate}
            onChange={(e) => onChange({ startDate: e.target.value })}
          />
        )}
      </FormField>
    </div>
  );
}

interface PaymentStepProps {
  selectedPlan: Plan | undefined;
  cashSessionLoading: boolean;
  hasCashSession: boolean;
  paymentMethodOptions: Array<{ value: string; label: string }>;
  paymentMethodId: string;
  onPaymentMethodChange: (id: string) => void;
  chargeAmount: string;
  priceQuote: ReturnType<typeof quoteEnrollmentPrice> | null;
}

/** Este paso sólo se muestra con un plan ya elegido (§handlePlanNext lo exige). */
function PaymentStep({
  selectedPlan,
  cashSessionLoading,
  hasCashSession,
  paymentMethodOptions,
  paymentMethodId,
  onPaymentMethodChange,
  chargeAmount,
  priceQuote,
}: PaymentStepProps) {
  if (cashSessionLoading) {
    return (
      <p className="text-(--text-sm) text-(--color-muted)">Revisando si hay una caja abierta…</p>
    );
  }
  if (!hasCashSession) {
    return (
      <Alert tone="warning" title="No hay una caja abierta en esta sede">
        Podés terminar el alta igual: el precio del plan
        {selectedPlan ? ` (${selectedPlan.name})` : ''} queda como saldo pendiente del socio hasta
        que se cobre desde Caja.
      </Alert>
    );
  }
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <FormField label="Método de pago" required>
        {(field) => (
          <Select
            {...field}
            options={paymentMethodOptions}
            value={paymentMethodId}
            onValueChange={onPaymentMethodChange}
          />
        )}
      </FormField>
      <div className="grid gap-1.5">
        <span className="text-(--text-sm) font-medium text-(--color-text)">Monto calculado</span>
        <div className="flex h-10 items-center border-2 border-(--color-border) px-3 font-bold text-(--color-text)">
          <MoneyDisplay value={chargeAmount} />
        </div>
        {priceQuote ? (
          <p className="text-(--text-xs) text-(--color-muted)">
            {enrollmentPriceBandLabel(priceQuote.band)}
            {priceQuote.transferSurcharge !== '0.00' ? ' · incluye $5.000 por transferencia' : ''}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function DoneScreen({ summary }: { summary: DoneSummary }) {
  const { member, membership } = summary;
  const chargedNow = Boolean(membership?.cashMovement);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Nuevo socio" description="Alta completada." />
      <Alert tone="success" title="El socio quedó activo">
        {member.firstName} {member.lastName} ya está dado de alta.
      </Alert>
      <Card className="flex flex-col gap-3 p-6">
        <SummaryRow
          label="Membresía"
          value={
            membership
              ? `Sí — ${membership.membership.status === 'ACTIVE' ? 'activa' : membership.membership.status}`
              : 'No se asignó ninguna'
          }
        />
        {membership ? (
          <SummaryRow
            label="Pago"
            value={
              chargedNow && membership.cashMovement ? (
                <>
                  Sí — <MoneyDisplay value={membership.cashMovement.amount} />
                </>
              ) : (
                'No — queda como saldo pendiente'
              )
            }
          />
        ) : null}
      </Card>
      <div className="flex gap-2">
        <Button asChild>
          <Link href={`/members/${member.id}`}>Ver ficha del socio</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/members">Volver al listado</Link>
        </Button>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-(--color-border) pb-2 last:border-0 last:pb-0">
      <span className="text-(--text-sm) text-(--color-muted)">{label}</span>
      <span className="text-(--text-sm) font-medium text-(--color-text)">{value}</span>
    </div>
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.detail ?? error.message;
  return 'Ocurrió un error inesperado.';
}

function renewAfterServerRejection(error: unknown, renew: () => string): void {
  if (error instanceof ApiError && !error.isNetworkError) renew();
}
