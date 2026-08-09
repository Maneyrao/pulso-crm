import type { Logger } from 'pino';

/**
 * Abstracción del proveedor de mensajería.
 *
 * El dominio no sabe con quién habla. Cambiar de proveedor (o descubrir que el
 * elegido no sirve) no debería tocar una línea de la lógica de negocio.
 *
 * La elección del proveedor real es la pregunta bloqueante B3. Hasta que se
 * resuelva, `mock` es el único implementado y alcanza para desarrollar y
 * testear todo el flujo.
 */

export interface SendRequest {
  /** Destino en E.164. */
  to: string;
  body: string;
  /** Para correlacionar con `MessageJob.dedupeKey`. */
  idempotencyKey: string;
}

export type SendResult =
  | { status: 'sent'; externalId: string }
  | { status: 'rejected'; reason: string; retryable: false }
  | { status: 'failed'; reason: string; retryable: true };

export interface MessagingProvider {
  readonly name: string;
  send(req: SendRequest): Promise<SendResult>;
}

/**
 * Proveedor de desarrollo: no envía nada, registra y devuelve éxito.
 *
 * Loguea el destino enmascarado y la LONGITUD del cuerpo, nunca el texto: un
 * mensaje de recibo lleva nombre e importe, y los logs no son lugar para eso.
 */
class MockProvider implements MessagingProvider {
  readonly name = 'mock';

  constructor(private readonly logger: Logger) {}

  async send(req: SendRequest): Promise<SendResult> {
    this.logger.info(
      { to: maskPhone(req.to), bodyLength: req.body.length, key: req.idempotencyKey },
      'Mensaje simulado',
    );
    return { status: 'sent', externalId: `mock-${req.idempotencyKey}` };
  }
}

export function createMessagingProvider(kind: string, logger: Logger): MessagingProvider {
  switch (kind) {
    case 'mock':
      return new MockProvider(logger);
    case 'meta_cloud':
      // Pendiente de la decisión B3 (proveedor y contrato comercial).
      throw new Error(
        'El proveedor meta_cloud todavía no está implementado. Ver pregunta bloqueante B3 ' +
          'en docs/MASTER_IMPLEMENTATION_PLAN.md §13.',
      );
    default:
      throw new Error(`Proveedor de mensajería desconocido: ${kind}`);
  }
}

function maskPhone(e164: string): string {
  return e164.length <= 4 ? '••••' : `${e164.slice(0, 3)}••••${e164.slice(-3)}`;
}
