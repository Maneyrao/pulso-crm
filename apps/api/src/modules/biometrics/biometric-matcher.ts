import { timingSafeEqual } from 'node:crypto';

/**
 * Matcher 1:N pluggable (ADR-014: el matching corre en el backend).
 *
 * El matcher real llega con el SDK de DigitalPersona en la Etapa 8. Hasta
 * entonces, `TemplateEqualityMatcher` compara bytes exactos: alcanza para el
 * FakeSensor del agente (que reenvía el mismo template determinístico) y para
 * los tests de integración; NUNCA sirve para huellas reales, donde dos
 * capturas del mismo dedo producen templates distintos.
 */

export interface MatchCandidate {
  credentialId: string;
  memberId: string;
  template: Buffer;
}

export interface MatchScore {
  credentialId: string;
  memberId: string;
  /** 0-100. */
  score: number;
}

export interface BiometricMatcher {
  match(probe: Buffer, candidates: readonly MatchCandidate[]): MatchScore[];
}

/** Token de DI: permite swappear el matcher sin tocar el service. */
export const BIOMETRIC_MATCHER = Symbol('BIOMETRIC_MATCHER');

export class TemplateEqualityMatcher implements BiometricMatcher {
  match(probe: Buffer, candidates: readonly MatchCandidate[]): MatchScore[] {
    return candidates.map((candidate) => ({
      credentialId: candidate.credentialId,
      memberId: candidate.memberId,
      score:
        candidate.template.length === probe.length && timingSafeEqual(candidate.template, probe)
          ? 100
          : 0,
    }));
  }
}

/**
 * Aplica umbral y regla de ambigüedad (BIOMETRIC_SECURITY.md §5.3): si dos
 * candidatos superan el umbral con scores a menos de `ambiguityMargin`, se
 * devuelve no-match — un match ambiguo es peor que ningún match.
 */
export function resolveMatch(
  scores: readonly MatchScore[],
  threshold: number,
  ambiguityMargin: number,
): { match: MatchScore | null; topScore: number | null } {
  if (scores.length === 0) return { match: null, topScore: null };
  const sorted = [...scores].sort((a, b) => b.score - a.score);
  const top = sorted[0]!;
  if (top.score < threshold) return { match: null, topScore: top.score };
  const second = sorted[1];
  if (
    second &&
    second.score >= threshold &&
    second.memberId !== top.memberId &&
    top.score - second.score <= ambiguityMargin
  ) {
    return { match: null, topScore: top.score };
  }
  return { match: top, topScore: top.score };
}
