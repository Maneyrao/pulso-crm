import type { Metadata } from 'next';
import { Archivo } from 'next/font/google';
import { ToastProvider } from '@pulso/ui';
import { QueryProvider } from '@/lib/query/provider';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'El Templo CRM',
    template: '%s | El Templo CRM',
  },
  description: 'Gestión de socios, caja y accesos de El Templo',
};

/**
 * Tipografía de marca (LEODARROSAFIT_ALIGNMENT_PLAN.md §1): Archivo,
 * self-hosteada por next/font (sin request externo en runtime). Expone
 * `--font-archivo`, que `packages/ui/src/tokens.css` usa como `--font-sans`.
 */
const archivo = Archivo({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-archivo',
  display: 'swap',
});

/**
 * Aplica el tema ANTES del primer paint para evitar el destello oscuro→claro.
 * Debe mantenerse en sincronía con components/shell/ThemeToggle.tsx (clave
 * `pulso-theme`, clase `light` en <html>). El default de marca es OSCURO: sin
 * preferencia guardada, no se agrega ninguna clase (los tokens de
 * tokens.css ya son oscuros por defecto); sólo `light` guardado explícitamente
 * agrega la clase que sobreescribe a tema claro. Es una constante estática
 * sin input externo; va como children del <script> (React lo escapa) para
 * respetar la prohibición de dangerouslySetInnerHTML (SECURITY_MODEL §6).
 */
const THEME_BOOTSTRAP = `(function(){try{if(localStorage.getItem('pulso-theme')==='light')document.documentElement.classList.add('light');}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning className={archivo.variable}>
      <body>
        <script>{THEME_BOOTSTRAP}</script>
        <QueryProvider>
          <ToastProvider>{children}</ToastProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
