import Link from 'next/link';
import { Button } from '@pulso/ui';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-(--color-bg) p-6 text-center">
      <p className="text-(--text-2xl) font-semibold text-(--color-text)">Página no encontrada</p>
      <p className="text-(--text-sm) text-(--color-muted)">
        La URL a la que intentaste entrar no existe.
      </p>
      <Button asChild>
        <Link href="/dashboard">Volver al inicio</Link>
      </Button>
    </div>
  );
}
