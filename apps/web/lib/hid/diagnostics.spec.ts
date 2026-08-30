import { describe, expect, it } from 'vitest';
import { HidDiagnostics, sanitizeDiagnosticData } from './diagnostics';

describe('HidDiagnostics', () => {
  it('sanitiza claves biométricas y strings largos antes de guardar', () => {
    const png = 'A'.repeat(600);
    const clean = sanitizeDiagnosticData({
      pngBase64: png,
      samples: [png],
      template: png,
      nested: { image: png, ok: 'corto', long: 'B'.repeat(300) },
      count: 3,
    });
    expect(clean).toEqual({
      pngBase64: '[omitido]',
      samples: '[omitido]',
      template: '[omitido]',
      nested: { image: '[omitido]', ok: 'corto', long: '[string de 300 caracteres omitido]' },
      count: 3,
    });
  });

  it('mantiene un buffer acotado y exporta texto y JSON sin biometría', () => {
    const diagnostics = new HidDiagnostics({ limit: 3 });
    diagnostics.record('info', 'a', 'uno');
    diagnostics.record('info', 'b', 'dos', { pngBase64: 'x'.repeat(500) });
    diagnostics.record('warn', 'c', 'tres');
    diagnostics.record('error', 'd', 'cuatro', { errorCode: 5 });

    const entries = diagnostics.entries();
    expect(entries.map((e) => e.type)).toEqual(['b', 'c', 'd']);
    expect(entries[0]?.data).toEqual({ pngBase64: '[omitido]' });

    const report = diagnostics.buildReport();
    expect(report.entries).toHaveLength(3);
    expect(report.environment.fingerprintSdkVersion).toBe('1.0.0');
    const text = diagnostics.toText();
    expect(text).toContain('cuatro');
    expect(text).toContain('errorCode');
    expect(text).not.toContain('xxxxx');
  });

  it('notifica a los suscriptores en cada entrada', () => {
    const diagnostics = new HidDiagnostics();
    const seen: string[] = [];
    const unsubscribe = diagnostics.subscribe((entry) => seen.push(entry.type));
    diagnostics.record('info', 'x', 'm');
    unsubscribe();
    diagnostics.record('info', 'y', 'm');
    expect(seen).toEqual(['x']);
  });
});
