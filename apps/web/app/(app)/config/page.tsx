'use client';

import * as React from 'react';
import { ChevronDown, Settings } from 'lucide-react';
import {
  Alert,
  Button,
  Checkbox,
  EmptyState,
  Input,
  Select,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  useToast,
} from '@pulso/ui';
import { PageHeader } from '@/components/shared/PageHeader';
import { PermissionGate } from '@/lib/auth/permissions';

const TIMEZONE_OPTIONS = [
  { value: 'America/Argentina/Buenos_Aires', label: 'Buenos Aires (GMT-3)' },
  { value: 'America/Argentina/Cordoba', label: 'Córdoba (GMT-3)' },
  { value: 'America/Argentina/Mendoza', label: 'Mendoza (GMT-3)' },
  { value: 'America/Argentina/Salta', label: 'Salta (GMT-3)' },
];

interface AccessSettings {
  blockOnDebt: boolean;
  duplicateWindow: boolean;
  sounds: boolean;
}

export default function ConfigPage() {
  return (
    <PermissionGate
      permission="config:read"
      fallback={
        <EmptyState title="Sin acceso" description="Tu usuario no tiene permiso para ver esta pantalla." />
      }
    >
      <ConfigScreen />
    </PermissionGate>
  );
}

function ConfigScreen() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Configuración general"
        description="Ajustes de caja, control de acceso, sede y app móvil."
        icon={Settings}
        mock
      />

      <Tabs defaultValue="gimnasio">
        <TabsList>
          <TabsTrigger value="gimnasio">Gimnasio</TabsTrigger>
          <TabsTrigger value="facturacion">Facturación electrónica</TabsTrigger>
          <TabsTrigger value="app-movil">App móvil</TabsTrigger>
        </TabsList>

        <TabsContent value="gimnasio">
          <GymTab />
        </TabsContent>

        <TabsContent value="facturacion">
          <BillingTab />
        </TabsContent>

        <TabsContent value="app-movil">
          <MobileAppTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function GymTab() {
  const [allowNonCashiers, setAllowNonCashiers] = React.useState(false);
  const [access, setAccess] = React.useState<AccessSettings>({
    blockOnDebt: true,
    duplicateWindow: true,
    sounds: true,
  });
  const [branchName, setBranchName] = React.useState('Sede Centro');
  const [timezone, setTimezone] = React.useState(TIMEZONE_OPTIONS[0]!.value);
  const [maxCapacity, setMaxCapacity] = React.useState('150');
  const [graceDays, setGraceDays] = React.useState('3');

  const updateAccess = (key: keyof AccessSettings) => (checked: boolean) =>
    setAccess((current) => ({ ...current, [key]: checked }));

  return (
    <div className="flex flex-col gap-3">
      <AccordionSection title="Caja" defaultOpen>
        <ToggleRow
          id="cash-allow-non-cashiers"
          label="Permitir operar caja a no cajeros"
          description="Habilita a cualquier usuario con sesión activa a registrar movimientos de caja, no sólo a quienes tengan el rol de cajero."
          checked={allowNonCashiers}
          onChange={setAllowNonCashiers}
        />
        <SaveButton />
      </AccordionSection>

      <AccordionSection title="Control de acceso">
        <ToggleRow
          id="access-block-on-debt"
          label="Bloquear ingreso con deuda"
          description="No permite el check-in de socios con saldo pendiente."
          checked={access.blockOnDebt}
          onChange={updateAccess('blockOnDebt')}
        />
        <ToggleRow
          id="access-duplicate-window"
          label="Ventana de duplicados"
          description="Bloquea check-ins repetidos del mismo socio dentro de una ventana corta de tiempo."
          checked={access.duplicateWindow}
          onChange={updateAccess('duplicateWindow')}
        />
        <ToggleRow
          id="access-sounds"
          label="Sonidos"
          description="Reproduce un sonido distinto para ingreso permitido y rechazado."
          checked={access.sounds}
          onChange={updateAccess('sounds')}
        />
        <SaveButton />
      </AccordionSection>

      <AccordionSection title="Sede">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="branch-name" className="text-(--text-sm) font-medium text-(--color-text)">
              Nombre visible
            </label>
            <Input
              id="branch-name"
              value={branchName}
              onChange={(event) => setBranchName(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="branch-timezone" className="text-(--text-sm) font-medium text-(--color-text)">
              Zona horaria
            </label>
            <Select id="branch-timezone" options={TIMEZONE_OPTIONS} value={timezone} onValueChange={setTimezone} />
          </div>
        </div>
        <SaveButton />
      </AccordionSection>

      <AccordionSection title="Parámetros">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="max-capacity" className="text-(--text-sm) font-medium text-(--color-text)">
              Capacidad máxima de socios
            </label>
            <Input
              id="max-capacity"
              type="number"
              inputMode="numeric"
              min={0}
              value={maxCapacity}
              onChange={(event) => setMaxCapacity(event.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="grace-days" className="text-(--text-sm) font-medium text-(--color-text)">
              Días de gracia
            </label>
            <Input
              id="grace-days"
              type="number"
              inputMode="numeric"
              min={0}
              value={graceDays}
              onChange={(event) => setGraceDays(event.target.value)}
            />
          </div>
        </div>
        <SaveButton />
      </AccordionSection>
    </div>
  );
}

function BillingTab() {
  const [cuit, setCuit] = React.useState('');
  const [posNumber, setPosNumber] = React.useState('');

  return (
    <div className="flex flex-col gap-4">
      <Alert tone="info" title="Integración ARCA en etapa posterior">
        La facturación electrónica todavía no está conectada. Estos campos quedan a modo de referencia hasta que
        el backend de facturación esté disponible.
      </Alert>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="billing-cuit" className="text-(--text-sm) font-medium text-(--color-text)">
            CUIT
          </label>
          <Input
            id="billing-cuit"
            value={cuit}
            onChange={(event) => setCuit(event.target.value)}
            placeholder="30-12345678-9"
            disabled
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="billing-pos" className="text-(--text-sm) font-medium text-(--color-text)">
            Punto de venta
          </label>
          <Input
            id="billing-pos"
            value={posNumber}
            onChange={(event) => setPosNumber(event.target.value)}
            placeholder="0001"
            disabled
          />
        </div>
      </div>
      <SaveButton />
    </div>
  );
}

function MobileAppTab() {
  const [allowBookingFromApp, setAllowBookingFromApp] = React.useState(false);

  return (
    <div className="flex flex-col gap-4">
      <Alert tone="info" title="Próximamente">
        La app de socios llega después del MVP. Este ajuste queda preparado para cuando esté disponible.
      </Alert>
      <ToggleRow
        id="mobile-app-booking"
        label="Permitir reservas desde la app"
        description="Los socios van a poder reservar turnos de actividades desde su celular."
        checked={allowBookingFromApp}
        onChange={setAllowBookingFromApp}
      />
      <SaveButton />
    </div>
  );
}

function AccordionSection({
  title,
  defaultOpen,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details
      open={defaultOpen}
      className="group rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface)"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-(--text-base) font-medium text-(--color-text) [&::-webkit-details-marker]:hidden">
        {title}
        <ChevronDown
          className="h-4 w-4 shrink-0 text-(--color-muted) transition-transform duration-200 group-open:rotate-180"
          aria-hidden={true}
        />
      </summary>
      <div className="flex flex-col gap-4 border-t border-(--color-border) px-4 py-4">{children}</div>
    </details>
  );
}

function ToggleRow({
  id,
  label,
  description,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const descriptionId = description ? `${id}-description` : undefined;
  return (
    <div className="flex items-start gap-3">
      <Checkbox
        id={id}
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        aria-describedby={descriptionId}
      />
      <div className="flex flex-col gap-0.5">
        <label htmlFor={id} className="text-(--text-sm) font-medium text-(--color-text)">
          {label}
        </label>
        {description ? (
          <p id={descriptionId} className="text-(--text-xs) text-(--color-muted)">
            {description}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function SaveButton() {
  const { toast } = useToast();
  return (
    <div className="flex justify-end">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => toast({ title: 'Demo: disponible con backend', tone: 'info' })}
      >
        Guardar cambios
      </Button>
    </div>
  );
}
