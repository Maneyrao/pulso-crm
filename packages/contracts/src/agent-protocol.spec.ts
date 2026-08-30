import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import {
  AGENT_MESSAGE_TYPES,
  AGENT_PAYLOAD_SCHEMAS,
  parseAgentMessage,
  parseAgentMessageJson,
} from './agent-protocol.js';

/**
 * Lado TypeScript del mecanismo de sincronización de WEBSOCKET_PROTOCOL.md
 * §11: `docs/biometrics/protocol-fixtures/*.json` — un archivo por tipo de
 * mensaje con { valid: [...], invalid: [...] } — se valida acá con Zod y en
 * `Pulso.Agent.Protocol.Tests` (C#) con System.Text.Json. Un cambio que rompa
 * un solo lado lo detecta la suite del otro.
 */

const FIXTURES_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../docs/biometrics/protocol-fixtures',
);

interface FixtureFile {
  valid?: unknown[];
  invalid?: Array<Record<string, unknown>>;
}

const fixtureFiles = readdirSync(FIXTURES_DIR)
  .filter((f) => f.endsWith('.json'))
  .sort();

function loadFixture(file: string): FixtureFile {
  return JSON.parse(readFileSync(path.join(FIXTURES_DIR, file), 'utf-8')) as FixtureFile;
}

describe('agent-protocol fixtures compartidas', () => {
  it('hay un archivo de fixtures por cada tipo de mensaje del catálogo', () => {
    const names = new Set(fixtureFiles.map((f) => f.replace(/\.json$/, '')));
    for (const type of AGENT_MESSAGE_TYPES) {
      expect(names, `Falta docs/biometrics/protocol-fixtures/${type}.json`).toContain(type);
    }
  });

  for (const file of fixtureFiles) {
    const fixture = loadFixture(file);

    describe(file, () => {
      (fixture.valid ?? []).forEach((message, index) => {
        it(`valid[${index}] parsea OK`, () => {
          const result = parseAgentMessage(message);
          expect(
            result.success,
            result.success ? undefined : `falló con ${result.code}: ${result.detail}`,
          ).toBe(true);
        });
      });

      (fixture.invalid ?? []).forEach((message, index) => {
        it(`invalid[${index}] se rechaza (${String(message._reason ?? 'sin razón')})`, () => {
          const result = parseAgentMessage(message);
          expect(result.success, 'debería fallar pero fue aceptado').toBe(false);
        });
      });
    });
  }
});

describe('parseAgentMessage — reglas del sobre (mirror de MessageCodec.TryParse)', () => {
  const envelope = (overrides: Record<string, unknown>): Record<string, unknown> => ({
    v: '1.0',
    id: '01J9X0000000000000000001',
    type: 'ping',
    ts: '2026-08-09T14:30:00.123-03:00',
    ...overrides,
  });

  it('versión mayor incompatible → PROTOCOL_VERSION_UNSUPPORTED y shouldClose', () => {
    const result = parseAgentMessage(envelope({ v: '2.0' }));
    expect(result).toMatchObject({
      success: false,
      code: 'PROTOCOL_VERSION_UNSUPPORTED',
      shouldClose: true,
    });
  });

  it('versión menor distinta dentro de 1.x se acepta', () => {
    expect(parseAgentMessage(envelope({ v: '1.7' })).success).toBe(true);
  });

  it('tipo desconocido → UNKNOWN_MESSAGE_TYPE sin cerrar la conexión', () => {
    const result = parseAgentMessage(envelope({ type: 'no.existe' }));
    expect(result).toMatchObject({
      success: false,
      code: 'UNKNOWN_MESSAGE_TYPE',
      shouldClose: false,
    });
  });

  it('tipo con payload obligatorio sin payload → INVALID_PAYLOAD', () => {
    const result = parseAgentMessage(envelope({ type: 'identify.stop' }));
    expect(result).toMatchObject({ success: false, code: 'INVALID_PAYLOAD' });
  });

  it('claves extra en el payload se ignoran (paridad con System.Text.Json)', () => {
    const result = parseAgentMessage(
      envelope({ type: 'identify.stop', payload: { opId: 'op-1', extra: 'ignorada' } }),
    );
    expect(result.success).toBe(true);
  });

  it('todo tipo con payload en el catálogo tiene schema registrado', () => {
    const withoutPayload = new Set(['status.get', 'ping', 'pong']);
    for (const type of AGENT_MESSAGE_TYPES) {
      if (withoutPayload.has(type)) {
        expect(AGENT_PAYLOAD_SCHEMAS[type]).toBeUndefined();
      } else {
        expect(AGENT_PAYLOAD_SCHEMAS[type], `falta schema para '${type}'`).toBeDefined();
      }
    }
  });
});

describe('parseAgentMessageJson', () => {
  it('JSON inválido → MALFORMED_ENVELOPE', () => {
    const result = parseAgentMessageJson('{no es json');
    expect(result).toMatchObject({ success: false, code: 'MALFORMED_ENVELOPE' });
  });

  it('mensaje que excede 256KB → INTERNAL_ERROR y shouldClose', () => {
    const huge = JSON.stringify({
      v: '1.0',
      id: 'x',
      type: 'ping',
      ts: '2026-08-09T14:30:00.123-03:00',
      payload: { junk: 'a'.repeat(260 * 1024) },
    });
    const result = parseAgentMessageJson(huge);
    expect(result).toMatchObject({ success: false, code: 'INTERNAL_ERROR', shouldClose: true });
  });

  it('mensaje válido parsea end-to-end', () => {
    const raw = JSON.stringify({
      v: '1.0',
      id: '01J9X0000000000000000001',
      type: 'identify.sent',
      ts: '2026-08-09T14:30:00.123-03:00',
      payload: { opId: 'op-1' },
    });
    const result = parseAgentMessageJson(raw);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.message.type).toBe('identify.sent');
      expect(result.message.payload).toEqual({ opId: 'op-1' });
    }
  });
});
