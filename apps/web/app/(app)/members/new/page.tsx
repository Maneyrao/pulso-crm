'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { DOCUMENT_TYPES, documentHint } from '@pulso/config/document';
import type { CreateMemberRequest, MemberDocumentType, Gender } from '@pulso/contracts/members';
import { GENDERS } from '@pulso/contracts/members';
import {
  Alert,
  Button,
  Card,
  EmptyState,
  FormField,
  Input,
  Select,
  Stepper,
  Textarea,
  useToast,
  type StepperStep,
} from '@pulso/ui';
import { createMember } from '@/lib/api/members';
import { useIdempotencyKey } from '@/lib/api/idempotency';
import { ApiError } from '@/lib/api/errors';
import { PermissionGate } from '@/lib/auth/permissions';
import { useSessionStore } from '@/lib/stores/session';

/** Se guarda como borrador; los campos sensibles (documento, email) NO se persisten. */
const DRAFT_KEY = 'member-draft-v1';

interface DraftState {
  documentType: MemberDocumentType;
  firstName: string;
  lastName: string;
  birthDate: string;
  gender: string;
  phone: string;
  address: string;
  notes: string;
}

interface FormState extends DraftState {
  documentNumber: string;
  email: string;
}

const EMPTY_FORM: FormState = {
  documentType: 'DNI',
  documentNumber: '',
  firstName: '',
  lastName: '',
  birthDate: '',
  gender: '',
  email: '',
  phone: '',
  address: '',
  notes: '',
};

const STEPS: readonly StepperStep[] = [
  { id: 'identity', label: 'Identidad', description: 'Nombre, documento y datos personales.' },
  { id: 'contact', label: 'Contacto', description: 'Cómo comunicarnos con el socio.' },
  { id: 'review', label: 'Revisión', description: 'Verificá y confirmá el alta.' },
];

const DOCUMENT_OPTIONS = DOCUMENT_TYPES.map((type) => ({ value: type, label: type }));

/** Etiquetas humanas — el enum del backend está en inglés. */
const GENDER_LABELS: Record<Gender, string> = {
  FEMALE: 'Femenino',
  MALE: 'Masculino',
  OTHER: 'Otro',
  UNDISCLOSED: 'Prefiero no decir',
};

const GENDER_OPTIONS = [
  { value: '', label: 'Sin especificar' },
  ...GENDERS.map((g) => ({ value: g, label: GENDER_LABELS[g] })),
];

export default function NewMemberPage() {
  return (
    <PermissionGate
      permission="member:write"
      fallback={
        <EmptyState title="Sin acceso" description="Tu usuario no tiene permiso para crear socios." />
      }
    >
      <NewMemberScreen />
    </PermissionGate>
  );
}

function NewMemberScreen() {
  const router = useRouter();
  const branchId = useSessionStore((s) => s.activeBranchId);
  const { toast } = useToast();
  const idempotency = useIdempotencyKey();

  const [form, setForm] = React.useState<FormState>(() => ({ ...EMPTY_FORM, ...loadDraft() }));
  const [stepId, setStepId] = React.useState<(typeof STEPS)[number]['id']>('identity');
  const [error, setError] = React.useState<string | undefined>();
  const [stepErrors, setStepErrors] = React.useState<Partial<Record<keyof FormState, string>>>({});
  const [completed, setCompleted] = React.useState<string[]>([]);

  // Guarda el borrador (sin documento ni email) cada vez que cambia el formulario.
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const draft: DraftState = {
      documentType: form.documentType,
      firstName: form.firstName,
      lastName: form.lastName,
      birthDate: form.birthDate,
      gender: form.gender,
      phone: form.phone,
      address: form.address,
      notes: form.notes,
    };
    try {
      window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    } catch {
      // sessionStorage puede fallar en modo privado; no interrumpe el flujo.
    }
  }, [form]);

  const mutation = useMutation({
    mutationFn: (payload: CreateMemberRequest) => createMember(payload, idempotency.getKey()),
    onSuccess: (member) => {
      // Limpieza del borrador — el alta ya se persistió.
      try {
        window.sessionStorage.removeItem(DRAFT_KEY);
      } catch {
        /* ignore */
      }
      toast({ title: 'Socio creado', description: `${member.firstName} ${member.lastName}`, tone: 'success' });
      router.push(`/members/${member.id}`);
    },
    onError: (err: unknown) => {
      setError(errorMessage(err));
    },
  });

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]): void => {
    setForm((f) => ({ ...f, [key]: value }));
    if (stepErrors[key]) {
      setStepErrors((s) => {
        const next = { ...s };
        delete next[key];
        return next;
      });
    }
  };

  const validateIdentity = (): boolean => {
    const errs: Partial<Record<keyof FormState, string>> = {};
    if (!form.firstName.trim()) errs.firstName = 'Ingresá el nombre.';
    if (!form.lastName.trim()) errs.lastName = 'Ingresá el apellido.';
    if (!form.documentNumber.trim()) errs.documentNumber = 'Ingresá el documento.';
    setStepErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const validateContact = (): boolean => {
    const errs: Partial<Record<keyof FormState, string>> = {};
    if (form.email.trim() && !/^\S+@\S+\.\S+$/.test(form.email.trim())) {
      errs.email = 'Formato de email inválido.';
    }
    if (form.phone.trim() && form.phone.trim().length < 6) {
      errs.phone = 'Ingresá al menos 6 dígitos.';
    }
    setStepErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const goToStep = (target: (typeof STEPS)[number]['id']): void => {
    setError(undefined);
    if (stepId === 'identity' && target !== 'identity') {
      if (!validateIdentity()) return;
      setCompleted((c) => Array.from(new Set([...c, 'identity'])));
    }
    if (stepId === 'contact' && target === 'review') {
      if (!validateContact()) return;
      setCompleted((c) => Array.from(new Set([...c, 'contact'])));
    }
    setStepId(target);
  };

  const handleSubmit = (): void => {
    if (!branchId) {
      setError('Elegí una sede activa antes de crear el socio.');
      return;
    }
    // El botón queda `disabled` mientras isPending; este guardia extra evita
    // que un doble Enter dispare dos altas antes de que React actualice el
    // estado (la clave de idempotencia igual cubriría, pero preferimos evitar
    // el ida-y-vuelta).
    if (mutation.isPending) return;

    setError(undefined);
    const payload: CreateMemberRequest = {
      documentType: form.documentType,
      documentNumber: form.documentNumber.trim(),
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      branchId,
      ...(form.email.trim() ? { email: form.email.trim() } : {}),
      ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
      ...(form.birthDate ? { birthDate: form.birthDate } : {}),
      ...(form.gender ? { gender: form.gender as Gender } : {}),
      ...(form.address.trim() ? { address: form.address.trim() } : {}),
      ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
    };
    mutation.mutate(payload);
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-(--text-2xl) font-semibold text-(--color-text)">Nuevo socio</h1>
        <p className="text-(--text-sm) text-(--color-muted)">
          Completá los tres pasos para dar de alta a una persona en el gimnasio.
        </p>
      </div>

      <Stepper steps={STEPS} currentStepId={stepId} completedStepIds={completed} />

      {error ? (
        <Alert tone="danger" title="No pudimos crear el socio" live>
          {error}
        </Alert>
      ) : null}

      <Card className="p-6">
        {stepId === 'identity' ? (
          <IdentityStep form={form} errors={stepErrors} onChange={setField} />
        ) : null}
        {stepId === 'contact' ? (
          <ContactStep form={form} errors={stepErrors} onChange={setField} />
        ) : null}
        {stepId === 'review' ? <ReviewStep form={form} /> : null}
      </Card>

      <div className="flex items-center justify-between">
        <Button variant="ghost" asChild>
          <Link href="/members">Cancelar</Link>
        </Button>
        <div className="flex gap-2">
          {stepId !== 'identity' ? (
            <Button
              variant="outline"
              onClick={() => goToStep(stepId === 'review' ? 'contact' : 'identity')}
            >
              Anterior
            </Button>
          ) : null}
          {stepId !== 'review' ? (
            <Button onClick={() => goToStep(stepId === 'identity' ? 'contact' : 'review')}>
              Siguiente
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              loading={mutation.isPending}
              disabled={mutation.isPending}
            >
              Crear socio
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

interface StepProps {
  form: FormState;
  errors: Partial<Record<keyof FormState, string>>;
  onChange: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
}

function IdentityStep({ form, errors, onChange }: StepProps) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <FormField label="Tipo de documento" required>
        {(field) => (
          <Select
            {...field}
            options={DOCUMENT_OPTIONS}
            value={form.documentType}
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
            required
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
          />
        )}
      </FormField>
      <FormField label="Género">
        {(field) => (
          <Select
            {...field}
            options={GENDER_OPTIONS}
            value={form.gender || undefined}
            onValueChange={(v) => onChange('gender', v)}
            placeholder="Sin especificar"
          />
        )}
      </FormField>
    </div>
  );
}

function ContactStep({ form, errors, onChange }: StepProps) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <FormField label="Email" error={errors.email}>
        {(field) => (
          <Input
            {...field}
            type="email"
            value={form.email}
            onChange={(e) => onChange('email', e.target.value)}
            autoComplete="email"
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
            autoComplete="tel"
          />
        )}
      </FormField>
      <FormField label="Dirección" className="md:col-span-2">
        {(field) => (
          <Input
            {...field}
            value={form.address}
            onChange={(e) => onChange('address', e.target.value)}
            autoComplete="street-address"
          />
        )}
      </FormField>
      <FormField label="Notas internas" className="md:col-span-2">
        {(field) => (
          <Textarea
            {...field}
            value={form.notes}
            onChange={(e) => onChange('notes', e.target.value)}
            placeholder="Cualquier observación relevante para el equipo del gimnasio."
          />
        )}
      </FormField>
    </div>
  );
}

function ReviewStep({ form }: { form: FormState }) {
  return (
    <dl className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <ReviewRow label="Nombre" value={`${form.firstName} ${form.lastName}`} />
      <ReviewRow label="Documento" value={`${form.documentType} ${form.documentNumber}`} />
      <ReviewRow label="Fecha de nacimiento" value={form.birthDate || '—'} />
      <ReviewRow label="Género" value={form.gender ? GENDER_LABELS[form.gender as Gender] : '—'} />
      <ReviewRow label="Email" value={form.email || '—'} />
      <ReviewRow label="Teléfono" value={form.phone || '—'} />
      <ReviewRow label="Dirección" value={form.address || '—'} className="md:col-span-2" />
      <ReviewRow label="Notas" value={form.notes || '—'} className="md:col-span-2" />
    </dl>
  );
}

function ReviewRow({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-(--text-xs) uppercase tracking-wide text-(--color-muted)">{label}</dt>
      <dd className="mt-0.5 text-(--text-base) text-(--color-text)">{value}</dd>
    </div>
  );
}

function loadDraft(): Partial<DraftState> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return {};
    return parsed as Partial<DraftState>;
  } catch {
    return {};
  }
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.detail ?? error.message;
  return 'Ocurrió un error inesperado.';
}
