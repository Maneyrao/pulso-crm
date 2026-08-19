import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '../lib/cn.js';

export interface DrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Accesible siempre; visible salvo `hideTitle`. */
  title: string;
  hideTitle?: boolean;
  side?: 'left' | 'right';
  children?: React.ReactNode;
  className?: string;
}

/**
 * Panel lateral deslizante sobre Radix Dialog (trampa de foco y `Escape`
 * incluidos). Pensado para navegación mobile y paneles contextuales.
 * La animación usa transform + data-state de Radix; se anula con
 * `prefers-reduced-motion`.
 */
export function Drawer({ open, onOpenChange, title, hideTitle, side = 'left', children, className }: DrawerProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/40 data-[state=open]:animate-(--animate-fade-in)" />
        <DialogPrimitive.Content
          className={cn(
            'fixed inset-y-0 z-50 flex w-72 max-w-[85vw] flex-col bg-(--color-surface) shadow-(--shadow-lg) outline-none',
            'transition-transform duration-200 motion-reduce:transition-none',
            side === 'left'
              ? 'left-0 border-r border-(--color-border) data-[state=closed]:-translate-x-full data-[state=open]:translate-x-0'
              : 'right-0 border-l border-(--color-border) data-[state=closed]:translate-x-full data-[state=open]:translate-x-0',
            className,
          )}
        >
          <DialogPrimitive.Title
            className={cn('px-4 pt-4 text-(--text-lg) font-semibold text-(--color-text)', hideTitle && 'sr-only')}
          >
            {title}
          </DialogPrimitive.Title>
          {children}
          <DialogPrimitive.Close
            aria-label="Cerrar"
            className="absolute right-3 top-3 rounded-(--radius-sm) p-1 text-(--color-muted) hover:bg-(--color-muted-subtle) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </DialogPrimitive.Close>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
