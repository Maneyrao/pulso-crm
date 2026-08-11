'use client';

import * as React from 'react';
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { cn } from '../lib/cn.js';

export type ToastTone = 'default' | 'success' | 'warning' | 'danger' | 'info';

export interface ToastOptions {
  title?: string;
  description?: string;
  tone?: ToastTone;
  /** ms antes de autodescartarse. `0` desactiva el autodescarte. */
  duration?: number;
}

interface ToastRecord extends ToastOptions {
  id: string;
}

interface ToastContextValue {
  /** Encola una notificación y devuelve su id (útil para descartarla a mano). */
  toast: (options: ToastOptions) => string;
  dismiss: (id: string) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = React.useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast debe usarse dentro de <ToastProvider>.');
  }
  return ctx;
}

function generateId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const TONE_ICON: Record<ToastTone, React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }> | null> = {
  default: null,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: XCircle,
  info: Info,
};

const TONE_CLASS: Record<ToastTone, string> = {
  default: 'border-(--color-border) bg-(--color-surface) text-(--color-text)',
  success: 'border-(--color-success) bg-(--color-success-subtle) text-(--color-success-subtle-foreground)',
  warning: 'border-(--color-warning) bg-(--color-warning-subtle) text-(--color-warning-subtle-foreground)',
  danger: 'border-(--color-danger) bg-(--color-danger-subtle) text-(--color-danger-subtle-foreground)',
  info: 'border-(--color-info) bg-(--color-info-subtle) text-(--color-info-subtle-foreground)',
};

const DEFAULT_DURATION = 5000;

export interface ToastProviderProps {
  children: React.ReactNode;
}

/**
 * Implementación propia (sin dependencia externa): estado en contexto, cola
 * en memoria, autodescarte por `setTimeout`. Alcanza para el volumen de
 * notificaciones de este producto y evita otra dependencia para algo chico.
 */
export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = React.useState<ToastRecord[]>([]);

  const dismiss = React.useCallback((id: string) => {
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = React.useCallback((options: ToastOptions) => {
    const id = generateId();
    setToasts((current) => [...current, { id, tone: 'default', duration: DEFAULT_DURATION, ...options }]);
    return id;
  }, []);

  const value = React.useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <Toaster toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

interface ToasterProps {
  toasts: readonly ToastRecord[];
  onDismiss: (id: string) => void;
}

function Toaster({ toasts, onDismiss }: ToasterProps) {
  return (
    <div
      role="region"
      aria-label="Notificaciones"
      className="pointer-events-none fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2"
    >
      {toasts.map((item) => (
        <ToastItem key={item.id} toastItem={item} onDismiss={onDismiss} />
      ))}
    </div>
  );
}

function ToastItem({ toastItem, onDismiss }: { toastItem: ToastRecord; onDismiss: (id: string) => void }) {
  const { id, title, description, tone = 'default', duration = DEFAULT_DURATION } = toastItem;
  const Icon = TONE_ICON[tone];

  React.useEffect(() => {
    if (duration <= 0) return;
    const timer = setTimeout(() => onDismiss(id), duration);
    return () => clearTimeout(timer);
  }, [id, duration, onDismiss]);

  return (
    <div
      role={tone === 'danger' || tone === 'warning' ? 'alert' : 'status'}
      aria-live={tone === 'danger' ? 'assertive' : 'polite'}
      className={cn(
        'pointer-events-auto flex items-start gap-2 rounded-(--radius-md) border p-3 text-(--text-sm) shadow-(--shadow-md)',
        TONE_CLASS[tone],
      )}
    >
      {Icon ? <Icon aria-hidden={true} className="mt-0.5 h-4 w-4 shrink-0" /> : null}
      <div className="flex flex-1 flex-col gap-0.5">
        {title ? <p className="font-medium">{title}</p> : null}
        {description ? <p>{description}</p> : null}
      </div>
      <button
        type="button"
        aria-label="Descartar notificación"
        onClick={() => onDismiss(id)}
        className="rounded-(--radius-sm) p-0.5 hover:bg-black/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}

export { Toaster };
