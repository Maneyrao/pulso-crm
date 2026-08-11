'use client';

import { Button, ErrorState } from '@pulso/ui';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-(--color-bg) p-6">
      <div className="w-full max-w-md">
        <ErrorState
          title="Algo salió mal"
          description={error.digest ? `Referencia: ${error.digest}` : 'Probá recargar la página.'}
        />
        <div className="mt-4 flex justify-center">
          <Button onClick={reset}>Reintentar</Button>
        </div>
      </div>
    </div>
  );
}
