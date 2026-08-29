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

export interface ExtractedTemplate {
  template: Buffer;
  quality: number;
}

export interface BiometricMatcher {
  extract(image: Buffer): Promise<ExtractedTemplate>;
  match(probe: Buffer, candidates: readonly MatchCandidate[]): Promise<MatchScore[]>;
}

/** Token de DI: permite swappear el matcher sin tocar el service. */
export const BIOMETRIC_MATCHER = Symbol('BIOMETRIC_MATCHER');

export class TemplateEqualityMatcher implements BiometricMatcher {
  async extract(image: Buffer): Promise<ExtractedTemplate> {
    return Promise.resolve({ template: Buffer.from(image), quality: 100 });
  }

  async match(probe: Buffer, candidates: readonly MatchCandidate[]): Promise<MatchScore[]> {
    return Promise.resolve(
      candidates.map((candidate) => ({
        credentialId: candidate.credentialId,
        memberId: candidate.memberId,
        score:
          candidate.template.length === probe.length && timingSafeEqual(candidate.template, probe)
            ? 100
            : 0,
      })),
    );
  }
}

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

/** Calls the isolated .NET SourceAFIS process. Templates never leave the private backend network. */
export class HttpSourceAfisMatcher implements BiometricMatcher {
  private readonly matchEndpoint: string;
  private readonly extractEndpoint: string;

  constructor(
    baseUrl: string,
    private readonly token: string,
    private readonly fetcher: Fetcher = fetch,
  ) {
    const root = baseUrl.replace(/\/$/, '');
    this.matchEndpoint = `${root}/match`;
    this.extractEndpoint = `${root}/extract`;
  }

  async extract(image: Buffer): Promise<ExtractedTemplate> {
    const response = await this.fetcher(this.extractEndpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ image: image.toString('base64') }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) {
      throw new Error(`El extractor biométrico devolvió HTTP ${response.status}.`);
    }
    const body: unknown = await response.json();
    if (!isExtractResponse(body)) {
      throw new Error('El extractor biométrico devolvió una respuesta inválida.');
    }
    return { template: Buffer.from(body.template, 'base64'), quality: body.quality };
  }

  async match(probe: Buffer, candidates: readonly MatchCandidate[]): Promise<MatchScore[]> {
    if (candidates.length === 0) return [];
    const response = await this.fetcher(this.matchEndpoint, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        probe: probe.toString('base64'),
        candidates: candidates.map((candidate) => ({
          credentialId: candidate.credentialId,
          memberId: candidate.memberId,
          template: candidate.template.toString('base64'),
        })),
      }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) {
      throw new Error(`El matcher biométrico devolvió HTTP ${response.status}.`);
    }

    const body: unknown = await response.json();
    if (!isMatcherResponse(body)) {
      throw new Error('El matcher biométrico devolvió una respuesta inválida.');
    }

    const expected = new Map(
      candidates.map((candidate) => [candidate.credentialId, candidate.memberId]),
    );
    if (body.scores.some((score) => expected.get(score.credentialId) !== score.memberId)) {
      throw new Error('El matcher biométrico devolvió candidatos desconocidos.');
    }
    return body.scores;
  }
}

function isExtractResponse(value: unknown): value is { template: string; quality: number } {
  if (!value || typeof value !== 'object') return false;
  const result = value as { template?: unknown; quality?: unknown };
  return (
    typeof result.template === 'string' &&
    result.template.length > 0 &&
    typeof result.quality === 'number' &&
    Number.isInteger(result.quality) &&
    result.quality >= 0 &&
    result.quality <= 100
  );
}

function isMatcherResponse(value: unknown): value is { scores: MatchScore[] } {
  if (!value || typeof value !== 'object' || !Array.isArray((value as { scores?: unknown }).scores))
    return false;
  return (value as { scores: unknown[] }).scores.every(
    (score) =>
      !!score &&
      typeof score === 'object' &&
      typeof (score as MatchScore).credentialId === 'string' &&
      typeof (score as MatchScore).memberId === 'string' &&
      typeof (score as MatchScore).score === 'number' &&
      Number.isFinite((score as MatchScore).score) &&
      (score as MatchScore).score >= 0 &&
      (score as MatchScore).score <= 100,
  );
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
