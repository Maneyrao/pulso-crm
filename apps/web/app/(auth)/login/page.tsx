import { Suspense } from 'react';
import { LoginForm } from '@/components/auth/LoginForm';

export default function LoginPage() {
  return (
    <div className="grid min-h-screen grid-cols-1 md:grid-cols-2">
      {/* Marca/ilustración: sólo desde `md` (FRONTEND_PLAN §6.1 "responsive"). */}
      <div className="hidden flex-col justify-between bg-(--color-primary) p-10 text-(--color-primary-foreground) md:flex">
        <span className="text-(--text-xl) font-semibold">Pulso</span>
        <p className="max-w-sm text-(--text-lg)">
          El pulso operativo de tu gimnasio: socios, caja y acceso en un solo lugar.
        </p>
      </div>
      <div className="flex flex-col items-center justify-center gap-8 p-6">
        <div className="flex w-full max-w-sm flex-col gap-1 md:hidden">
          <span className="text-(--text-xl) font-semibold text-(--color-text)">Pulso</span>
        </div>
        <div className="flex w-full max-w-sm flex-col gap-6">
          <div>
            <h1 className="text-(--text-2xl) font-semibold text-(--color-text)">Iniciar sesión</h1>
            <p className="text-(--text-sm) text-(--color-muted)">Ingresá con tu email y contraseña.</p>
          </div>
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
