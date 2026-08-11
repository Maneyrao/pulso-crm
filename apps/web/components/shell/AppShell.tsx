'use client';

import { Spinner } from '@pulso/ui';
import { useBootstrapSession } from '@/lib/hooks/useSession';
import { Header } from './Header';
import { Sidebar } from './Sidebar';

/**
 * Sidebar + header + guards del área autenticada. La verificación fuerte de
 * sesión (guard nivel 1) ya la hizo `middleware.ts`; acá se trae `GET
 * /auth/me` para poblar permisos y features, y si esa llamada falla se asume
 * sesión inválida (el 401 ya intentó un refresh en el cliente HTTP).
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const session = useBootstrapSession();

  if (session.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-(--color-bg)">
        <Spinner size="lg" aria-label="Cargando sesión" />
      </div>
    );
  }

  if (session.isError) {
    // El middleware ya debería haber redirigido; esto cubre el caso de una
    // cookie presente pero inválida (revocada, gimnasio suspendido, etc.).
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
    return null;
  }

  return (
    <div className="flex min-h-screen bg-(--color-bg)">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <Header />
        <main className="flex-1 overflow-y-auto p-6">{children}</main>
      </div>
    </div>
  );
}
