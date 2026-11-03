# Ficha de Google Play (BORRADOR)

> **BORRADOR.** Textos propuestos para la ficha de Play de la primera prueba interna. No son definitivos: los revisa y aprueba el maintainer antes de pegarlos en Play Console. No contienen nombres de escuelas, federaciones, ligas ni personas.

Límites de Play Console citados abajo: nombre 30 caracteres, descripción corta 80, descripción completa 4000 ([ayuda de Play Console](https://support.google.com/googleplay/android-developer/answer/9859152)). Verificar antes de publicar.

## Datos de la app

| Campo | Propuesta |
| --- | --- |
| Nombre de la app | TrailSkill |
| Idioma predeterminado | Español |
| Tipo | Aplicación |
| Gratuita o de pago | Gratuita |
| Categoría | Deportes |
| ID de la aplicación | `com.fatherapps.trailskill` (no se cambia) |
| Correo de contacto | PENDIENTE: lo define el maintainer |
| Sitio web | PENDIENTE: lo define el maintainer |
| URL de la política de privacidad | PENDIENTE: se publica después de la revisión legal de #106 |

## Descripción corta (máx. 80 caracteres)

```text
Desarrollo deportivo: tiempos, perfil y entrenamientos de tus nadadores.
```

## Descripción completa (máx. 4000 caracteres)

```text
TrailSkill acompaña el desarrollo de deportistas en escuelas y clubes. Empieza con natación.

PARA FAMILIAS Y DEPORTISTAS ADULTOS
• Registra a tu deportista (o a ti mismo) y autoriza, paso a paso y con tu propio consentimiento, qué datos se usan y para qué.
• Consulta el perfil, el historial de tiempos y la evolución de cada marca.
• Mira los entrenamientos planificados y envía una nota sobre una sesión.
• Puedes retirar una autorización cuando quieras.

PARA ENTRENADORES
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

Esta versión está en prueba. Si tienes una invitación, ingresa con tu correo: te enviaremos un código.
```

## Notas de la versión (prueba interna)

```text
Primera versión de prueba. Ingresa con el correo invitado y recibirás un código. Cuéntanos qué falla o qué no se entiende.
```

## Recursos gráficos

| Recurso | Estado |
| --- | --- |
| Icono de la app (512 × 512) | PENDIENTE: exportar del icono oficial (`assets/icon.png`, ver `design/README.md`) |
| Gráfico de funciones (1024 × 500) | PENDIENTE: lo prepara el maintainer con el logo oficial |
| Capturas de teléfono | PENDIENTE: usar datos sintéticos, nunca personas ni escuelas reales |
| Capturas de tableta (consola de escuela) | PENDIENTE: ídem |

## Declaraciones que Play pide además de la ficha

- **Cuestionario de clasificación de contenido:** PENDIENTE. No hay publicidad ni compras dentro de la app en el código actual; el maintainer confirma antes de responder.
- **Público objetivo:** PENDIENTE de la decisión del maintainer y asesoría legal (la app guarda datos de menores, aunque quienes la usan son adultos). Ver «Open decisions» en [`docs/RELEASING.md`](../RELEASING.md#open-decisions).
- **Anuncios:** la app no incluye SDK de publicidad (revisar `package.json` antes de declararlo).
- **Data safety:** ver [`data-safety.md`](data-safety.md).
