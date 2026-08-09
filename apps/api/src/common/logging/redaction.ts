/**
 * Redacción de logs (SECURITY_MODEL §12.2).
 *
 * Funciona por ALLOWLIST de estructura, no por denylist de nombres: una
 * denylist siempre se queda corta cuando alguien agrega un campo nuevo. Acá
 * cualquier clave que coincida con un patrón sensible se reemplaza, en
 * cualquier profundidad, incluyendo dentro de arrays.
 */

const SENSITIVE_KEY_PATTERNS = [
  /pass(word)?/i,
  /secret/i,
  /token/i,
  /cookie/i,
  /authorization/i,
  /api[-_]?key/i,
  /credential/i,
  /^kek$/i,
  /template/i, // templates biométricos
  /ciphertext/i,
  /certificate/i,
  /private[-_]?key/i,
  /document(_?number)?/i,
  /^dni$/i,
  /^cuit$/i,
  /phone/i,
  /^email$/i,
  /card[-_]?code/i,
  /^hash$/i,
];

export const REDACTED = '[redacted]';

const MAX_DEPTH = 8;

function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERNS.some((re) => re.test(key));
}

/**
 * Devuelve una copia con los valores sensibles reemplazados.
 * No muta la entrada: un log no debería tener efectos sobre el dominio.
 */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return '[profundidad máxima]';
  if (value === null || value === undefined) return value;

  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));

  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }

  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = isSensitiveKey(k) ? REDACTED : redact(v, depth + 1);
    }
    return out;
  }

  return value;
}

/** Enmascara un valor conservando los últimos `keep` caracteres. */
export function maskTail(value: string, keep = 3): string {
  if (value.length <= keep) return '•'.repeat(value.length);
  return '•'.repeat(value.length - keep) + value.slice(-keep);
}
