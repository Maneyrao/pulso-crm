'use client';

import * as React from 'react';
import { usePathname } from 'next/navigation';
import { Drawer, Spinner } from '@pulso/ui';
import { useBootstrapSession } from '@/lib/hooks/useSession';
import { AppFooter } from './AppFooter';
import { Header } from './Header';
import { BrandMark, Sidebar, SidebarAccount, SidebarNav } from './Sidebar';

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
      <Drawer open={drawerOpen} onOpenChange={setDrawerOpen} title="Menú" hideTitle side="left" className="lg:hidden">
        <div className="flex h-14 shrink-0 items-center border-b border-(--color-border)">
          <BrandMark />
        </div>
        <SidebarNav onNavigate={() => setDrawerOpen(false)} />
        <SidebarAccount onNavigate={() => setDrawerOpen(false)} />
      </Drawer>
      <div className="flex min-w-0 flex-1 flex-col">
        <Header onOpenMenu={() => setDrawerOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
        <AppFooter />
      </div>
    </div>
  );
}
