# Mensaje para testers de la prueba interna (BORRADOR)

> **BORRADOR.** Mensaje corto para enviar por WhatsApp o correo a cada tester. Antes de enviarlo, el maintainer reemplaza `<ENLACE DE UNIÓN>` por el enlace de aceptación (opt-in) de la prueba interna en Play Console y confirma que el ingreso con correo funciona (ver el paso 4 de [`docs/RELEASING.md`](../RELEASING.md#4-sign-in-settings-on-the-backend)); si no funciona, borra la línea de «Con tu correo». No pegues aquí correos ni datos reales de nadie.

## Texto para copiar

```text
Hola. Te invitamos a probar Swimcro antes de que salga a todo el mundo. Es una versión de prueba y tu opinión nos ayuda mucho.

CÓMO UNIRTE
1. Abre este enlace en tu celular Android, con la cuenta de Google que nos diste:
   <ENLACE DE UNIÓN>
2. Toca «Aceptar» o «Unirme a la prueba».
3. Toca el enlace «Descargar desde Google Play» que aparece después e instala Swimcro.
4. Abre Swimcro e ingresa:
   • Con Google: toca «Continuar con Google» y elige la misma cuenta.
   • Con tu correo: escribe tu correo y te llegará un código de 6 números (revisa también el spam).

Si Play dice «No se encontró el elemento», ábrelo otra vez con la cuenta de Google que nos diste.

QUÉ PROBAR
• Ingresar y volver a entrar al día siguiente.
• Crear el perfil de un nadador (o el tuyo, si eres deportista adulto) y aceptar las autorizaciones.
• Ver el perfil y los tiempos de un nadador.
• Medir un tiempo en «Mis tiempos» y guardarlo.
• Ver los entrenamientos planificados y dejar una nota.
• Cerrar el internet del celular, registrar un tiempo y volver a conectarlo: el tiempo debe aparecer sin perderse.
• Si eres entrenador o administrador de escuela: tomar tiempos con el cronómetro, asignar llegadas e invitar a una familia con el enlace (mejor en una tableta).

IMPORTANTE
• Es una versión de prueba: usa nombres y datos inventados, no registres datos reales de ninguna persona, y menos de menores.
• Lo que registres ahora no pasará a la versión final: se borrará cuando salga.
• No hay logo definitivo todavía; no lo reportes como error.

CÓMO CONTARNOS QUÉ FALLÓ
Escríbenos a <CANAL DE CONTACTO> con: qué estabas haciendo, qué esperabas y qué pasó. Una captura de pantalla ayuda mucho. Dinos también tu modelo de celular.

Gracias por ayudarnos.
```

## Notas para quien lo envía

- `<ENLACE DE UNIÓN>`: Play Console → Pruebas → Prueba interna → Testers → copiar enlace. Play lo muestra cuando la versión ya está publicada ([RELEASING.md, paso 8](../RELEASING.md#8-testers-and-opt-in-link)).
- `<CANAL DE CONTACTO>`: PENDIENTE, lo define el maintainer.
- La cuenta de Google de cada tester debe estar en la lista de testers de Play y, si la pantalla de consentimiento de Google está en «Testing», también como usuario de prueba.
- «Lo que registres ahora no pasará a la versión final»: refleja que la primera versión apunta al entorno de pruebas (QA) y que el entorno final (PROD) empieza vacío; si el maintainer cambia esa decisión, corregir esta línea.
