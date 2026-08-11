import { Injectable } from '@nestjs/common';
import type { PrismaClient } from '@pulso/db';
// Imports de VALOR: dependencias del constructor (ver infra/redis/redis.service.ts).
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- ver nota arriba
import { PrismaService } from '../../infra/prisma/prisma.service.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- ver nota arriba
import { PasswordService } from '../../common/auth/password.service.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- ver nota arriba
import { TokenService } from '../../common/auth/token.service.js';
import { AppError } from '../../common/errors/app-error.js';
import { ErrorCode } from '../../common/errors/error-codes.js';
import { getLogger } from '../../common/logging/logger.js';

/** Umbral de bloqueo por intentos fallidos (SECURITY_MODEL §3). */
const MAX_FAILED_ATTEMPTS = 10;
const LOCK_DURATION_MS = 15 * 60 * 1000;

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
  csrfToken: string;
  refreshExpiresAt: Date;
}

export interface AuthenticatedSession extends SessionTokens {
  user: {
    id: string;
    gymId: string;
    email: string;
    firstName: string;
    lastName: string;
    mustChangePassword: boolean;
  };
  gym: {
    id: string;
    slug: string;
    name: string;
    currency: string;
    locale: string;
    features: string[];
  };
  branches: { id: string; name: string; timezone: string }[];
  activeBranchId: string | null;
  permissions: string[];
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: TokenService,
  ) {}

  /**
   * Login.
   *
   * Antes de tener sesión no hay contexto de tenant, así que necesariamente se
   * usa el cliente sin filtro. Es uno de los cuatro usos declarados en la
   * allowlist de PrismaService.
   */
  async login(input: {
    email: string;
    password: string;
    gymSlug?: string;
    userAgent?: string;
    ipAddress?: string;
  }): Promise<AuthenticatedSession> {
    const db = this.prisma.unscoped('login');

    const user = await db.user.findFirst({
      where: {
        email: input.email,
        deletedAt: null,
        ...(input.gymSlug ? { gym: { slug: input.gymSlug } } : {}),
      },
      include: {
        gym: true,
        roleAssignments: { include: { role: true } },
        branchAccess: { include: { branch: true } },
      },
    });

    if (!user) {
      // Se consume el mismo tiempo que una verificación real para que no se
      // pueda enumerar qué emails existen midiendo la respuesta.
      await this.passwords.verifyDummy(input.password);
      throw AppError.unauthorized(
        ErrorCode.INVALID_CREDENTIALS,
        'Email o contraseña incorrectos.',
      );
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw AppError.unauthorized(
        ErrorCode.ACCOUNT_LOCKED,
        'La cuenta está bloqueada temporalmente por intentos fallidos. Probá en unos minutos.',
      );
    }

    const valid = await this.passwords.verify(user.passwordHash, input.password);
    if (!valid) {
      await this.registerFailedAttempt(db, user.id, user.failedLoginCount);
      throw AppError.unauthorized(
        ErrorCode.INVALID_CREDENTIALS,
        'Email o contraseña incorrectos.',
      );
    }

    // El orden importa: primero la contraseña, después el estado. Si se
    // chequeara el estado antes, un atacante sabría que la cuenta existe.
    if (user.status !== 'ACTIVE') {
      throw AppError.unauthorized(
        ErrorCode.ACCOUNT_INACTIVE,
        'Tu usuario está desactivado. Hablá con el administrador del gimnasio.',
      );
    }
    if (user.gym.status !== 'ACTIVE') {
      throw AppError.unauthorized(
        ErrorCode.GYM_SUSPENDED,
        'El gimnasio está suspendido. Contactá a soporte.',
      );
    }

    await db.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
    });

    return this.issueSession(db, user.id, {
      userAgent: input.userAgent,
      ipAddress: input.ipAddress,
    });
  }

  private async registerFailedAttempt(
    db: PrismaClient,
    userId: string,
    current: number,
  ): Promise<void> {
    const next = current + 1;
    await db.user.update({
      where: { id: userId },
      data: {
        failedLoginCount: next,
        ...(next >= MAX_FAILED_ATTEMPTS
          ? { lockedUntil: new Date(Date.now() + LOCK_DURATION_MS) }
          : {}),
      },
    });
  }

  /** Arma una sesión nueva: familia de refresh, tokens y datos de contexto. */
  private async issueSession(
    db: PrismaClient,
    userId: string,
    meta: { userAgent?: string; ipAddress?: string; familyId?: string },
  ): Promise<AuthenticatedSession> {
    const user = await db.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        gym: { include: { saasPlan: true, featureOverrides: true } },
        roleAssignments: { include: { role: true } },
        branchAccess: { include: { branch: true } },
      },
    });

    const branches = user.branchAccess
      .map((a) => a.branch)
      .filter((b) => b.isActive && !b.deletedAt)
      .map((b) => ({ id: b.id, name: b.name, timezone: b.timezone }));

    const activeBranchId = branches[0]?.id ?? null;
    const permissions = [...new Set(user.roleAssignments.flatMap((a) => a.role.permissions))];
    const features = this.resolveFeatures(user.gym);

    const familyId = meta.familyId ?? this.tokens.newFamilyId();
    const refreshToken = this.tokens.generateRefreshToken();
    const refreshExpiresAt = this.tokens.refreshExpiry();

    await db.refreshToken.create({
      data: {
        gymId: user.gymId,
        userId: user.id,
        tokenHash: this.tokens.hashRefreshToken(refreshToken),
        familyId,
        expiresAt: refreshExpiresAt,
        userAgent: meta.userAgent ?? null,
        ipAddress: meta.ipAddress ?? null,
      },
    });

    const accessToken = await this.tokens.signAccessToken({
      sub: user.id,
      gym: user.gymId,
      branch: activeBranchId,
      sid: familyId,
    });

    return {
      accessToken,
      refreshToken,
      csrfToken: this.tokens.generateCsrfToken(),
      refreshExpiresAt,
      user: {
        id: user.id,
        gymId: user.gymId,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        mustChangePassword: user.mustChangePassword,
      },
      gym: {
        id: user.gym.id,
        slug: user.gym.slug,
        name: user.gym.name,
        currency: user.gym.currency,
        locale: user.gym.locale,
        features,
      },
      branches,
      activeBranchId,
      permissions,
    };
  }

  /** Features del plan, con los overrides por gimnasio aplicados (ADR-022). */
  private resolveFeatures(gym: {
    saasPlan: { features: string[] };
    featureOverrides: { feature: string; enabled: boolean }[];
  }): string[] {
    const set = new Set(gym.saasPlan.features);
    for (const o of gym.featureOverrides) {
      if (o.enabled) set.add(o.feature);
      else set.delete(o.feature);
    }
    return [...set];
  }

  /**
   * Rotación de refresh con detección de reuso.
   *
   * Si llega un token que ya fue rotado, se asume que alguien lo robó: se
   * revoca la familia entera y se obliga a volver a loguearse. Es la diferencia
   * entre "te robaron una sesión" y "te robaron la cuenta".
   */
  async refresh(
    presentedToken: string,
    meta: { userAgent?: string; ipAddress?: string },
  ): Promise<AuthenticatedSession> {
    const db = this.prisma.unscoped('refresh');
    const tokenHash = this.tokens.hashRefreshToken(presentedToken);

    const stored = await db.refreshToken.findUnique({ where: { tokenHash } });

    if (!stored) {
      throw AppError.unauthorized(ErrorCode.REFRESH_TOKEN_INVALID, 'Tu sesión expiró.');
    }

    if (stored.revokedAt) {
      // El token ya se había rotado o revocado: es un replay.
      await this.revokeFamily(db, stored.familyId, 'REUSE_DETECTED');
      await db.auditEvent.create({
        data: {
          gymId: stored.gymId,
          actorUserId: stored.userId,
          actorType: 'SYSTEM',
          action: 'SECURITY_REFRESH_REUSE',
          resourceType: 'RefreshToken',
          resourceId: stored.id,
          after: { familyId: stored.familyId, ipAddress: meta.ipAddress ?? null },
        },
      });
      getLogger().warn(
        { familyId: stored.familyId, userId: stored.userId },
        'Reuso de refresh token: se revocó la familia',
      );
      throw AppError.unauthorized(
        ErrorCode.REFRESH_TOKEN_REUSED,
        'Se detectó un uso indebido de la sesión. Volvé a iniciar sesión.',
      );
    }

    if (stored.expiresAt < new Date()) {
      throw AppError.unauthorized(ErrorCode.SESSION_EXPIRED, 'Tu sesión expiró.');
    }

    const session = await this.issueSession(db, stored.userId, {
      ...meta,
      familyId: stored.familyId,
    });

    const replacement = await db.refreshToken.findUniqueOrThrow({
      where: { tokenHash: this.tokens.hashRefreshToken(session.refreshToken) },
    });

    await db.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date(), revokedReason: 'ROTATED', replacedById: replacement.id },
    });

    return session;
  }

  async logout(presentedToken: string | undefined): Promise<void> {
    if (!presentedToken) return;
    const db = this.prisma.unscoped('refresh');
    const tokenHash = this.tokens.hashRefreshToken(presentedToken);
    const stored = await db.refreshToken.findUnique({ where: { tokenHash } });
    if (!stored) return;
    // Se revoca la familia entera, no sólo este token: cerrar sesión significa
    // cerrarla, no dejar viva la cadena de rotación.
    await this.revokeFamily(db, stored.familyId, 'LOGOUT');
  }

  private async revokeFamily(db: PrismaClient, familyId: string, reason: string): Promise<void> {
    await db.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date(), revokedReason: reason },
    });
  }

  /** Datos de sesión para GET /auth/me, sin emitir tokens nuevos. */
  async describeSession(userId: string, activeBranchId: string | null) {
    const db = this.prisma.unscoped('session');
    const user = await db.user.findUniqueOrThrow({
      where: { id: userId },
      include: {
        gym: { include: { saasPlan: true, featureOverrides: true } },
        roleAssignments: { include: { role: true } },
        branchAccess: { include: { branch: true } },
      },
    });

    const branches = user.branchAccess
      .map((a) => a.branch)
      .filter((b) => b.isActive && !b.deletedAt)
      .map((b) => ({ id: b.id, name: b.name, timezone: b.timezone }));

    return {
      user: {
        id: user.id,
        gymId: user.gymId,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        mustChangePassword: user.mustChangePassword,
      },
      gym: {
        id: user.gym.id,
        slug: user.gym.slug,
        name: user.gym.name,
        currency: user.gym.currency,
        locale: user.gym.locale,
        features: this.resolveFeatures(user.gym),
      },
      branches,
      activeBranchId: activeBranchId ?? branches[0]?.id ?? null,
      roles: user.roleAssignments.map((a) => ({ code: a.role.code, name: a.role.name })),
      permissions: [...new Set(user.roleAssignments.flatMap((a) => a.role.permissions))],
    };
  }

  /** Cambia la sede activa. Valida que pertenezca al usuario. */
  async selectBranch(
    userId: string,
    branchId: string,
    sessionId: string,
  ): Promise<{ accessToken: string }> {
    const db = this.prisma.unscoped('session');
    const access = await db.userBranchAccess.findFirst({
      where: { userId, branchId },
      include: { branch: true, user: true },
    });
    if (!access || !access.branch.isActive || access.branch.deletedAt) {
      throw AppError.notFound('La sede');
    }
    // Se conserva el `sid`: cambiar de sede no crea una sesión nueva, y
    // perder la familia dejaría la sesión sin poder revocarse.
    const accessToken = await this.tokens.signAccessToken({
      sub: userId,
      gym: access.user.gymId,
      branch: branchId,
      sid: sessionId,
    });
    return { accessToken };
  }
}
