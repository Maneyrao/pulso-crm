import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '../lib/cn.js';

const SIZES = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-2xl',
} as const;

export interface ModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  size?: keyof typeof SIZES;
  /** Oculta el título visualmente (queda como `aria-label` accesible). Úsalo con moderación. */
  hideTitle?: boolean;
}

/**
 * Diálogo modal genérico sobre Radix: trampa de foco y cierre con `Escape`
 * vienen del primitivo. `Title` es obligatorio (Radix lo exige para
 * accesibilidad); si el diseño no quiere mostrarlo, se oculta con `hideTitle`
 * pero se mantiene en el DOM para lectores de pantalla.
 */
export function Modal({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = 'md',
  hideTitle,
}: ModalProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 data-[state=open]:animate-(--animate-fade-in)" />
        <DialogPrimitive.Content
          data-slot="modal-content"
          className={cn(
            'fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-(--radius-lg) border-2 border-(--color-border) bg-(--color-surface) shadow-(--shadow-lg) data-[state=open]:animate-(--animate-lf-scale-in)',
            SIZES[size],
          )}
        >
          <header
            data-slot="modal-header"
            className="shrink-0 px-4 pt-4 pr-12 sm:px-6 sm:pt-6 sm:pr-14"
          >
            <DialogPrimitive.Title
              className={cn(
                'text-(--text-lg) font-semibold text-(--color-text)',
                hideTitle && 'sr-only',
              )}
            >
              {title}
            </DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="mt-1 text-(--text-sm) text-(--color-muted)">
                {description}
              </DialogPrimitive.Description>
            ) : null}
          </header>
          <div
            data-slot="modal-body"
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6"
          >
            {children}
          </div>
          {footer ? (
            <div
              data-slot="modal-footer"
              className="flex shrink-0 flex-wrap justify-end gap-2 border-t-2 border-(--color-border) px-4 py-3 sm:px-6 sm:py-4"
            >
              {footer}
            </div>
          ) : null}
          <DialogPrimitive.Close
            aria-label="Cerrar"
            className="absolute right-3 top-3 rounded-(--radius-sm) p-2 text-(--color-muted) hover:bg-(--color-muted-subtle) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring) sm:right-4 sm:top-4"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
