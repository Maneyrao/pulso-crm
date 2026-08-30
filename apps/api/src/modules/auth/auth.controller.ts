import { Controller, Get, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import type { CookieOptions, Request, Response } from 'express';
import { z } from 'zod';
// Imports de VALOR: dependencias del constructor (ver infra/redis/redis.service.ts).
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- ver nota arriba
import { AppConfig } from '../../common/config/app-config.js';
import { Public, RequiresPermission, Tenant } from '../../common/auth/decorators.js';
import type { TenantContext } from '../../common/auth/tenant-context.js';
import { ACCESS_COOKIE, CSRF_COOKIE, REFRESH_COOKIE } from '../../common/auth/token.service.js';
import { AppError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { ZodBody } from '../../common/validation/zod.pipe.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- ver nota arriba
import { AuthService, type AuthenticatedSession } from './auth.service.js';

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Ingresá un email válido.'),
  password: z.string().min(1, 'Ingresá tu contraseña.'),
  /** Opcional: desambigua cuando el mismo email existe en varios gimnasios. */
  gymSlug: z.string().trim().min(1).optional(),
});

const selectBranchSchema = z.object({ branchId: z.string().uuid() });

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: AppConfig,
  ) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @ZodBody(loginSchema) body: z.infer<typeof loginSchema>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const session = await this.auth.login({
      email: body.email,
      password: body.password,
      ...(body.gymSlug ? { gymSlug: body.gymSlug } : {}),
      userAgent: req.headers['user-agent'] ?? undefined,
      ipAddress: this.clientIp(req),
    });

    this.setSessionCookies(res, session);
    return this.publicSession(session);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = this.readCookie(req, REFRESH_COOKIE);
    if (!token) {
      throw AppError.unauthorized(ErrorCode.SESSION_EXPIRED, 'Tu sesión expiró.');
    }
    try {
      const session = await this.auth.refresh(token, {
        userAgent: req.headers['user-agent'] ?? undefined,
        ipAddress: this.clientIp(req),
      });
      this.setSessionCookies(res, session);
      return this.publicSession(session);
    } catch (e) {
      // Si el refresh falla, las cookies viejas no sirven para nada: se limpian
      // para que el frontend no reintente en loop.
      this.clearSessionCookies(res);
      throw e;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(this.readCookie(req, REFRESH_COOKIE));
    this.clearSessionCookies(res);
  }

  @RequiresPermission()
  @Get('me')
  async me(@Tenant() ctx: TenantContext) {
    return this.auth.describeSession(ctx.userId, ctx.activeBranchId);
  }

  @RequiresPermission()
  @Post('select-branch')
  @HttpCode(HttpStatus.OK)
  async selectBranch(
    @ZodBody(selectBranchSchema) body: z.infer<typeof selectBranchSchema>,
    @Tenant() ctx: TenantContext,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken } = await this.auth.selectBranch(ctx.userId, body.branchId, ctx.gymId);
    res.cookie(ACCESS_COOKIE, accessToken, this.cookieOptions(this.config.env.ACCESS_TOKEN_TTL));
    return { activeBranchId: body.branchId };
  }

  // ── helpers ───────────────────────────────────────────────────────────────

  /** Lo que el cliente puede ver. El token NUNCA va en el cuerpo (ADR-007). */
  private publicSession(session: AuthenticatedSession) {
    return {
      user: session.user,
      gym: session.gym,
      branches: session.branches,
      activeBranchId: session.activeBranchId,
      permissions: session.permissions,
    };
  }

  private cookieOptions(maxAgeSeconds: number, path = '/'): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.isProduction,
      sameSite: 'lax',
      path,
      maxAge: maxAgeSeconds * 1000,
      ...(this.config.env.COOKIE_DOMAIN !== 'localhost'
        ? { domain: this.config.env.COOKIE_DOMAIN }
        : {}),
    };
  }

  private setSessionCookies(res: Response, session: AuthenticatedSession): void {
    res.cookie(
      ACCESS_COOKIE,
      session.accessToken,
      this.cookieOptions(this.config.env.ACCESS_TOKEN_TTL),
    );

    // El refresh se acota a la ruta que lo usa: si hubiera un XSS en otra parte
    // de la aplicación, el navegador ni siquiera lo adjunta.
    res.cookie(
      REFRESH_COOKIE,
      session.refreshToken,
      this.cookieOptions(this.config.env.REFRESH_TOKEN_TTL, '/api/v1/auth'),
    );

    // El token CSRF sí es legible por JS: es la mitad del double-submit.
    res.cookie(CSRF_COOKIE, session.csrfToken, {
      ...this.cookieOptions(this.config.env.REFRESH_TOKEN_TTL),
      httpOnly: false,
    });
  }

  private clearSessionCookies(res: Response): void {
    res.clearCookie(ACCESS_COOKIE, { path: '/' });
    res.clearCookie(REFRESH_COOKIE, { path: '/api/v1/auth' });
    res.clearCookie(CSRF_COOKIE, { path: '/' });
  }

  private readCookie(req: Request, name: string): string | undefined {
    return (req as Request & { cookies?: Record<string, string> }).cookies?.[name];
  }

  private clientIp(req: Request): string | undefined {
    // `trust proxy` está configurado en main.ts, así que req.ip ya resuelve
    // el X-Forwarded-For del proxy de confianza.
    return req.ip;
  }
}
