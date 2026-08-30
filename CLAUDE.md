# CLAUDE.md — reglas permanentes para trabajar en este repositorio

Estas reglas se aplican a toda sesión de Claude Code (u otro asistente) en
`/Users/tmaneyro22/Documents/pulso-crm`. No son sugerencias.

## Alcance de la sesión

- Trabajar exclusivamente dentro de este repositorio. Nada fuera de
  `/Users/tmaneyro22/Documents/pulso-crm/`.
- Los documentos de `docs/` (MASTER_IMPLEMENTATION_PLAN, ADRS, API_CONTRACTS,
  SECURITY_MODEL, TEST_STRATEGY, FRONTEND_PLAN, DATA_MODEL, ARCHITECTURE,
  CLAUDE_CODE_EXECUTION_SEQUENCE) son referencia obligatoria. Léelos antes de
  tocar código de la sección correspondiente.
- Cuando el prompt del usuario contradice a `docs/`, gana el prompt del usuario.

## Cambios existentes

- No sobrescribas, revertas ni descartes cambios sin commit que no hayas hecho
  vos en esta sesión. Antes: `git status --short`, `git diff` y entender.
- Prohibido en cualquier situación: `git reset --hard`, `git clean -f`,
  `git checkout .`, `git restore .` sobre archivos no tuyos, `prisma migrate
reset` contra una base que no sea `pulso_dev` local, `DROP DATABASE`,
  `TRUNCATE` fuera de tests aislados, `rm -rf` fuera del scratchpad de la sesión.

## Frontend / backend / contratos

- No crear rutas frontend para endpoints que no existan en la API.
- No crear clientes API sin el backend implementado del otro lado.
- Toda página del sidebar debe apuntar a una ruta que existe y consuma un
  endpoint real y probado.
- Toda respuesta pública sale por un serializer del backend, no del frontend.
  El enmascaramiento de documento vive en el backend (ADR-018).

## Multi-tenant

- Todo `branchId` recibido en query/body/params debe validarse contra la
  sesión (`TenantContextStore`). Nunca se toma `gymId` del cliente (ADR-008).
- Ninguna consulta a modelos tenant-scoped puede correr sin
  `TenantContext`. La extensión de Prisma lanza; no lo silencies (ADR-009).
- Un endpoint nuevo debe pasar por la suite de cross-tenant auto-descubierta.
  Si no aplica (público, singleton, sesión), añadirlo por ruta exacta a
  `NON_TENANT_ALLOWLIST` con el motivo. Nunca por controller entero.

## NestJS DI

- **No usar `import type` para dependencias inyectadas por el constructor** de
  un `@Injectable()` / `@Controller()` / guard / interceptor: `emitDecoratorMetadata`
  descarta los tipos-only y NestJS deja el parámetro sin resolver. Convención
  del repo: import de VALOR con `// eslint-disable-next-line
@typescript-eslint/consistent-type-imports -- ver nota en
infra/redis/redis.service.ts`.
- `import type` es OK y preferido para tipos NO inyectados (parámetros de
  método, DTOs, `Prisma`, `PulsoTransactionClient`, `Request`, etc.).

## Tests

- Prohibido `passWithNoTests: true`. Si un package no tiene tests, se agregan;
  no se marca la ejecución como éxito vacío.
- Prohibido `.skip`, `.todo` sin issue, borrar tests, relajar assertions o
  bajar umbrales de cobertura para hacer pasar CI.
- Los tests de integración corren contra PostgreSQL real, cada archivo en su
  propio esquema efímero (ADR-023). Prohibido reemplazar por mocks.
- Un endpoint sin `@Public()` ni `@RequiresPermission()` hace fallar la suite
  de descubrimiento de rutas. No agregar `@Public()` para saltearlo.
- Concurrencia y race conditions son tests de primera clase. No los borres
  por lentos.

## Idempotencia y dinero

- Toda operación con efecto (cobro, membresía, reversa, envío) debe soportar
  `Idempotency-Key` (ADR-016).
- Dinero: `Decimal(14,2)` en base y string decimal en API. Nunca `number` /
  `float` en JSON o en cálculos.
- Movimientos de caja son inmutables. Corrección por reversa, no por
  `UPDATE`/`DELETE`.

## Verificación antes de dar por terminado

- No declarar una función terminada sólo porque compila. Ejecutar y verificar.
- Antes de commit / entrega: `pnpm lint && pnpm typecheck && pnpm build &&
pnpm test` en verde. Si alguno falla, PARAR y arreglar; no avanzar al
  siguiente milestone.
- No ejecutar autofix global (`eslint --fix`, `prettier --write .`) sin
  revisar el diff. Fix acotado al archivo tocado.

## Commits

- Un commit por milestone funcional. No mezclar módulos en un commit.
- Antes del commit: correr los tests del área tocada.
- No hacer commits que dejan el build roto.
- No incluir secretos ni valores reales en `.env.example`.

## Fuera de alcance del MVP actual

- Biometría (huella, U.are.U 4500, agente local .NET): Etapa 7-8.
- WhatsApp real: se usa el proveedor `mock` hasta que el flujo esté probado.
- No implementar ninguno de estos "para adelantar" en un milestone previo.

## Entregas

- Al completar un milestone, registrar: comandos ejecutados con salida,
  archivos creados/modificados, criterios de aceptación cumplidos y
  pendientes, decisiones no planificadas, dudas abiertas, y qué NO se hizo
  y por qué.
- La frase "MVP terminado" sólo se usa si los 13 pasos manuales de la
  verificación final (ver prompt raíz de la sesión) pasan.
