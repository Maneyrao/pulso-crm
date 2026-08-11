'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { cn } from '../lib/cn.js';
import { Button } from './Button.js';
import { Input } from './Input.js';
import { Label } from './Label.js';

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** `danger` enfatiza visualmente y arranca con el foco en Cancelar, no en Confirmar. */
  tone?: 'default' | 'danger';
  onConfirm: () => void | Promise<void>;
  loading?: boolean;
  /**
   * Si se define, el botón de confirmar queda deshabilitado hasta que el
   * usuario escriba exactamente este texto — para acciones peligrosas que no
   * alcanzan con un solo click (ej. reversas de caja, revocar un agente).
   */
  requireTextConfirmation?: string;
  requireTextLabel?: string;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  tone = 'default',
  onConfirm,
  loading = false,
  requireTextConfirmation,
  requireTextLabel,
}: ConfirmDialogProps) {
  const [typedText, setTypedText] = React.useState('');
  const cancelRef = React.useRef<HTMLButtonElement>(null);
  const inputId = React.useId();

  // El texto tipeado no debe sobrevivir a un cierre/reapertura del diálogo.
  React.useEffect(() => {
    if (!open) setTypedText('');
  }, [open]);

  const requiresText = Boolean(requireTextConfirmation);
  const textMatches = !requiresText || typedText === requireTextConfirmation;
  const confirmDisabled = loading || !textMatches;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <DialogPrimitive.Content
          className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface) p-6 shadow-(--shadow-lg)"
          // Diálogos destructivos: el foco inicial va a Cancelar, no a Confirmar
          // (FRONTEND_PLAN §6.7) — evita que un Enter accidental dispare la acción.
          onOpenAutoFocus={(event) => {
            if (tone === 'danger') {
              event.preventDefault();
              cancelRef.current?.focus();
            }
          }}
        >
          <DialogPrimitive.Title className="text-(--text-lg) font-semibold text-(--color-text)">
            {title}
          </DialogPrimitive.Title>
          {description ? (
            <DialogPrimitive.Description className="mt-1 text-(--text-sm) text-(--color-muted)">
              {description}
            </DialogPrimitive.Description>
          ) : null}

          {requiresText ? (
            <div className="mt-4 flex flex-col gap-1.5">
              <Label htmlFor={inputId}>{requireTextLabel ?? `Escribí "${requireTextConfirmation}" para confirmar`}</Label>
              <Input
                id={inputId}
                value={typedText}
                onChange={(event) => setTypedText(event.target.value)}
                autoComplete="off"
              />
            </div>
          ) : null}

          <div className="mt-6 flex justify-end gap-2">
            <DialogPrimitive.Close asChild>
              <Button ref={cancelRef} variant="outline" type="button">
                {cancelLabel}
              </Button>
            </DialogPrimitive.Close>
            <Button
              type="button"
              variant={tone === 'danger' ? 'danger' : 'primary'}
              disabled={confirmDisabled}
              loading={loading}
              onClick={() => onConfirm()}
              className={cn(confirmDisabled && 'cursor-not-allowed')}
            >
              {confirmLabel}
            </Button>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
