import * as React from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { cn } from '../lib/cn.js';

export const TooltipProvider = TooltipPrimitive.Provider;

export interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactElement;
  side?: 'top' | 'right' | 'bottom' | 'left';
  delayDuration?: number;
}

/**
 * Envuelve Root+Trigger+Content en un solo componente: el caso de uso normal
 * es "un elemento, un tooltip", y separarlo en piezas sólo agrega ceremonia
 * sin necesidad real en este producto.
 */
export function Tooltip({ content, children, side = 'top', delayDuration = 200 }: TooltipProps) {
  return (
    <TooltipPrimitive.Root delayDuration={delayDuration}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className={cn(
            'z-50 rounded-(--radius-sm) bg-(--color-text) px-2.5 py-1.5 text-(length:--text-xs) text-(--color-text-foreground) shadow-(--shadow-md)',
          )}
        >
          {content}
          <TooltipPrimitive.Arrow className="fill-(--color-text)" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
