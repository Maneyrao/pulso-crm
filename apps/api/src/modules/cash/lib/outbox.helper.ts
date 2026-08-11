interface OutboxWriter {
  outboxEvent: {
    create(args: { data: Record<string, unknown> }): Promise<unknown>;
  };
}

/**
 * Escribe un `OutboxEvent` dentro de la MISMA transacción que el efecto de
 * negocio ("no hay efecto sin evento ni evento sin efecto"). El worker que
 * despacha estos eventos (recibo por WhatsApp, etc.) se implementa en otra
 * etapa; acá sólo se deja la fila lista para que lo levante.
 */
export async function writeOutboxEvent(
  db: OutboxWriter,
  gymId: string,
  input: {
    eventType: string;
    resourceType: string;
    resourceId?: string | null;
    payload: Record<string, unknown>;
  },
): Promise<void> {
  await db.outboxEvent.create({
    data: {
      gymId,
      eventType: input.eventType,
      resourceType: input.resourceType,
      resourceId: input.resourceId ?? null,
      payload: input.payload,
    },
  });
}
