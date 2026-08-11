import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Guard de nivel 1 de 3 (FRONTEND_PLAN §4). Sólo mira si existe la cookie de
 * sesión (`pulso_at`, httpOnly — igual legible por el servidor, sólo oculta a
 * JS). NO decide permisos ni valida el JWT: eso lo hace el backend en cada
 * request. Si la cookie expiró pero el refresh todavía es válido, el cliente
 * HTTP se encarga de refrescar; acá sólo se evita renderizar una pantalla
 * protegida sin ningún indicio de sesión.
 */
const SESSION_COOKIE = 'pulso_at';
const PUBLIC_PATHS = ['/login'];

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  const isPublicPath = PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
  const hasSessionCookie = request.cookies.has(SESSION_COOKIE);

  if (!hasSessionCookie && !isPublicPath) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.search = '';
    loginUrl.searchParams.set('returnTo', pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (hasSessionCookie && isPublicPath) {
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = '/dashboard';
    homeUrl.search = '';
    return NextResponse.redirect(homeUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
