'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import { Drawer, Spinner } from '@pulso/ui';
import { useBootstrapSession } from '@/lib/hooks/useSession';
import { AppFooter } from './AppFooter';
import { Header } from './Header';
import { BrandMark, Sidebar, SidebarNav } from './Sidebar';

/**
 * Sidebar + header + guards del área autenticada. La verificación fuerte de
 * sesión (guard nivel 1) ya la hizo `middleware.ts`; acá se trae `GET
 * /auth/me` para poblar permisos y features, y si esa llamada falla se asume
 * sesión inválida (el 401 ya intentó un refresh en el cliente HTTP).
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const session = useBootstrapSession();
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = React.useState(false);

  // Cambio de ruta = navegación exitosa: el drawer no debe quedar abierto.
  React.useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

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
      {/* El drawer mobile replica el sidebar: siempre oscuro, en ambos temas
          (LEODARROSAFIT_ALIGNMENT_PLAN.md §2). Sobreescribe los tokens de
          superficie/texto/borde localmente en vez de hardcodear cada clase
          del Drawer genérico, así el componente sigue siendo theme-aware
          para cualquier otro consumidor futuro. */}
      <Drawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        title="Menú"
        hideTitle
        side="left"
        className="[--color-border:#302a22] [--color-muted:#a79c8c] [--color-surface:#0b0a08] [--color-text:#f2ece1] lg:hidden"
      >
        <div className="flex min-h-[34px] shrink-0 items-center border-b-2 border-[#302a22] px-3.5 py-3">
          <BrandMark />
        </div>
        <SidebarNav onNavigate={() => setDrawerOpen(false)} />
      </Drawer>
      <div className="flex min-w-0 flex-1 flex-col">
        <Header onOpenMenu={() => setDrawerOpen(true)} />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1440px] p-5">{children}</div>
        </main>
        <AppFooter />
      </div>
    </div>
  );
}
