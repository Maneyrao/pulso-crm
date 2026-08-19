'use client';

import * as React from 'react';
import { Fingerprint } from 'lucide-react';
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, StatusBadge } from '@pulso/ui';
import { PermissionGate } from '@/lib/auth/permissions';
import { MockBadge } from '@/components/shared/MockBadge';
import { EnrollmentDialog } from './EnrollmentDialog';

/**
 * Estado biométrico del socio en su ficha. Hasta la Etapa 7-8 no hay
 * credenciales persistidas (no existe el modelo BiometricCredential): la
 * tarjeta muestra el flujo de enrolamiento contra el agente simulado.
 */
export function BiometricsCard({ memberName }: { memberName: string }) {
  const [open, setOpen] = React.useState(false);

  return (
    <PermissionGate permission="biometrics:enroll">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Fingerprint className="h-4 w-4" aria-hidden={true} />
            Huella digital
            <MockBadge />
          </CardTitle>
          <CardDescription>Acceso al gimnasio con lector biométrico.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap items-center justify-between gap-3">
          <StatusBadge tone="neutral" label="Sin huella enrolada" />
          <Button variant="outline" onClick={() => setOpen(true)}>
            Enrolar huella
          </Button>
        </CardContent>
      </Card>
      <EnrollmentDialog open={open} onOpenChange={setOpen} memberName={memberName} />
    </PermissionGate>
  );
}
