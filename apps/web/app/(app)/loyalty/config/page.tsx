'use client';

import * as React from 'react';
import { Settings2 } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  Input,
  Label,
  Skeleton,
  useToast,
} from '@pulso/ui';
import { PageHeader } from '@/components/shared/PageHeader';
import { PermissionGate } from '@/lib/auth/permissions';
import { useMockData } from '@/lib/mock/useMockData';
import { DEMO_LOYALTY_RULES, type DemoRedemption } from '@/lib/mock/data/commerce-demo';

const DEMO_TOAST_MESSAGE = 'Demo: disponible con backend';

/**
 * Fidelización › Configuración de puntos — sin backend todavía
 * (`loyalty:config`), pantalla de demo con `useMockData`
 * (docs/CONTROLFIT_PARITY_AUDIT.md §2). Los inputs son editables en memoria;
 * "Guardar" no persiste nada todavía.
 */
export default function LoyaltyConfigPage() {
  return (
    <PermissionGate
      permission="loyalty:config"
      fallback={
        <EmptyState title="Sin acceso" description="Tu usuario no tiene permiso para ver esta pantalla." />
      }
    >
      <LoyaltyConfigScreen />
    </PermissionGate>
  );
}

function LoyaltyConfigScreen() {
  const { data, isLoading } = useMockData(() => DEMO_LOYALTY_RULES);
  const { toast } = useToast();

  const [attendancePoints, setAttendancePoints] = React.useState<number | null>(null);
  const [renewalPoints, setRenewalPoints] = React.useState<number | null>(null);
  const [redemptions, setRedemptions] = React.useState<DemoRedemption[] | null>(null);

  React.useEffect(() => {
    if (!data) return;
    setAttendancePoints(data.attendancePoints);
    setRenewalPoints(data.renewalPoints);
    setRedemptions(data.redemptions.map((r) => ({ ...r })));
  }, [data]);

  const updateRedemptionPoints = (id: string, points: number): void => {
    setRedemptions((current) =>
      (current ?? []).map((r) => (r.id === id ? { ...r, points } : r)),
    );
  };

  const handleSave = (): void => {
    toast({ description: DEMO_TOAST_MESSAGE, tone: 'info' });
  };

  const ready = !isLoading && attendancePoints !== null && renewalPoints !== null && redemptions !== null;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={Settings2}
        title="Configuración de puntos"
        description="Reglas de acumulación y canje del programa de fidelización."
        mock
        actions={
          <Button onClick={handleSave} disabled={!ready}>
            Guardar
          </Button>
        }
      />

      {!ready ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Puntos por asistencia</CardTitle>
                <CardDescription>Puntos que suma un socio por cada check-in registrado.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="attendance-points">Puntos</Label>
                  <Input
                    id="attendance-points"
                    type="number"
                    min={0}
                    value={attendancePoints ?? 0}
                    onChange={(e) => setAttendancePoints(Number(e.target.value))}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Puntos por renovación</CardTitle>
                <CardDescription>Puntos que suma un socio al renovar una membresía.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="renewal-points">Puntos</Label>
                  <Input
                    id="renewal-points"
                    type="number"
                    min={0}
                    value={renewalPoints ?? 0}
                    onChange={(e) => setRenewalPoints(Number(e.target.value))}
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Canjes</CardTitle>
              <CardDescription>Catálogo de productos que un socio puede canjear con sus puntos.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {(redemptions ?? []).map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-4">
                  <span className="text-(--text-sm) text-(--color-text)">{r.product}</span>
                  <div className="flex items-center gap-2">
                    <Label htmlFor={`redemption-${r.id}`} className="sr-only">
                      Puntos para canjear {r.product}
                    </Label>
                    <Input
                      id={`redemption-${r.id}`}
                      type="number"
                      min={0}
                      className="w-28"
                      value={r.points}
                      onChange={(e) => updateRedemptionPoints(r.id, Number(e.target.value))}
                    />
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
