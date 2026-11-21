# Ficha de Google Play (BORRADOR)

> **BORRADOR.** Textos propuestos para la ficha de Play de la primera prueba interna. No son definitivos: los revisa y aprueba el maintainer antes de pegarlos en Play Console. No contienen nombres de escuelas, federaciones, ligas ni personas.

Límites de Play Console citados abajo: nombre 30 caracteres, descripción corta 80, descripción completa 4000 ([ayuda de Play Console](https://support.google.com/googleplay/android-developer/answer/9859152)). Verificar antes de publicar.

## Datos de la app

| Campo | Propuesta |
| --- | --- |
| Nombre de la app | Swimcro |
| Idioma predeterminado | Español |
| Tipo | Aplicación |
| Gratuita o de pago | Gratuita |
| Categoría | Deportes |
| ID de la aplicación | `com.fatherapps.swimcro` (no se cambia) |
| Correo de contacto | soporte@fatherapps.com (único canal de contacto, derechos y eliminación; decisión de Mario, 2026-11-20) |
| Sitio web | PENDIENTE: lo define el maintainer |
| URL de la política de privacidad | `https://fatherapps.github.io/trailskill/privacidad/` (publicada con GitHub Pages desde [`privacy-policy.es.md`](privacy-policy.es.md), #1240) |
| URL para pedir la eliminación de la cuenta y los datos (Play la pide en «Seguridad de los datos») | `https://fatherapps.github.io/trailskill/eliminar-cuenta/` (pasos, 30 días, cancelar y solicitud por correo a soporte@fatherapps.com; #1245) |

## Descripción corta (máx. 80 caracteres)

```text
Desarrollo deportivo: tiempos, perfil y entrenamientos de tus nadadores.
```

## Descripción completa (máx. 4000 caracteres)

```text
Swimcro acompaña el desarrollo de deportistas en escuelas y clubes. Empieza con natación.

PARA FAMILIAS Y DEPORTISTAS ADULTOS
• Registra a tu deportista (o a ti mismo) y autoriza, paso a paso y con tu propio consentimiento, qué datos se usan y para qué.
• Consulta el perfil, el historial de tiempos y la evolución de cada marca.
• Mira los entrenamientos planificados y envía una nota sobre una sesión.
• Puedes retirar una autorización cuando quieras.
• Mide tus propios tiempos, uno a uno o por serie.
• Cada nadador tiene un código para compartir tiempos con otras familias; solo muestra su nombre corto y lo puedes cambiar cuando quieras.

PARA ENTRENADORES
• Consulta los nadadores que tienes asignados.
• Toma tiempos con el cronómetro en pantalla o con un botón externo, incluso sin conexión.
• Asigna las llegadas a cada deportista y guarda los parciales.
• Consulta los entrenamientos planificados y registra su cumplimiento.

PARA ADMINISTRADORES DE ESCUELA
• Organiza la escuela: categorías, grupos y entrenadores.
• Invita a las familias con un enlace.
• Planifica entrenamientos por bloques y versiones.

FUNCIONA SIN CONEXIÓN
Lo que registras se guarda en el teléfono o la tableta y se sincroniza cuando vuelve la conexión. Un tiempo que falta nunca se muestra como cero.

TU INFORMACIÓN, BAJO TU CONTROL
Cada persona ve solo lo que su rol permite. Los datos de los deportistas se usan únicamente para los fines que la familia o el deportista autorizó.

Esta versión está en prueba. Si tienes una invitación, ingresa con tu correo (te enviaremos un código) o con tu cuenta de Google.
```

## Notas de la versión (prueba interna)

```text
Primera versión de prueba. Ingresa con tu cuenta de Google o con tu correo (recibirás un código). Cuéntanos qué falla o qué no se entiende.
```

## Recursos gráficos

| Recurso | Estado |
| --- | --- |
| Icono de la app (512 × 512) | LISTO: `design/assets/logos/swimcro-play-icon-512.png` (ver `design/README.md`) |
| Gráfico de funciones (1024 × 500) | PENDIENTE: lo prepara el maintainer con el logo oficial |
| Capturas de teléfono | PENDIENTE: usar datos sintéticos, nunca personas ni escuelas reales |
| Capturas de tableta (consola de escuela) | PENDIENTE: ídem |

## Qué pide Play y cuándo

Revisado el 2026-11-16 contra la app y [`docs/RELEASING.md`](../RELEASING.md#what-play-asks-track-by-track). Para la **prueba interna** Play no exige la ficha ni las declaraciones de abajo: basta con crear la app, subir el paquete (AAB, API de destino 36 o superior) y la lista de testers ([ayuda de Play Console](https://support.google.com/googleplay/android-developer/answer/9845334)). Todo lo de esta página es necesario antes de la **prueba cerrada**; el texto de la descripción y las notas de la versión sí se pueden pegar ya en la prueba interna.

| Elemento | Prueba interna | Prueba cerrada |
| --- | --- | --- |
| Descripción, icono, gráficos y capturas | No | Sí |
| URL de la política de privacidad (versión básica publicada, #1240; la revisión legal de #106 sigue abierta) | No | Sí |
| Data safety | No | Sí |
| Cuestionario de clasificación y público objetivo | No | Sí |
| Acceso a la app para revisores | No | Sí |
| Vía para pedir la eliminación de datos | No | Sí |

## Declaraciones que Play pide además de la ficha

- **Cuestionario de clasificación de contenido:** PENDIENTE. No hay publicidad ni compras dentro de la app en el código actual; el maintainer confirma antes de responder.
- **Público objetivo:** PENDIENTE de la decisión del maintainer y asesoría legal (la app guarda datos de menores, aunque quienes la usan son adultos). Ver «Open decisions» en [`docs/RELEASING.md`](../RELEASING.md#open-decisions).
- **Anuncios:** la app no incluye SDK de publicidad (revisar `package.json` antes de declararlo).
- **Data safety:** ver [`data-safety.md`](data-safety.md).
- **Ingreso con Microsoft:** a confirmar por Mario si funciona en producción. Los textos de arriba solo mencionan el correo y Google; no agregar Microsoft hasta que él lo confirme.
