'use client';

import { ConfirmDialog } from '@pulso/ui';

export function ConsentConfirmationDialog({
  open,
  onOpenChange,
  memberName,
  onConfirm,
  loading = false,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  memberName?: string;
  onConfirm: () => void | Promise<void>;
  loading?: boolean;
}) {
  const subject = memberName ? `${memberName} confirmó` : 'El socio confirmó';

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Confirmar consentimiento biométrico"
      description={`${subject} que fue informado y autoriza el uso de su huella para registrar accesos. Se guardarán el usuario responsable, la fecha y la versión del consentimiento.`}
      confirmLabel="Confirmar consentimiento"
      onConfirm={onConfirm}
      loading={loading}
    />
  );
}
