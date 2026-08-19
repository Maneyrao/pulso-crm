import type { Metadata } from 'next';
import { ToastProvider } from '@pulso/ui';
import { QueryProvider } from '@/lib/query/provider';
import './globals.css';

export const metadata: Metadata = {
  title: 'Pulso CRM',
  description: 'Gestión operativa de gimnasios',
};

/**
 * Aplica el tema ANTES del primer paint para evitar el destello claro→oscuro.
 * Debe mantenerse en sincronía con components/shell/ThemeToggle.tsx
 * (clave `pulso-theme`, clase `dark` en <html>). Es una constante estática
 * sin input externo; va como children del <script> (React lo escapa) para
 * respetar la prohibición de dangerouslySetInnerHTML (SECURITY_MODEL §6).
 */
const THEME_BOOTSTRAP = `(function(){try{var t=localStorage.getItem('pulso-theme');var d=t==='dark'||(t!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.classList.add('dark');}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body>
        <script>{THEME_BOOTSTRAP}</script>
        <QueryProvider>
          <ToastProvider>{children}</ToastProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
