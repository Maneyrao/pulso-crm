import { Suspense } from 'react';
import { BrandLogo } from '@/components/brand/BrandLogo';
import { LoginForm } from '@/components/auth/LoginForm';

export default function LoginPage() {
  return (
    <div className="grid min-h-screen grid-cols-1 md:grid-cols-2">
      <div className="hidden flex-col items-center justify-center border-r-2 border-(--color-border) bg-[#080705] p-10 text-center md:flex">
        <BrandLogo size={360} priority className="h-auto w-full max-w-[360px]" />
        <div className="mt-8 max-w-sm border-t border-[#4b4032] pt-6">
          <p className="text-(--text-xl) font-extrabold uppercase text-[#e2c28c]">El Templo</p>
          <p className="mt-2 text-(--text-base) leading-6 text-[#d2c6b4]">
            Gestión de socios, caja y accesos para que el gimnasio funcione con precisión.
          </p>
        </div>
      </div>
      <div className="flex flex-col items-center justify-center gap-8 bg-(--color-bg) p-6">
        <div className="flex w-full max-w-sm items-center gap-3 md:hidden" aria-label="El Templo">
          <BrandLogo
            size={64}
            priority
            decorative
            className="h-16 w-16 border border-(--color-border-strong)"
          />
          <div>
            <p className="text-(--text-lg) font-extrabold uppercase text-(--color-primary)">
              El Templo
            </p>
            <p className="text-(--text-xs) text-(--color-muted)">Gestión del gimnasio</p>
          </div>
        </div>
        <div className="flex w-full max-w-sm flex-col gap-6">
          <div>
            <p className="mb-2 text-(--text-xs) font-bold uppercase text-(--color-primary)">
              El Templo CRM
            </p>
            <h1 className="text-(--text-2xl) font-extrabold text-(--color-text)">Iniciar sesión</h1>
            <p className="mt-1 text-(--text-sm) text-(--color-muted)">
              Ingresá con tu email y contraseña.
            </p>
          </div>
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
