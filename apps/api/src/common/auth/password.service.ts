import { Injectable } from '@nestjs/common';
import argon2 from 'argon2';

/**
 * Hashing de contraseñas (SECURITY_MODEL §2.1).
 *
 * argon2id con el perfil recomendado por OWASP. Los parámetros están acá y no
 * en configuración a propósito: bajarlos "para que ande más rápido" es una
 * decisión de seguridad, no de performance, y debe pasar por revisión de código.
 */
const OPTIONS: argon2.Options = {
  type: argon2.argon2id,
  memoryCost: 19_456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
};

/**
 * Hash de una contraseña que no existe, usado para que el login tarde lo mismo
 * con un email inexistente que con una contraseña incorrecta. Se calcula una
 * vez al arrancar.
 */
let dummyHash: string | null = null;

@Injectable()
export class PasswordService {
  async hash(plain: string): Promise<string> {
    return argon2.hash(plain, OPTIONS);
  }

  async verify(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      // Un hash corrupto o de otro algoritmo no debe distinguirse de una
      // contraseña incorrecta.
      return false;
    }
  }

  /**
   * Consume el mismo tiempo que una verificación real.
   *
   * Se llama cuando el email no existe. Sin esto, medir el tiempo de respuesta
   * permite enumerar qué direcciones están registradas.
   */
  async verifyDummy(plain: string): Promise<false> {
    dummyHash ??= await argon2.hash('contraseña-que-nunca-nadie-usa', OPTIONS);
    await argon2.verify(dummyHash, plain).catch(() => false);
    return false;
  }

  /** Contraseña temporal legible para entregar en el alta de un usuario. */
  generateTemporary(): string {
    // Sin caracteres ambiguos (0/O, 1/l/I): se dicta por teléfono.
    const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    const bytes = new Uint32Array(14);
    crypto.getRandomValues(bytes);
    const body = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
    // Garantiza que cumple la política aunque el azar no coopere.
    return `${body.slice(0, 12)}#${body.slice(12)}9`;
  }
}
