<!-- Título: Conventional Commit en inglés, por ejemplo `feat(registration): add guardian consent step`. -->

## Resumen

<!-- Qué cambia y por qué, en dos o tres líneas. -->

## Issue relacionado

Closes #

<!-- Mantener "Closes" en inglés: GitHub solo cierra el issue con palabras clave en inglés. Si el PR no cierra el issue, usar `Refs #N`. -->

## Cambios

- 

## Cómo se probó

<!-- Comandos ejecutados y sus resultados. -->

- 

## Capturas

<!-- Solo para cambios de interfaz y siempre con datos ficticios. Si no aplica: N/A. -->

## Riesgos e impacto

<!-- Datos, privacidad, migraciones, cambios incompatibles, uso sin conexión. Si no hay: Ninguno. -->

## Entrega

<!-- Marca una sola casilla. «Apto para OTA» solo si el cambio es JavaScript o recursos: el check de CI falla si el diff toca código nativo, configuración de la app, dependencias, migraciones o reglas de sync. Clasifica con `sh .github/scripts/check-ota.sh classify`: «Apto para OTA» solo si sale con 0 (2 es un error, nunca OTA). -->

- [ ] Apto para OTA
- [ ] Requiere build de Play

Motivo: 

## Checklist

- [ ] Cumple los criterios de aceptación del issue.
- [ ] Incluye tests del comportamiento nuevo o corregido.
- [ ] Los checks de CI pasan.
- [ ] Documentación y `AGENTS.md` actualizados si cambió el comportamiento o el flujo.
- [ ] Sin secretos, credenciales ni datos personales reales.
- [ ] Se consideró el uso sin conexión y los datos faltantes (un tiempo faltante no es cero).
- [ ] Reutiliza funciones y componentes existentes (o explica por qué no).
- [ ] Cambios de interfaz: incluye capturas lado a lado comparadas con el sistema de diseño, con datos ficticios.

## Requiere aprobación del maintainer

<!-- Sí o No. Si es Sí, qué área sensible toca: autenticación, datos personales, consentimiento, modelo de datos, sincronización, release, CI o dependencias. -->
