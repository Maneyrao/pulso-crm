'use client';

import * as React from 'react';
import { X } from 'lucide-react';
import type { AccessCheckResponse } from '@pulso/contracts/access';
import { AccessResultCard } from './AccessResultCard';
import { playAccessTone } from './access-feedback';
import { ACCESS_REASON_CONFIG } from './reason-config';

const RESULT_VISIBLE_MS = 7_000;

const OVERLAY_TONE: Record<string, string> = {
  success: 'bg-[#071b0c]/95',
  info: 'bg-[#0b1724]/95',
  warning: 'bg-[#261904]/95',
  danger: 'bg-[#240b08]/95',
  neutral: 'bg-[#0b0a08]/95',
};

export function AccessResultOverlay({
  result,
  onDismiss,
}: {
  result: AccessCheckResponse;
  onDismiss: () => void;
}) {
  const config = ACCESS_REASON_CONFIG[result.reasonCode];

  React.useEffect(() => {
    playAccessTone(result.decision);
    const timer = window.setTimeout(onDismiss, RESULT_VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [onDismiss, result.accessAttemptId, result.decision]);

  React.useEffect(() => {
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onDismiss();
    };
    window.addEventListener('keydown', dismissOnEscape);
    return () => window.removeEventListener('keydown', dismissOnEscape);
  }, [onDismiss]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={config.title}
      className={`fixed inset-0 z-[80] flex items-center justify-center p-4 motion-safe:animate-(--animate-fade-in) sm:p-8 ${OVERLAY_TONE[config.tone]}`}
    >
      <button
        type="button"
        aria-label="Cerrar resultado"
        title="Cerrar resultado"
        onClick={onDismiss}
        className="absolute right-4 top-4 flex h-11 w-11 items-center justify-center border-2 border-white/40 text-white transition-colors hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:right-8 sm:top-8"
      >
        <X className="h-6 w-6" aria-hidden={true} />
      </button>

      <div className="w-full max-w-3xl motion-safe:animate-(--animate-lf-scale-in)">
        <AccessResultCard result={result} />
        <p className="mt-4 text-center text-(--text-sm) font-medium text-white/75">
          Esta información se ocultará automáticamente.
        </p>
      </div>
    </div>
  );
}
