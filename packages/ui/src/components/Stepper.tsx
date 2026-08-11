import * as React from 'react';
import { Check } from 'lucide-react';
import { cn } from '../lib/cn.js';

export interface StepperStep {
  id: string;
  label: string;
  description?: string;
}

export interface StepperProps extends React.HTMLAttributes<HTMLOListElement> {
  steps: readonly StepperStep[];
  currentStepId: string;
  /** Pasos ya completados (pueden no ser un prefijo contiguo, ej. "Plan y membresía" es omitible). */
  completedStepIds?: readonly string[];
}

/**
 * Stepper como lista semántica (`<ol>`) con `aria-current="step"` en el paso
 * activo (FRONTEND_PLAN §6.5). No es un wizard: sólo indica progreso: quien
 * lo usa decide cuándo avanzar.
 */
export function Stepper({ steps, currentStepId, completedStepIds = [], className, ...props }: StepperProps) {
  return (
    <ol className={cn('flex items-start gap-2', className)} {...props}>
      {steps.map((step, index) => {
        const isCurrent = step.id === currentStepId;
        const isCompleted = completedStepIds.includes(step.id);
        return (
          <li
            key={step.id}
            aria-current={isCurrent ? 'step' : undefined}
            className="flex flex-1 flex-col gap-1.5"
          >
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className={cn(
                  'flex h-6 w-6 shrink-0 items-center justify-center rounded-(--radius-full) text-(--text-xs) font-medium',
                  isCompleted && 'bg-(--color-success) text-(--color-success-foreground)',
                  isCurrent && !isCompleted && 'bg-(--color-primary) text-(--color-primary-foreground)',
                  !isCurrent && !isCompleted && 'bg-(--color-muted-subtle) text-(--color-muted-subtle-foreground)',
                )}
              >
                {isCompleted ? <Check className="h-3.5 w-3.5" /> : index + 1}
              </span>
              <span
                className={cn(
                  'text-(--text-sm) font-medium',
                  isCurrent ? 'text-(--color-text)' : 'text-(--color-muted)',
                )}
              >
                {step.label}
                {isCompleted ? <span className="sr-only"> (completado)</span> : null}
              </span>
            </div>
            {step.description ? (
              <p className="pl-8 text-(--text-xs) text-(--color-muted)">{step.description}</p>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
