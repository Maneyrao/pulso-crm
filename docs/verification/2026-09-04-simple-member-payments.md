# Cobros visibles y menu por segmentos

Estado: implementado localmente el 2026-09-04. Esta actualización reemplaza la descripción provisional de cobro directo.

- Pagar aparece únicamente para socios con saldo negativo. En saldo cero o a favor se muestra Ver pagos.
- Asignar plan / deuda abre directamente el formulario existente de membresia.
- El operador elige Pago ahora o Queda debiendo al asignar el plan. Una deuda ya
  registrada no necesita otro cargo: el cobro directo acredita el saldo existente.
- Pagar usa `GET /members/:id/payment-quote` y `POST /members/:id/pay-debt` con Idempotency-Key. El importe es de solo lectura y sale del ledger, plan y período; no se aceptan importes parciales o arbitrarios desde este flujo.
- Requiere `member:read`, `cash:operate` y `payment:collect`; sin caja propia abierta no se permite confirmar.
- Saldo cero se etiqueta Sin deuda, no Pago: un socio sin cargos no implica que
  haya pagado. El cobro de saldo no renueva la vigencia de una membresia.
- Sidebar reemplaza grupos planos por segmentos desplegables. Conserva rutas,
  permisos, feature flags, menu compacto y drawer movil.
- Pruebas focalizadas: menu y permisos, listado, ficha, cobro total/parcial,
  invalidacion de historial y caja, caja cerrada y reintento idempotente.
- Cambios locales, no desplegados a producción en esta tarea.
