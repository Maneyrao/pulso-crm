# Plan de despliegue y operación — Pulso CRM

Fecha: 2026-08-09
Estado: propuesto.

## 1. Ambientes

| Ambiente | Para qué | Datos | Quién accede |
|---|---|---|---|
| `local` | Desarrollo | Seed reproducible, ficticio | Desarrollador |
| `ci` | Pipeline | Efímeros, por corrida | Automatizado |
| `staging` | Validación previa a producción y demos | Seed ampliado, **ficticio** | Equipo |
| `production` | Clientes reales | Reales | Equipo con acceso auditado |

**Regla:** nunca se copian datos de producción a staging. Si se necesita volumen realista, se genera sintéticamente. Un gimnasio real tiene documentos, teléfonos y datos biométricos de personas.

## 2. Topología

```
Vercel                 apps/web          app.<dominio>
Railway (o Fly/Render) apps/api          api.<dominio>
Railway                apps/worker       sin ingress público
Railway                PostgreSQL 16     privado
Railway                Redis             privado
Cloudflare R2          archivos          privado, URLs prefirmadas
Sentry                 errores           web + api + worker
```

Web y API comparten dominio padre para que las cookies `httpOnly` con `SameSite=Lax` funcionen. Si no fuera posible, la alternativa es servir la API detrás de `app.<dominio>/api` por rewrite de Vercel — se documenta como plan B porque agrega latencia.

### Alternativa de menor costo

Todo en un VPS con Docker Compose y Caddy como reverse proxy. Válida y más barata; se adopta si el costo de PaaS deja de justificarse. La aplicación no cambia: sólo el destino del despliegue.

## 3. Variables de entorno

### `apps/api`

| Variable | Ejemplo | Notas |
|---|---|---|
| `NODE_ENV` | `production` | |
| `PORT` | `3001` | |
| `DATABASE_URL` | `postgresql://...` | con `?connection_limit=` acorde al plan |
| `DIRECT_DATABASE_URL` | `postgresql://...` | para migraciones, sin pooler |
| `REDIS_URL` | `redis://...` | |
| `JWT_SECRET` | 64 bytes aleatorios | |
| `JWT_SECRET_PREVIOUS` | | opcional, para rotar sin desloguear |
| `ACCESS_TOKEN_TTL` | `900` | segundos |
| `REFRESH_TOKEN_TTL` | `2592000` | |
| `MASTER_KEK` | 32 bytes base64 | cifrado de columnas |
| `COOKIE_DOMAIN` | `.<dominio>` | |
| `CORS_ORIGINS` | `https://app.<dominio>` | allowlist, separada por comas |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_REGION` | | |
| `SENTRY_DSN` | | |
| `LOG_LEVEL` | `info` | |
| `RATE_LIMIT_ENABLED` | `true` | |
| `WHATSAPP_PROVIDER` | | Etapa 6 |
| `BIOMETRIC_MATCH_THRESHOLD` | | Etapa 8, valor definido por la POC |
| `AGENT_TOKEN_TTL` | `120` | segundos, Etapa 8 |

### `apps/worker`

`DATABASE_URL`, `REDIS_URL`, `MASTER_KEK`, `SENTRY_DSN`, `LOG_LEVEL`, credenciales del proveedor de mensajería. **No** expone puerto.

### `apps/web`

| Variable | Notas |
|---|---|
| `NEXT_PUBLIC_API_URL` | `https://api.<dominio>` |
| `NEXT_PUBLIC_APP_ENV` | `production` \| `staging` |
| `NEXT_PUBLIC_SENTRY_DSN` | |

**Ninguna variable `NEXT_PUBLIC_*` puede contener un secreto.** Un test de CI verifica que no haya patrones de clave en las públicas.

### `apps/local-agent`

Configuración en `%ProgramData%\Pulso\agent.json`, no en variables de entorno: `apiBaseUrl`, `installationId`, `allowedOrigins`, `listenPort` (21987), `logLevel`. Las credenciales de pareo se guardan en **Windows DPAPI**, no en el archivo.

## 4. Migraciones

### Regla de oro

**Toda migración debe ser compatible hacia atrás con la versión de código anterior.** Se despliega en dos pasos cuando el cambio es destructivo:

1. Migración aditiva (agregar columna nullable, backfill, agregar índice `CONCURRENTLY`).
2. Deploy del código que la usa.
3. Migración de limpieza (drop de la columna vieja), en un release posterior.

### Procedimiento

```bash
# 1. Verificar el SQL generado antes de aplicar
pnpm --filter @pulso/db exec prisma migrate diff \
  --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --script

# 2. Aplicar (en el pipeline, antes de arrancar la nueva versión)
pnpm --filter @pulso/db exec prisma migrate deploy
```

- `prisma migrate deploy` corre como **job previo** al arranque, no en el `start` de la app: si falla, la versión vieja sigue corriendo.
- `prisma migrate dev` **sólo en local**. Nunca en un ambiente compartido.
- `prisma db push` **prohibido** fuera de un prototipo local descartable.
- Índices en tablas grandes: `CREATE INDEX CONCURRENTLY` en una migración manual, fuera de transacción.
- Antes de cada migración en producción: snapshot manual además del backup automático.

### Prohibiciones

- No editar una migración ya aplicada en un ambiente compartido.
- No borrar datos en una migración. El borrado va por job de retención, auditado.
- No renombrar tablas o columnas en un solo paso.

## 5. Pipeline de despliegue

```
push a main
  └─ CI (lint, secrets, unit, integration, contracts, components, build, e2e, a11y)
       └─ [staging] migrate deploy → deploy api → deploy worker → deploy web → smoke tests
            └─ aprobación manual
                 └─ [production] snapshot → migrate deploy → deploy api → deploy worker → deploy web → smoke tests
```

- El deploy a producción **requiere aprobación humana**. No hay despliegue automático a producción.
- Smoke tests post-deploy: `/health/ready`, login con usuario de smoke, `GET /members?limit=1`, una consulta de dashboard. Si alguno falla, rollback automático.
- Orden importante: **API antes que web**. La web nueva puede necesitar campos que la API vieja no tiene; al revés no.

## 6. Rollback

| Componente | Cómo |
|---|---|
| `apps/web` | Promover el deployment anterior en Vercel. Instantáneo. |
| `apps/api` / `apps/worker` | Redeploy de la imagen/commit anterior. |
| Base de datos | **Las migraciones no se revierten automáticamente.** Si la migración fue aditiva (que es la regla), el código viejo sigue funcionando y el rollback de código alcanza. Si fue destructiva, se restaura por PITR — decisión explícita, con downtime declarado. |
| Agente local | El instalador conserva la versión anterior; `pulso-agent --rollback` la restaura. |

**Criterio de rollback:** tasa de error > 5% durante 5 minutos, o `/health/ready` fallando, o una regresión funcional confirmada en caja o acceso.

## 7. Health checks y readiness

| Endpoint | Qué chequea | Uso |
|---|---|---|
| `GET /health/live` | El proceso responde | Reinicio del orquestador |
| `GET /health/ready` | Postgres (`SELECT 1`) + Redis (`PING`) + migraciones aplicadas | Balanceador |

`ready` devuelve `503` si la versión de migraciones esperada no coincide con la aplicada. Evita servir tráfico con un esquema incompleto.

## 8. Logging

- JSON estructurado (pino) a stdout; el proveedor lo agrega.
- Campos fijos: `timestamp`, `level`, `requestId`, `gymId`, `userId`, `route`, `method`, `status`, `durationMs`, `version`.
- **Redacción por allowlist** (`SECURITY_MODEL.md` §12.2).
- `requestId` generado en el borde, propagado a la respuesta (`X-Request-Id`) y a los jobs. Soporte puede pedirle al usuario el id que ve en el error.
- Retención: 30 días en caliente.

## 9. Observabilidad y alertas

### Métricas

| Métrica | Umbral de alerta |
|---|---|
| p95 de latencia por endpoint | > 1 s durante 5 min |
| Tasa de `5xx` | > 1% durante 5 min |
| Profundidad de cola BullMQ | > 500 durante 10 min |
| Jobs en DLQ | > 0 |
| Conexiones de Postgres | > 80% del límite |
| Latencia de identificación biométrica | p95 > 1 s |
| Agentes locales offline en horario operativo | > 15 min |
| Fallos de emisión ARCA | > 0 |
| Picos de `401`/`403` | > 3× la línea base |

### Alertas de negocio

- Cierre de caja con diferencia mayor al umbral del gimnasio.
- Reversa de un movimiento de más de X.
- Broadcast a más de N destinatarios.
- Cambio de certificado ARCA.
- Revocación masiva de credenciales biométricas.

Cada alerta lleva un runbook de una página: qué significa, qué mirar primero, qué hacer.

### Sentry

- Web, API y worker. Release atado al SHA del commit y sourcemaps subidos.
- **Scrubbing agresivo**: `password`, `token`, `cookie`, `documentNumber`, `phone`, `template`, `certificate`.
- Alertas por regresión de errores nuevos.

## 10. Backups

| Qué | Frecuencia | Retención | Dónde |
|---|---|---|---|
| PostgreSQL automático | continuo (PITR) | 7 días | proveedor |
| `pg_dump` lógico cifrado | semanal | 8 semanas | bucket separado |
| Archivos S3 | versionado continuo | 30 días de versiones | R2 |
| Configuración de infraestructura | en el repo | historial de git | git |

**Restore drill trimestral**, obligatorio y documentado: restaurar a un ambiente limpio, correr migraciones, verificar integridad referencial y saldos, medir el tiempo total. Se registra en `docs/ops/RESTORE_DRILLS.md`. Un backup sin drill no cuenta.

RPO 15 min · RTO 4 h.

## 11. Actualización del agente local

El agente corre en PCs que no controlamos. La actualización tiene que ser conservadora.

| Punto | Decisión |
|---|---|
| Canal | El agente consulta `GET /api/v1/agent/updates` en el heartbeat |
| Firma | Binario firmado; el agente verifica firma **y** hash antes de aplicar |
| Momento | Nunca durante una operación en curso; espera a estar idle |
| Ventana | Configurable por gimnasio (por defecto, fuera del horario declarado) |
| Rollout | Por fases: primero los agentes marcados `canary`, luego el resto |
| Rollback | Se conserva la versión anterior; ante fallo de arranque, se restaura sola |
| Compatibilidad | El backend soporta **las dos últimas versiones minor** del protocolo. Una versión no soportada recibe `426 UPGRADE_REQUIRED` y la UI avisa |
| Forzado | Un fallo de seguridad puede marcar una versión como `blocked`: el agente deja de operar y muestra instrucciones |

## 12. Soporte por sede

- Cada gimnasio tiene un identificador visible en la UI (`gymId` corto) que el soporte pide.
- Los errores muestran el `requestId`. Con eso se encuentra la traza completa.
- Panel de plataforma (Etapa 13) con: estado de agentes por sede, últimos errores, colas, últimas migraciones aplicadas.
- **El soporte no accede a los datos del gimnasio sin registro.** Cualquier acceso de un `PLATFORM_ADMIN` a datos de un tenant genera `PlatformAuditEvent` visible para el gimnasio.
- Runbooks: "el lector no responde", "no puedo cerrar caja", "no llegan los WhatsApp", "un socio no puede entrar".

## 13. Costos y capacidad (orden de magnitud)

Sin cifras inventadas de precios, sí de capacidad:

| Recurso | Punto de partida | Cuándo escalar |
|---|---|---|
| API | 1 instancia, 1 vCPU / 1 GB | p95 > 500 ms o CPU > 70% sostenido |
| Worker | 1 instancia | profundidad de cola creciente |
| PostgreSQL | 2 vCPU / 4 GB | > 70% de CPU o conexiones al límite |
| Redis | 256 MB | uso > 70% |

Con matching biométrico centralizado, la memoria de la API crece con el padrón de credenciales cargadas. Se dimensiona con el dato real de la POC (V6).

## 14. Checklist de go-live

- [ ] Dominios y certificados configurados; HSTS activo.
- [ ] Todas las variables de entorno de producción cargadas y verificadas (script `pnpm check:env`).
- [ ] Migraciones aplicadas y `/health/ready` en verde.
- [ ] Backups configurados **y un restore drill ejecutado con éxito**.
- [ ] Sentry recibiendo eventos de las tres apps, con scrubbing verificado.
- [ ] Alertas configuradas con destinatario real.
- [ ] Rate limits activos.
- [ ] Headers de seguridad verificados en la respuesta real.
- [ ] Usuario `OWNER` del primer gimnasio creado con contraseña temporal.
- [ ] Los 6 flujos E2E ejecutados manualmente en producción con datos de prueba, y luego borrados.
- [ ] Runbooks escritos.
- [ ] Plan de rollback probado al menos una vez en staging.
