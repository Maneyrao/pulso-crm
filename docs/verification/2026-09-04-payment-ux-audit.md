# Auditoria focalizada: socios y cobros

Fecha: 2026-09-04. Entorno: http://127.0.0.1:4000, cambios locales.
Persona: dueno/recepcionista del gimnasio, no tecnico, cobra entre atenciones,
necesita reconocer en segundos quien pago, que periodo cubrio y cuanto debe.

## Alcance y limites

Verdicto de la auditoria visual inicial: INCOMPLETE. Esto fue una revision focalizada de
lista, dialogo de pago, navegacion y contratos asociados, no una certificacion
de todo el CRM. No se ejecutaron todos los escenarios, axe ni mediciones de
rendimiento/responsive de la skill ux-audit. No se efectuaron cobros reales ni
se abrio una caja para la prueba. La revision inicial no modifico codigo; las
correcciones posteriores se registran a continuacion.

## Correcciones implementadas posteriormente

- La lista muestra `Pagar` únicamente con saldo negativo; con saldo cero o a favor muestra `Ver pagos`.
- El cobro usa `GET /members/:id/payment-quote` y `POST /members/:id/pay-debt`: el servidor calcula la deuda desde el ledger, el plan y el período. El operador ya no edita el importe ni puede cobrar una deuda inexistente.
- Se exige `member:read`, `cash:operate` y `payment:collect`, caja propia abierta, medio permitido y una cotización vigente. El lock del socio, el ledger y la caja quedan en una transacción; una segunda operación responde conflicto.
- El historial conserva `membershipId` y período. La transferencia suma $5.000 por servicio pendiente y no vuelve a sumar el recargo si el servicio ya lo tenía aplicado.
- Las membresías mensuales tienen renovación explícita configurable. El worker crea el próximo período y su deuda, sin borrar períodos ni registrar un cobro ficticio.
- Se agregó Inventario: productos por sede, reposición/ajuste, ventas, stock insuficiente, reversas e ingreso de caja atómico. El precio lo toma el servidor.
- Se simplificaron dashboard, caja, navegación y transiciones; se excluyen débito y crédito de los flujos habilitados.

Las pruebas automatizadas de esta corrección cubren 6 escenarios de cobro de API,
11 de inventario y 26 de interfaz de socios, además de aislamiento entre gimnasios.

Ventana observada: 1512 x 682. Modal de pago: 448 x 522, dentro de la ventana.
Capturas: emitidas en la conversacion mediante CUA (lista y modal).
Console capturada: sin entradas en la consulta dev.logs (limit 6); no demuestra
ausencia historica de errores. Al inicio, ambos servidores locales estaban
apagados: curl a 4000/4001 fallo. Se reiniciaron; health/ready dio DB/Redis OK.

## Hallazgos históricos de la auditoría inicial

### H1. La misma accion de cobro para todos los saldos

Severidad: alta. Capa: interaccion/modelo.
Reproduccion: Socios, fila Sin deuda, Registrar pago, escribir 40000.
Observado: se abre un nuevo cobro con deuda 0 y se avisa que sera saldo a favor.
El boton de la lista no distingue si existe un pago previo. Con caja cerrada
Confirmar queda bloqueado; no se probo un segundo cobro real. En el codigo, con
caja abierta se admite cualquier importe positivo sin exigir una cuota pendiente.
La idempotencia protege un mismo intento, no dos aperturas del formulario.
Evidencia: captura modal Sofia Acosta, deuda 0, importe 40000; codigo:
apps/web/app/(app)/members/page.tsx:227
apps/web/components/members/MemberPaymentDialog.tsx:24
apps/web/components/members/MemberPaymentDialog.tsx:55
apps/api/src/modules/cash/cash-movement.service.ts:119
Cambio concreto: reservar Cobrar saldo para deuda pendiente; presentar Ver pagos
para saldo cero; separar Registrar adelanto como accion secundaria explicita.

### H2. Cobrar cuenta corriente no equivale a pagar/renovar una cuota

Severidad: alta. Capa: arquitectura/feedback.
Reproduccion: abrir cobro y buscar plan, periodo cubierto y nueva vigencia.
Observado: solo importe/medio y deuda agregada. POST /cash/movements acredita
ledger pero no renueva membresia ni asigna el importe a un periodo. El mensaje
de no renovacion aparece solamente si el importe supera la deuda.
Riesgo: el dueno espera habilitar al socio al cobrar, pero puede seguir vencido.
Evidencia: MemberPaymentDialog.tsx:38 y :80;
apps/api/src/modules/cash/cash-movement.service.ts:132.
Cambio concreto: distinguir Cobrar deuda de Renovar cuota; mostrar periodo y
vigencia en renovacion. Para mostrar Pagado este mes, vincular cobros/abonos a
cargos de socio+plan+periodo, conservando pagos parciales, reversas y adelantos.
No inferir pago a partir de saldo cero ni agregar un booleano manual.

### H3. Letras claras sobre dorado de poco contraste

Severidad: media. Capa: visual/accesibilidad.
Reproduccion: observar Registrar pago en filas de la lista.
Medicion DOM: fondo rgb(201,165,108), texto rgb(242,236,225), fuente 12.5px;
contraste calculado 1.97:1. Token foreground definido #171008, pero la clase
text-(--color-primary-foreground) falta en el className final.
Ubicacion: packages/ui/src/components/Button.tsx:21 y :30,
packages/ui/src/lib/cn.ts:10. Sospecha confirmada por clases finales: conflicto
entre utilidades text de color y tamano al combinar con tailwind-merge.
Cambio concreto: desambiguar el tipo de las utilidades de color/tamano y agregar
regresion que compruebe que ambas permanecen; revalidar color calculado.
Reservar dorado intenso para la accion relevante, no todas las filas sin deuda.

### M1. Activo y Sin deuda no resuelven el estado de la cuota

Severidad: media. Capa: informacion.
Reproduccion: mirar fila con Activo, Sin plan, Sin deuda.
Observado: Activo refiere al socio y no a una cuota vigente; falta periodo,
ultimo pago y monto pendiente del periodo. Vencido se etiqueta en funcion del
filtro, no como estado uniforme de la lista general.
Ubicacion: apps/web/app/(app)/members/page.tsx:66 y :191.
Cambio concreto: separar Estado del socio y Cuota; mostrar Sin plan, Pendiente,
Parcial, Pagada o Vencida desde datos reales. Deuda como importe positivo con
etiqueta Debe, evitando que el operador interprete un signo contable negativo.

### M2. En linea no verifica disponibilidad del CRM

Severidad: media. Capa: feedback.
Reproduccion: pagina previamente cargada mientras 4000/4001 no escuchan; abrir pago.
Observado: indicador En linea junto con No pudimos cargar la caja.
Ubicacion: apps/web/components/shell/ConnectionIndicator.tsx:17.
Cambio concreto: separar estado de red del estado de API; mostrar Sin conexion
al servidor ante fallos y confirmar recuperacion con un healthcheck ligero.

## Registro de interacciones

- 10:32:37: inspeccion de lista y segmentos; boton en filas con y sin deuda.
- 10:32:xx: clic Registrar pago en Sofia Acosta; deuda 0.
- 10:32:xx: ingreso 40000; aparece advertencia de saldo a favor; no se confirma.
- 10:33:17: reinicio de servidores locales tras detectar error de conexion.
- 10:33-10:34: clic Reintentar; recupera metodos y muestra caja cerrada.
- 10:34:xx: medicion DOM del modal y contraste; lectura de consola.
- 10:35:01: Cancelar; retorno a la lista sin registrar movimientos.
- 10:35:10: intento de filtro; estado posterior cambio a Activos y un modal,
  por lo que no se contabiliza como verificacion aislada de En deuda.
Horas xx aproximadas: no se inventan timestamps exactos para acciones sin reloj.

## Orden de trabajo

1. Inmediato: acciones segun saldo real, adelanto separado, contraste de botones.
2. Siguiente: cobro/renovacion con periodo visible, ultimo pago y saldo restante.
3. Estructural: asignacion de abonos a cuotas por periodo y control de duplicados
   en backend; reintento tras cierre/recarga y dos operadores simultaneos.
4. Pulido: reducir peso de botones repetidos, textos operativos y fechas locales;
   probar teclado, ventanas pequenas y errores de red.

Autocritica: se conservaron cinco hallazgos concretos, sin atribuir pago del mes
a saldo cero ni afirmar que un segundo cobro fue ejecutado en el navegador.
La identidad de marca es consistente y el menu mas corto ayuda. Todavia no es
una herramienta suficientemente intuitiva para cobrar sin explicaciones: obliga
a conocer diferencias internas entre membresia, deuda y movimiento de caja.
