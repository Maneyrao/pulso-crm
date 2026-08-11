import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { SignJWT, jwtVerify } from 'jose';
import { type AppConfig } from '../config/app-config.js';

/**
 * Emisión y verificación de tokens (ADR-007).
 *
 * El access token es un JWT corto que viaja en cookie httpOnly. El refresh es
 * un valor opaco aleatorio: sólo se guarda su SHA-256 en la base, así una
 * copia de la tabla no permite emitir sesiones.
 */

export interface AccessTokenClaims {
  sub: string; // userId
  gym: string; // gymId
  branch: string | null; // sede activa
  sid: string; // familia de refresh, para poder revocar la sesión entera
}

export const ACCESS_COOKIE = 'pulso_at';
export const REFRESH_COOKIE = 'pulso_rt';
export const CSRF_COOKIE = 'pulso_csrf';

@Injectable()
export class TokenService {
  private readonly secret: Uint8Array;

  constructor(private readonly config: AppConfig) {
    this.secret = new TextEncoder().encode(this.config.env.JWT_SECRET);
  }

  async signAccessToken(claims: AccessTokenClaims): Promise<string> {
    return new SignJWT({ gym: claims.gym, branch: claims.branch, sid: claims.sid })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(claims.sub)
      .setIssuedAt()
      .setIssuer('pulso')
      .setAudience('pulso-web')
      .setExpirationTime(`${this.config.env.ACCESS_TOKEN_TTL}s`)
      .sign(this.secret);
  }

  async verifyAccessToken(token: string): Promise<AccessTokenClaims | null> {
    try {
      const { payload } = await jwtVerify(token, this.secret, {
        issuer: 'pulso',
        audience: 'pulso-web',
      });
      if (typeof payload.sub !== 'string' || typeof payload['gym'] !== 'string') return null;
      return {
        sub: payload.sub,
        gym: payload['gym'] as string,
        branch: (payload['branch'] as string | null) ?? null,
        sid: (payload['sid'] as string) ?? '',
      };
    } catch {
      return null;
    }
  }

  /** Valor opaco de 256 bits. Se devuelve al cliente una sola vez. */
  generateRefreshToken(): string {
    return randomBytes(32).toString('base64url');
  }

  /** Lo único que se persiste del refresh token. */
  hashRefreshToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  newFamilyId(): string {
    return randomUUID();
  }

  /** Token CSRF para el patrón double-submit (SECURITY_MODEL §6). */
  generateCsrfToken(): string {
    return randomBytes(24).toString('base64url');
  }

  refreshExpiry(): Date {
    return new Date(Date.now() + this.config.env.REFRESH_TOKEN_TTL * 1000);
  }
}
