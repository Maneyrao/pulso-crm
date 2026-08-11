import type { Metadata } from 'next';
import { ToastProvider } from '@pulso/ui';
import { QueryProvider } from '@/lib/query/provider';
import './globals.css';

export const metadata: Metadata = {
  title: 'Pulso CRM',
  description: 'Gestión operativa de gimnasios',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>
        <QueryProvider>
          <ToastProvider>{children}</ToastProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
