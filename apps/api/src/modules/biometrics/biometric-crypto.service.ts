import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { BiometricCredential as DbBiometricCredential } from '@pulso/db';
// Imports de VALOR: dependencias del constructor (ver infra/redis/redis.service.ts).
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- ver nota arriba
import { PrismaService } from '../../infra/prisma/prisma.service.js';
// eslint-disable-next-line @typescript-eslint/consistent-type-imports -- ver nota arriba
import { AppConfig } from '../../common/config/app-config.js';

const NONCE_LENGTH = 12;
const TAG_LENGTH = 16;

/** nonce(12) || authTag(16) || ciphertext — el formato de toda pieza envuelta. */
function seal(key: Buffer, plaintext: Buffer, aad: Buffer): Buffer {
  const nonce = randomBytes(NONCE_LENGTH);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  cipher.setAAD(aad);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return Buffer.concat([nonce, cipher.getAuthTag(), ciphertext]);
}

/** Lanza si el blob fue manipulado o el AAD no coincide (GCM auth failure). */
function open(key: Buffer, blob: Buffer, aad: Buffer): Buffer {
  const nonce = blob.subarray(0, NONCE_LENGTH);
  const tag = blob.subarray(NONCE_LENGTH, NONCE_LENGTH + TAG_LENGTH);
  const ciphertext = blob.subarray(NONCE_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv('aes-256-gcm', key, nonce);
  decipher.setAAD(aad);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export interface EncryptedTemplate {
  templateCiphertext: Buffer;
  templateNonce: Buffer;
  templateAuthTag: Buffer;
  dekWrapped: Buffer;
  keyVersion: number;
}

/**
 * Envelope encryption de templates (BIOMETRIC_SECURITY.md §4):
 *
 *   MASTER_KEK (env) → envuelve KEK_tenant (TenantBiometricKey, una por gym)
 *   → envuelve DEK (una por credencial) → cifra el template (AES-256-GCM).
 *
 * El AAD del template es `gymId || credentialId || keyVersion`: un ciphertext
 * copiado a otro gimnasio falla la verificación de autenticidad y NO se
 * descifra — defensa concreta contra cross-tenant a nivel de base.
 * El descifrado ocurre sólo en memoria, durante una identificación.
 */
@Injectable()
export class BiometricCryptoService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
  ) {}

  private masterKey(): Buffer {
    const raw = this.config.env.MASTER_KEK;
    if (!raw) {
      throw new Error('MASTER_KEK no está configurada. La biometría no puede operar sin ella.');
    }
    // Normaliza cualquier largo de secreto a una clave AES-256 uniforme.
    return createHash('sha256').update(raw).digest();
  }

  static templateHash(template: Buffer): Buffer {
    return createHash('sha256').update(template).digest();
  }

  static templateAad(gymId: string, credentialId: string, keyVersion: number): Buffer {
    return Buffer.from(`${gymId}||${credentialId}||${keyVersion}`, 'utf8');
  }

  private kekAad(gymId: string, keyVersion: number): Buffer {
    return Buffer.from(`${gymId}||${keyVersion}`, 'utf8');
  }

  /** KEK vigente del tenant; la crea (v1) en el primer uso. */
  private async tenantKek(gymId: string): Promise<{ kek: Buffer; keyVersion: number }> {
    const row = await this.prisma.client.tenantBiometricKey.findFirst({
      where: { gymId },
      orderBy: { keyVersion: 'desc' },
    });
    if (row) {
      return { kek: open(this.masterKey(), Buffer.from(row.kekWrapped), this.kekAad(gymId, row.keyVersion)), keyVersion: row.keyVersion };
    }
    const kek = randomBytes(32);
    const keyVersion = 1;
    await this.prisma.client.tenantBiometricKey.create({
      data: {
        gymId,
        keyVersion,
        kekWrapped: new Uint8Array(seal(this.masterKey(), kek, this.kekAad(gymId, keyVersion))),
      },
    });
    return { kek, keyVersion };
  }

  private async tenantKekVersion(gymId: string, keyVersion: number): Promise<Buffer> {
    const row = await this.prisma.client.tenantBiometricKey.findFirst({
      where: { gymId, keyVersion },
    });
    if (!row) {
      throw new Error(`No existe la KEK v${keyVersion} del tenant. ¿Rotación incompleta?`);
    }
    return open(this.masterKey(), Buffer.from(row.kekWrapped), this.kekAad(gymId, keyVersion));
  }

  async encryptTemplate(gymId: string, credentialId: string, template: Buffer): Promise<EncryptedTemplate> {
    const { kek, keyVersion } = await this.tenantKek(gymId);
    const aad = BiometricCryptoService.templateAad(gymId, credentialId, keyVersion);

    const dek = randomBytes(32);
    const nonce = randomBytes(NONCE_LENGTH);
    const cipher = createCipheriv('aes-256-gcm', dek, nonce);
    cipher.setAAD(aad);
    const ciphertext = Buffer.concat([cipher.update(template), cipher.final()]);

    return {
      templateCiphertext: ciphertext,
      templateNonce: nonce,
      templateAuthTag: cipher.getAuthTag(),
      dekWrapped: seal(kek, dek, aad),
      keyVersion,
    };
  }

  /** Lanza si el ciphertext no corresponde a este gym/credencial (AAD). */
  async decryptTemplate(credential: Pick<DbBiometricCredential, 'id' | 'gymId' | 'keyVersion' | 'templateCiphertext' | 'templateNonce' | 'templateAuthTag' | 'dekWrapped'>): Promise<Buffer> {
    const kek = await this.tenantKekVersion(credential.gymId, credential.keyVersion);
    const aad = BiometricCryptoService.templateAad(credential.gymId, credential.id, credential.keyVersion);

    const dek = open(kek, Buffer.from(credential.dekWrapped), aad);
    const decipher = createDecipheriv('aes-256-gcm', dek, Buffer.from(credential.templateNonce));
    decipher.setAAD(aad);
    decipher.setAuthTag(Buffer.from(credential.templateAuthTag));
    return Buffer.concat([decipher.update(Buffer.from(credential.templateCiphertext)), decipher.final()]);
  }
}
