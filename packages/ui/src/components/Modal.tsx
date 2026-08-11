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
export function Modal({ open, onOpenChange, title, description, children, footer, size = 'md', hideTitle }: ModalProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <DialogPrimitive.Content
          className={cn(
            'fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-(--radius-lg) border border-(--color-border) bg-(--color-surface) p-6 shadow-(--shadow-lg)',
            SIZES[size],
          )}
        >
          <DialogPrimitive.Title className={cn('text-(--text-lg) font-semibold text-(--color-text)', hideTitle && 'sr-only')}>
            {title}
          </DialogPrimitive.Title>
          {description ? (
            <DialogPrimitive.Description className="mt-1 text-(--text-sm) text-(--color-muted)">
              {description}
            </DialogPrimitive.Description>
          ) : null}
          <div className="mt-4">{children}</div>
          {footer ? <div className="mt-6 flex justify-end gap-2">{footer}</div> : null}
          <DialogPrimitive.Close
            aria-label="Cerrar"
            className="absolute right-4 top-4 rounded-(--radius-sm) p-1 text-(--color-muted) hover:bg-(--color-muted-subtle) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
