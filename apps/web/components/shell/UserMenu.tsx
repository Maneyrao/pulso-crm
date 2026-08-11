'use client';

import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { LogOut, User } from 'lucide-react';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@pulso/ui';
import { logout } from '@/lib/api/auth';
import { useSessionStore } from '@/lib/stores/session';

export function UserMenu() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useSessionStore((s) => s.user);
  const clearSession = useSessionStore((s) => s.clearSession);

  if (!user) return null;

  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      clearSession();
      queryClient.clear();
      router.push('/login');
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" aria-label="Menú de usuario">
          <User className="h-4 w-4" aria-hidden={true} />
          {user.firstName}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>
          {user.firstName} {user.lastName}
          <p className="font-normal text-(--color-muted)">{user.email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => void handleLogout()}>
          <LogOut className="mr-2 h-4 w-4" aria-hidden={true} />
          Cerrar sesión
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
