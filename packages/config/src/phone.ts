/**
 * Teléfonos en E.164.
 *
 * Se normaliza al guardar porque el proveedor de WhatsApp exige E.164 y porque
 * "11 5555-5555" y "+5491155555555" tienen que deduplicar igual.
 */

export const DEFAULT_COUNTRY_CODE = '54'; // Argentina

const E164_RE = /^\+[1-9]\d{7,14}$/;

export function isE164(value: string): boolean {
  return E164_RE.test(value);
}

/**
 * Normaliza a E.164. Devuelve null si no se puede interpretar con confianza:
 * es preferible rechazar que guardar un número al que después no le llega nada.
 */
export function normalizePhone(
  input: string,
  countryCode: string = DEFAULT_COUNTRY_CODE,
): string | null {
  const raw = input.trim();
  if (!raw) return null;

  const hadPlus = raw.startsWith('+');
  let digits = raw.replace(/\D/g, '');
  if (!digits) return null;

  if (hadPlus) {
    const candidate = `+${digits}`;
    return isE164(candidate) ? candidate : null;
  }

  // 00 como prefijo internacional
  if (digits.startsWith('00')) {
    const candidate = `+${digits.slice(2)}`;
    return isE164(candidate) ? candidate : null;
  }

  if (countryCode === '54') {
    // Formato local argentino: se saca el 0 de larga distancia y el 15 de celular.
    if (digits.startsWith('0')) digits = digits.slice(1);
    if (digits.startsWith('54')) digits = digits.slice(2);
    if (digits.startsWith('9')) digits = digits.slice(1);
    // El 15 va después del código de área (2 a 4 dígitos).
    for (const areaLen of [2, 3, 4]) {
      if (digits.length > areaLen + 2 && digits.slice(areaLen, areaLen + 2) === '15') {
        const withoutFifteen = digits.slice(0, areaLen) + digits.slice(areaLen + 2);
        if (withoutFifteen.length === 10) {
          digits = withoutFifteen;
          break;
        }
      }
    }
    if (digits.length !== 10) return null;
    // El 9 marca celular; es lo que WhatsApp necesita.
    const candidate = `+549${digits}`;
    return isE164(candidate) ? candidate : null;
  }

  const candidate = `+${countryCode}${digits}`;
  return isE164(candidate) ? candidate : null;
}

/** "+5491155555555" -> "+54 9 11 5555-5555" (sólo para mostrar). */
export function formatPhone(e164: string): string {
  if (!isE164(e164)) return e164;
  if (e164.startsWith('+549') && e164.length === 14) {
    const rest = e164.slice(4);
    return `+54 9 ${rest.slice(0, 2)} ${rest.slice(2, 6)}-${rest.slice(6)}`;
  }
  return e164;
}
