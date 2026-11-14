# TrailSkill

Plataforma modular de desarrollo de deportistas para varias escuelas y, más adelante, varios deportes. Empieza con natación en Colombia, con una escuela piloto. La escuela piloto no es la marca: el código no depende de ninguna escuela, liga ni federación concreta.

Este archivo es la puerta de entrada. Las reglas viven en los documentos enlazados y no se repiten aquí.

## Estado actual

Una sola aplicación (Expo / React Native, Android primero) que atiende a todos los roles: acudientes y deportistas adultos en teléfonos; administradores y entrenadores de la escuela en tablets. Cada módulo de `src/modules/` cubre una parte del producto:

| Área | Qué funciona hoy | Módulo | Respaldo (issues cerrados) |
| --- | --- | --- | --- |
| Registro y autorizaciones | Ingreso, registro de cuenta, alta de deportistas y autorizaciones | `accounts` | #755, #756, #799 |
| Toma de tiempos | Series cronometradas, elección de deportistas, corrección de un tiempo guardado y revisión de conflictos | `timing` | #231, #232, #338 |
| Planes de entrenamiento | Constructor y editor de planes, asignación, vista «Hoy» y cumplimiento | `training-plans` | #282, #393, #409 |
| Historial y marcas | Perfil, historial y «Marcas» del deportista | `athletes` | #838, #852, #856 |
| Consola de escuela | Deportistas, entrenadores, categorías, mediciones, autorizaciones y récords | `school-console` | #410, #687, #858 |
| Importación oficial | Importación de resultados oficiales por proveedor; **en curso**: el proveedor co-fecna está registrado y el proveedor LENEX (plataforma de resultados `co-colombiaacuatica`, por dirección de torneo) está implementado pero **no registrado**: activarlo es un paso aparte del maintainer; la app ya tiene el flujo «importar de un torneo» y agrupa en lectura la misma prueba de varias fuentes; en producción faltan la entrega de la función (paso manual de `deploy/README.md`) y el registro de las fuentes; el retiro de las firmas antiguas de la migración es #931 | `results-import` | #895, #896, #897, #915 (abierto: #931) |

Solo los ítems **confirmados** en los documentos de producto son requisitos; los marcados como propuestos o abiertos no se implementan.

## Cómo trabajamos

- **Un issue → una rama → un worktree → un PR pequeño a `main`.** Sin issue con criterios de aceptación no hay rama.
- **Roles.** El maintainer revisa, decide el alcance y aprueba los merges (los ejecuta el flujo de merge o el dueño del proyecto); el product owner decide qué se lanza; personas y agentes de IA implementan un issue asignado. Detalle en [`CONTRIBUTING.md`](CONTRIBUTING.md#roles).
- **Reglas duras** (lo que nunca se hace, límites de los agentes, requisitos de Google Play): [`AGENTS.md`](AGENTS.md#hard-limits). Flujo completo, ramas, commits y Definition of Done: [`CONTRIBUTING.md`](CONTRIBUTING.md).
- **Migraciones.** Al hacer merge a `main` se despliega solo en producción el compose de `deploy/`: las migraciones de `supabase/migrations/` y PowerSync ([`deploy/README.md`](deploy/README.md)). Las Edge Functions de `supabase/functions/` **no** se despliegan solas: es un paso manual. Por eso una migración necesita la **aprobación explícita del maintainer** antes del merge ([`CONTRIBUTING.md`](CONTRIBUTING.md#review)).
- **Idioma.** Código, commits y documentación en inglés; issues y descripciones de PR en español. Este `README.md` está en español por decisión expresa del dueño del proyecto y es la única excepción.

## Organización del repositorio

| Carpeta | Contenido |
| --- | --- |
| `src/app/` | Solo rutas de Expo Router; cada ruta muestra una pantalla de un módulo |
| `src/core/` | Base compartida: tema, i18n, componentes de UI, sincronización, sesión, tiempos, catálogos deportivos |
| `src/modules/` | Un módulo por área de producto: `accounts`, `timing`, `training-plans`, `athletes`, `school-console`, `results-import` |
| `supabase/` | Migraciones, funciones y pruebas de base de datos |
| `powersync/` | Configuración de sincronización offline, un grupo de streams por módulo |
| `deploy/` | Despliegue del backend: compose, ejecución de migraciones y configuración de PowerSync |
| `design/` | Referencia visual y logotipos oficiales |
| `docs/decisions/` | Decisiones de arquitectura (ADR) |

**Regla de módulos** (según el [ADR 0003](docs/decisions/0003-modular-architecture.md)): un módulo se usa desde otros solo a través de su `index.ts`; `src/core/` nunca importa un módulo; el lint lo verifica en CI.

## Arranque rápido

Requisitos: Node.js con npm; Android Studio con el SDK y un emulador (o `eas build --profile development --platform android` si no hay toolchain local); Docker y la Supabase CLI para la base local. La app necesita un *development build* porque usa módulos nativos que Expo Go no incluye. Los pasos completos están en [`CONTRIBUTING.md`](CONTRIBUTING.md#running-the-app).

```bash
npm ci                                  # instalar dependencias
npx expo start --dev-client             # correr la app con el dev client
npm run typecheck                       # tipos
npm run lint                            # lint, incluye las reglas de módulos
npm test                                # pruebas
supabase db start && supabase test db   # base local y pruebas de base de datos
```

## Enlaces

- [`AGENTS.md`](AGENTS.md): punto de entrada para agentes de IA y comandos.
- [`CONTRIBUTING.md`](CONTRIBUTING.md): flujo de trabajo, ramas, commits, PR y Definition of Done.
- [`docs/RELEASING.md`](docs/RELEASING.md): versiones, publicación y Google Play (solo maintainer).
- [`design/README.md`](design/README.md): sistema de diseño visual.
- [`docs/decisions/`](docs/decisions/): decisiones de arquitectura.
- [`deploy/README.md`](deploy/README.md): despliegue del backend.
