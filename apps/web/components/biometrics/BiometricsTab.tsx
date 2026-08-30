'use client';

import * as React from 'react';
import { Fingerprint } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BiometricCredential } from '@pulso/contracts/biometrics';
import { Alert, Button, DataTable, StatusBadge, useToast, type DataTableColumn } from '@pulso/ui';
import {
  grantConsent,
  listMemberCredentials,
  revokeConsent,
  revokeCredential,
} from '@/lib/api/biometrics';
import { ApiError } from '@/lib/api/errors';
import { PermissionGate } from '@/lib/auth/permissions';
import { useSessionStore } from '@/lib/stores/session';
import { EnrollmentDialog } from './EnrollmentDialog';
import { ConsentConfirmationDialog } from './ConsentConfirmationDialog';
import { HidDiagnosticsPanel } from './HidDiagnosticsPanel';

const FINGER_LABEL: Record<string, string> = {
  RIGHT_THUMB: 'Pulgar derecho',
  RIGHT_INDEX: 'Índice derecho',
  RIGHT_MIDDLE: 'Mayor derecho',
  RIGHT_RING: 'Anular derecho',
  RIGHT_LITTLE: 'Meñique derecho',
  LEFT_THUMB: 'Pulgar izquierdo',
  LEFT_INDEX: 'Índice izquierdo',
  LEFT_MIDDLE: 'Mayor izquierdo',
  LEFT_RING: 'Anular izquierdo',
  LEFT_LITTLE: 'Meñique izquierdo',
};

/**
 * Tab Biometría del perfil de socio: consentimiento (el backend lo verifica;
 * acá sólo se registra), credenciales (metadatos — el template jamás llega al
 * navegador) y enrolamiento vía Pulso Agent. La revocación del consentimiento
 * revoca TODAS las credenciales en la misma transacción.
 */
export function BiometricsTab({ memberId, memberName }: { memberId: string; memberName?: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const activeBranchId = useSessionStore((s) => s.activeBranchId);

  const credentialsQuery = useQuery({
    queryKey: ['biometrics', 'credentials', memberId],
    queryFn: () => listMemberCredentials(memberId),
  });
  const [enrollOpen, setEnrollOpen] = React.useState(false);
  const [consentOpen, setConsentOpen] = React.useState(false);
  const [showDiagnostics, setShowDiagnostics] = React.useState(false);

  const invalidate = () =>
    void queryClient.invalidateQueries({ queryKey: ['biometrics', 'credentials', memberId] });

  const consentMutation = useMutation({
    mutationFn: () => grantConsent(memberId, { version: 'v1', grantedMethod: 'IN_PERSON_SIGNED' }),
    onSuccess: () => {
      setConsentOpen(false);
      toast({
        title: 'Consentimiento registrado',
        description:
          'Quedaron registrados usuario, fecha y versión. Ahora podés enrolar la huella.',
        tone: 'success',
      });
      if (activeBranchId) setEnrollOpen(true);
    },
    onError: (err) =>
      toast({
        title: 'No se pudo registrar',
        description: err instanceof ApiError ? err.message : undefined,
        tone: 'danger',
      }),
  });

  const revokeConsentMutation = useMutation({
    mutationFn: () => revokeConsent(memberId),
    onSuccess: (res) => {
      toast({
        title: 'Consentimiento revocado',
        description: `Se revocaron ${res.revokedCredentials} credencial(es) en la misma operación.`,
        tone: 'success',
      });
      invalidate();
    },
    onError: (err) =>
      toast({
        title: 'No se pudo revocar',
        description:
          err instanceof ApiError && err.code === 'NOT_FOUND'
            ? 'El socio no tiene consentimiento vigente.'
            : undefined,
        tone: 'danger',
      }),
  });

  const revokeCredentialMutation = useMutation({
    mutationFn: (id: string) => revokeCredential(id),
    onSuccess: () => {
      toast({ title: 'Credencial revocada', tone: 'success' });
      invalidate();
    },
    onError: () => toast({ title: 'No se pudo revocar la credencial', tone: 'danger' }),
  });

  const columns: DataTableColumn<BiometricCredential>[] = [
    {
      id: 'finger',
      header: 'Dedo',
      cell: (c) => (
        <span className="font-medium text-(--color-text)">
          {FINGER_LABEL[c.fingerPosition] ?? c.fingerPosition}
        </span>
      ),
    },
    { id: 'quality', header: 'Calidad', cell: (c) => `${c.quality}/100` },
    {
      id: 'created',
      header: 'Enrolada',
      cell: (c) => new Date(c.createdAt).toLocaleDateString('es-AR'),
    },
    {
      id: 'status',
      header: 'Estado',
      cell: (c) =>
        c.status === 'ACTIVE' ? (
          <StatusBadge tone="success" label="Activa" />
        ) : (
          <StatusBadge tone="neutral" label="Revocada" />
        ),
    },
    {
      id: 'actions',
      header: '',
      cell: (c) =>
        c.status === 'ACTIVE' ? (
          <PermissionGate permission="biometrics:revoke" fallback={null}>
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="outline"
                onClick={() => revokeCredentialMutation.mutate(c.id)}
              >
                Revocar
              </Button>
            </div>
          </PermissionGate>
        ) : null,
    },
  ];

  return (
    <div className="space-y-4">
      <Alert tone="info" title="Privacidad">
        Sólo se guarda un template de minucias cifrado, nunca la imagen de la huella. El acceso por
        documento sigue disponible siempre.
      </Alert>

      <Alert tone="info" title="Captura integrada">
        El lector se controla desde esta pantalla y la confirmación aparece dentro del CRM.
      </Alert>

      <div className="flex flex-wrap gap-2">
        <PermissionGate permission="biometrics:enroll" fallback={null}>
          <Button
            loading={consentMutation.isPending}
            variant="outline"
            onClick={() => setConsentOpen(true)}
          >
            Registrar consentimiento
          </Button>
          <Button
            onClick={() => setEnrollOpen(true)}
            disabled={!activeBranchId}
            title={!activeBranchId ? 'Seleccioná una sede' : undefined}
          >
            <Fingerprint className="h-4 w-4" aria-hidden={true} /> Enrolar huella
          </Button>
        </PermissionGate>
        <PermissionGate permission="biometrics:revoke" fallback={null}>
          <Button
            variant="danger"
            loading={revokeConsentMutation.isPending}
            onClick={() => revokeConsentMutation.mutate()}
          >
            Revocar consentimiento y credenciales
          </Button>
        </PermissionGate>
        <Button
          type="button"
          variant="outline"
          aria-expanded={showDiagnostics}
          onClick={() => setShowDiagnostics((value) => !value)}
        >
          Diagnóstico del lector
        </Button>
      </div>

      {showDiagnostics ? <HidDiagnosticsPanel /> : null}

      <DataTable<BiometricCredential>
        caption="Credenciales biométricas del socio"
        columns={columns}
        data={credentialsQuery.data?.data ?? []}
        rowKey={(c) => c.id}
        loading={credentialsQuery.isLoading}
        emptyTitle="Sin huellas enroladas"
        emptyDescription="Registrá el consentimiento y enrolá un dedo con el lector de la recepción."
      />

      {activeBranchId ? (
        <EnrollmentDialog
          open={enrollOpen}
          onOpenChange={setEnrollOpen}
          memberId={memberId}
          {...(memberName ? { memberName } : {})}
          branchId={activeBranchId}
          onEnrolled={invalidate}
        />
      ) : null}

      <ConsentConfirmationDialog
        open={consentOpen}
        onOpenChange={setConsentOpen}
        {...(memberName ? { memberName } : {})}
        onConfirm={() => consentMutation.mutate()}
        loading={consentMutation.isPending}
      />
    </div>
  );
}
