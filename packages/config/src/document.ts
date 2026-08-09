/**
 * Documentos de identidad (ADR-018).
 *
 * Se normaliza antes de guardar y antes de comparar: "20.123.456" y "20123456"
 * son la misma persona, y el unique de la base sólo funciona si los dos llegan
 * escritos igual.
 */

export const DOCUMENT_TYPES = ['DNI', 'CUIT', 'CUIL', 'PASSPORT', 'LC', 'LE', 'CI'] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

/** Quita puntos, espacios, guiones y pasa a mayúsculas. */
export function normalizeDocument(value: string): string {
  return value.replace(/[\s.\-/]/g, '').toUpperCase();
}

const RULES: Record<DocumentType, { re: RegExp; hint: string }> = {
  DNI: { re: /^\d{7,8}$/, hint: '7 u 8 dígitos' },
  CUIT: { re: /^\d{11}$/, hint: '11 dígitos' },
  CUIL: { re: /^\d{11}$/, hint: '11 dígitos' },
  PASSPORT: { re: /^[A-Z0-9]{5,15}$/, hint: 'entre 5 y 15 letras o números' },
  LC: { re: /^\d{6,8}$/, hint: 'entre 6 y 8 dígitos' },
  LE: { re: /^\d{6,8}$/, hint: 'entre 6 y 8 dígitos' },
  CI: { re: /^[A-Z0-9]{5,12}$/, hint: 'entre 5 y 12 letras o números' },
};

export function isValidDocument(type: DocumentType, value: string): boolean {
  return RULES[type].re.test(normalizeDocument(value));
}

export function documentHint(type: DocumentType): string {
  return RULES[type].hint;
}

/** Dígito verificador de CUIT/CUIL. */
export function isValidCuit(value: string): boolean {
  const d = normalizeDocument(value);
  if (!/^\d{11}$/.test(d)) return false;
  const weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
  const sum = weights.reduce((acc, w, i) => acc + w * Number(d[i]), 0);
  const mod = 11 - (sum % 11);
  const check = mod === 11 ? 0 : mod === 10 ? 9 : mod;
  return check === Number(d[10]);
}

/**
 * Enmascarado por defecto (ADR-018): deja visibles los últimos 3 caracteres.
 * "20123456" -> "•••••456"
 */
export function maskDocument(value: string): string {
  const d = normalizeDocument(value);
  if (d.length <= 3) return '•'.repeat(d.length);
  return '•'.repeat(d.length - 3) + d.slice(-3);
}
