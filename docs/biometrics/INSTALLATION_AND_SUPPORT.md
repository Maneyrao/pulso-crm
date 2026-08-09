# Instalación y soporte del Pulso Agent

Fecha: 2026-08-09
Estado: propuesto. Se ejecuta en la Etapa 8, sólo tras un `GO` de la POC.

## 1. A quién le sirve este documento

- Al equipo, para construir el instalador y los runbooks.
- Al soporte, para resolver tickets sin adivinar.
- Al gimnasio, como base de la guía de instalación (que se escribe aparte, en lenguaje no técnico).

## 2. Requisitos de la PC de recepción

| Requisito | Mínimo | Notas |
|---|---|---|
| Sistema operativo | Windows 10 x64 (22H2) o Windows 11 x64 | **El soporte de Windows 11 debe confirmarse en POC-02.** Este documento asume que se confirma; si no, se corrige aquí. |
| Arquitectura | x64 | ARM64 no soportado sin verificación adicional |
| RAM | 4 GB | el agente usa < 150 MB |
| Disco | 300 MB | incluye el runtime .NET self-contained |
| USB | Un puerto USB 2.0 libre, **directo en la PC** | Un hub sin alimentación es una causa frecuente de fallas intermitentes |
| Red | Salida HTTPS a `api.<dominio>` | |
| Permisos | Administrador local para instalar | |
| Navegador | Chrome o Edge actualizados | Firefox depende del resultado de POC-19 |

## 3. Qué instala el MSI

| Componente | Ruta | Nota |
|---|---|---|
| Ejecutable del agente | `C:\Program Files\Pulso\Agent\` | self-contained, firmado |
| Servicio de Windows | `PulsoAgent` | arranque automático, cuenta `LocalSystem` |
| App de bandeja | `C:\Program Files\Pulso\Tray\` | opcional, arranca con la sesión |
| Configuración | `C:\ProgramData\Pulso\agent.json` | sin secretos |
| Credenciales | DPAPI `LocalMachine` | no es un archivo legible |
| Certificado TLS local | Almacén `Trusted Root` de la máquina | único por instalación, generado en el momento |
| Logs | `C:\ProgramData\Pulso\logs\` | rotación diaria, 7 días |
| Driver del lector | **No lo instala el MSI** | ver §4 |

### Por qué el MSI no instala el driver

El driver es de HID y sus términos de redistribución están `[PENDIENTE]` (V2 de la investigación). Hasta cerrarlo por escrito, el instalador **enlaza** a la descarga oficial y verifica que el driver esté presente. Si V2 se resuelve favorablemente, se incorpora al MSI en una versión posterior.

Esto no es un detalle burocrático: distribuir software de terceros sin derecho es un riesgo legal real.

## 4. Procedimiento de instalación

### Paso 1 — Driver del lector (antes que nada)

1. Descargar el driver correspondiente desde la página oficial de HID (el nombre exacto y cuál de los dos se define en POC-01).
2. Instalar **con el lector desconectado**.
3. Reiniciar si el instalador lo pide.
4. Conectar el lector a un puerto USB directo.
5. Verificar en el Administrador de dispositivos que aparezca sin advertencia.

### Paso 2 — Crear el puesto en el CRM

Un usuario con permiso `device:manage`:

1. Configuración → Dispositivos → **Agregar puesto**.
2. Elegir sede y ponerle un nombre reconocible ("Recepción planta baja").
3. El CRM muestra un **`installationId`** y un **secreto de pareo**.

> El secreto se muestra **una sola vez**. Si se pierde, se genera otro; el anterior queda invalidado.

### Paso 3 — Instalar el agente

1. Descargar el MSI desde el CRM (link firmado, de vida corta).
2. Ejecutar como administrador.
3. Aceptar la instalación del certificado local (el instalador explica qué es y por qué).
4. Ingresar `installationId` y el secreto.
5. Finalizar.

### Paso 4 — Aprobar el puesto

El agente aparece en el CRM como **Pendiente de aprobación**. Un usuario con `device:manage` lo aprueba. **Hasta que no se aprueba, no opera.**

Es un paso deliberado: impide que alguien con el MSI y un secreto filtrado empiece a operar sin que nadie lo note.

### Paso 5 — Verificar

En la pantalla de Acceso, el badge del agente debe mostrar **Conectado — Lector listo**. Probar un enrolamiento con un socio de prueba.

## 5. Desinstalación

El desinstalador:

1. Detiene y quita el servicio.
2. Elimina el certificado local del almacén.
3. Borra credenciales de DPAPI.
4. Conserva los logs 7 días (para diagnosticar por qué se desinstaló) y luego los borra.
5. Notifica al backend, que marca el agente como `REVOKED`.

Si la PC se rompe y no se puede desinstalar, se revoca el agente desde el CRM. **Ese es el camino correcto ante un robo o pérdida.**

## 6. Actualización

Resumen (detalle en `DEPLOYMENT_PLAN.md` §11):

- El agente consulta actualizaciones en cada heartbeat.
- Descarga el binario, **verifica firma y hash**, y aplica sólo estando idle y dentro de la ventana configurada.
- Conserva la versión anterior; si la nueva no arranca, restaura sola.
- Rollout por fases: primero los puestos marcados `canary`.
- El backend soporta las dos últimas versiones menores del protocolo. Una versión anterior recibe `426` y el CRM avisa.
- Una versión con fallo de seguridad puede marcarse `blocked`: el agente deja de operar y muestra instrucciones.

El gimnasio no tiene que hacer nada en una actualización normal. Si la ventana está mal configurada y el agente se actualiza en horario pico, es un problema de configuración, no del usuario — por eso la ventana se define en el onboarding.

## 7. Runbooks de soporte

Formato: síntoma → qué mirar → qué hacer.

---

### R1 — "El lector no aparece"

**Mirar.** Badge del agente en el CRM; Administrador de dispositivos; `pulso-agent --diagnose`.

| Causa | Solución |
|---|---|
| Lector desenchufado | Enchufar en puerto USB **directo**, no en hub |
| Driver no instalado o incorrecto | Reinstalar el driver correcto (POC-01) |
| Servicio detenido | `services.msc` → iniciar `PulsoAgent`; revisar por qué se detuvo en el visor de eventos |
| Otro software tomó el lector | Cerrar Windows Hello u otro software biométrico; ver §8 |
| Puerto USB defectuoso | Probar otro puerto |

---

### R2 — "El agente dice 'Pendiente de aprobación'"

Alguien con `device:manage` tiene que aprobarlo en Configuración → Dispositivos. Si ya estaba aprobado y volvió a este estado, cambió el `machineFingerprint`: la PC cambió de hardware o el agente se copió a otra máquina. **Verificar que no sea una copia no autorizada antes de aprobar.**

---

### R3 — "El navegador no se conecta al agente"

| Causa | Solución |
|---|---|
| Certificado no instalado o vencido | `pulso-agent --renew-cert`, luego reiniciar el navegador |
| Firefox (si POC-19 dio negativo) | Usar Chrome o Edge |
| Puerto 21987 ocupado | `netstat -ano \| findstr 21987`; identificar el proceso; cambiar el puerto en `agent.json` **y** en la configuración del puesto en el CRM |
| Origen no permitido | Agregar el origen a `allowedOrigins` (soporte, no el usuario) |
| Firewall bloqueando loopback | Poco común; revisar reglas de seguridad corporativa |
| Banner "Agente sin TLS" | El agente está sirviendo `ws://`: reinstalar el certificado |

---

### R4 — "La huella no reconoce a un socio"

1. ¿Cuántos intentos? Menos de 3 es normal, sobre todo con manos húmedas.
2. Limpiar el sensor con un paño suave y seco.
3. El socio se seca las manos y reintenta.
4. Revisar la calidad del enrolamiento en la ficha del socio: **si está por debajo del umbral recomendado, re-enrolar es la solución correcta**, no insistir.
5. Probar con otro dedo (el índice de la mano no dominante suele estar menos desgastado).
6. Si sigue fallando: hay personas cuyas huellas no son legibles de forma confiable (POC-14 mide qué proporción). **Se les asigna acceso por documento o tarjeta y se les informa. No es una falla del socio ni del operador.**

---

### R5 — "No puedo enrolar: dice que falta consentimiento"

Es correcto y deliberado. Hay que registrar el consentimiento del socio antes (ficha del socio → Biometría → Registrar consentimiento). Si el gimnasio usa consentimiento en papel, se escanea y se adjunta.

---

### R6 — "Dice que el dedo ya está enrolado"

Dos casos distintos:

- **Mismo socio, mismo dedo**: ya tiene credencial activa. Revocar y re-enrolar si hace falta mejorar la calidad.
- **Otro socio**: la huella ya está registrada a nombre de otra persona. **Esto es un hallazgo, no un error técnico.** Puede ser un enrolamiento equivocado anterior o un intento de compartir la membresía. Se escala al dueño del gimnasio con el registro de auditoría.

---

### R7 — "El agente aparece desconectado"

| Causa | Solución |
|---|---|
| PC apagada | Encenderla; el servicio arranca solo |
| Sin internet | Verificar; mientras tanto, usar acceso por documento |
| Servicio caído | Reiniciar; revisar el visor de eventos y `agent.log` |
| Agente revocado | El CRM muestra el motivo; re-parear si corresponde |
| Versión bloqueada | Actualizar |

---

### R8 — "Todo funcionaba y dejó de andar tras una actualización de Windows"

Causa habitual: la actualización reemplazó o desactivó el driver.

1. Verificar el driver en el Administrador de dispositivos.
2. Reinstalar el driver correcto.
3. Reiniciar el servicio `PulsoAgent`.
4. **Registrar el caso**: si se repite con una build específica de Windows, es información que hay que documentar y comunicar a todos los clientes.

---

### R9 — Escalamiento

Antes de escalar, adjuntar el ZIP de `pulso-agent --diagnose`, que contiene:

- logs de los últimos 7 días,
- `agent.json` **sin secretos**,
- resultado de la detección del lector,
- versiones de agente, driver, .NET y Windows,
- últimos 50 eventos de auditoría locales.

**El ZIP no contiene imágenes, templates ni datos de socios.** Se puede adjuntar a un ticket sin riesgo.

## 8. Conflictos conocidos

| Conflicto | Síntoma | Mitigación |
|---|---|---|
| Windows Hello usando el lector | El lector "existe" pero la captura falla o se cuelga | Con driver WBF, Windows Hello puede tomar el dispositivo. Desactivar Windows Hello para huella en esa PC, o usar el driver non-WBF (depende de POC-01) |
| Otro software biométrico | Acceso exclusivo al dispositivo | Desinstalar o desactivar |
| Antivirus | Bloquea el servicio o la auto-actualización | Excluir `C:\Program Files\Pulso\` y `C:\ProgramData\Pulso\` |
| Políticas de grupo corporativas | Impiden instalar el certificado en Trusted Root | Instalarlo por GPO; requiere al área de IT del cliente |
| Hub USB sin alimentación | Fallas intermitentes difíciles de diagnosticar | Puerto directo. Es la primera pregunta ante fallas intermitentes |
| Suspensión de USB para ahorro de energía | El lector "desaparece" tras un rato de inactividad | Desactivar la suspensión selectiva de USB en el plan de energía |

## 9. Métricas de soporte

Para saber si el producto está sano en campo, no sólo en el laboratorio:

| Métrica | Objetivo |
|---|---|
| Puestos con agente conectado en horario operativo | > 98% |
| Tiempo medio de instalación | < 20 min |
| Tickets de biometría por puesto por mes | < 0,5 |
| Tasa de re-enrolamiento | < 5% de los socios enrolados |
| Socios que no pueden usar huella | medido, comunicado y con alternativa asignada |
| Éxito de auto-actualización | > 95% sin intervención |

Estas métricas salen de `AgentAuditEvent` y del heartbeat; no hay que pedírselas a nadie.

## 10. Onboarding de un gimnasio nuevo con biometría

Checklist para el equipo:

- [ ] Confirmar Windows y hardware de la PC de recepción.
- [ ] Confirmar que hay un puerto USB directo libre.
- [ ] Entregar el texto de consentimiento y acordar cómo se va a recolectar (papel o digital).
- [ ] Instalar driver + agente; parear y aprobar.
- [ ] Configurar la ventana de actualización según el horario del gimnasio.
- [ ] Enrolar 3 socios de prueba y validar identificación.
- [ ] Capacitar a recepción: cómo enrolar, qué hacer si no reconoce, cuándo usar documento.
- [ ] Explicar que el acceso por documento **siempre** funciona como alternativa.
- [ ] Dejar por escrito a quién llamar y qué adjuntar.
- [ ] Registrar el puesto en el inventario interno.
