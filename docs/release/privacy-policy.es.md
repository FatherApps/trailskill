# Política de privacidad de Swimcro (BORRADOR)

> **BORRADOR. No publicar.** Texto propuesto a partir de lo que la app guarda hoy (ver [`data-safety.md`](data-safety.md), que cita tablas y módulos). **Lo valida la revisión legal de #106** antes de publicarse en una URL pública y de pegarse en Play Console. Los campos marcados PENDIENTE los define el maintainer. No contiene nombres de escuelas, federaciones, ligas ni personas.

**Última actualización:** PENDIENTE (fecha de publicación)

## 1. Quién es responsable

PENDIENTE: nombre o razón social, documento de identificación, dirección y correo de contacto de quien responde por el tratamiento de los datos. El maintainer lo define y lo valida la revisión legal.

## 2. A quién se aplica

Esta política cubre a quienes usan Swimcro: familias (acudientes), deportistas adultos, entrenadores y administradores de escuela. La aplicación guarda datos de deportistas que pueden ser menores de edad; esos datos los registra y autoriza su acudiente, o el propio deportista si es adulto.

## 3. Qué datos recogemos

| Dato | De quién | Para qué se usa |
| --- | --- | --- |
| Correo electrónico | Toda persona que ingresa | Enviarle el código de ingreso e identificar su cuenta; si ingresa con Google u otro proveedor, lo recibimos de ese proveedor |
| Nombre y apellido | Acudientes y deportistas adultos | Identificar la cuenta |
| Nombre y apellido del deportista | Deportista | Mostrar su perfil y asignar tiempos y entrenamientos |
| Número de identificación del deportista (opcional) | Deportista | Importar sus resultados oficiales cuando la familia lo autoriza |
| Escuela, categoría y grupo del deportista; quién lo acompaña como acudiente o entrenador | Deportista, acudiente, personal de la escuela | Organizar la escuela y decidir quién puede ver qué |
| Tiempos de entrenamientos y competencias (estilo, distancia, piscina, fecha y hora de captura) | Deportista | Su historial y su evolución |
| Tiempos que una familia o un deportista adulto mide por su cuenta («Mis tiempos»), con parciales y, si lo escribe, el tiempo oficial | Acudiente o deportista adulto | Su historial personal; solo lo ve quien lo midió |
| Código para compartir de cada deportista y registro de las consultas de un código (quién, cuándo y si coincidió; se conserva un día) | Deportista, usuario que consulta | Que otra familia pueda enviar tiempos medidos para ese deportista, y limitar los intentos fallidos |
| Tiempos enviados a otra familia (copia del tiempo, quién lo envía, a qué deportista y si se aceptó) | Deportista, acudiente que envía | Entregar el tiempo a la familia que lo acepta; una solicitud sin respuesta se cierra a los 30 días |
| Correo de un entrenador invitado, estado de la invitación, vencimiento (14 días) y quién la aceptó | Entrenador invitado | Que solo esa persona entre como entrenador de la escuela; solo lo leen los administradores de la escuela |
| Enlace de invitación de una familia (contiene un código aleatorio, sin nombre ni correo) | Familia invitada | Que la familia cree el perfil de su deportista en la escuela |
| Entrenamientos planificados y si se cumplieron | Deportista | Seguimiento del entrenamiento |
| Notas que escribe una familia sobre una sesión (hasta 500 caracteres) | Deportista | Comunicarse con el entrenador sobre esa sesión |
| Autorizaciones que se aceptan o se retiran, con el texto, su versión y la fecha | Acudiente o deportista adulto | Dejar constancia de qué se autorizó y para qué |
| Resultados oficiales importados y su origen | Deportista | Completar el historial, solo si hay autorización |
| Identificador del dispositivo generado por la app | Dispositivo | Distinguir registros hechos en dispositivos distintos y resolver conflictos |

No recogemos ubicación, fotos, contactos, micrófono ni identificadores publicitarios, y no usamos publicidad ni herramientas de analítica de terceros.

## 4. Para qué usamos los datos

- Permitir el ingreso con un código enviado al correo o con una cuenta de Google.
- Registrar tiempos, mostrar historiales y gestionar entrenamientos.
- Mostrar a cada persona solo lo que su rol permite: las reglas de acceso las aplica el servidor, no solo la pantalla.
- Importar resultados oficiales cuando el acudiente o el deportista adulto lo autoriza.

No vendemos datos ni los usamos para publicidad.

## 5. Autorización y retiro

Para cada deportista, el acudiente (o el propio deportista adulto) acepta de forma separada cada finalidad: registrar tiempos, importar resultados oficiales y compartir resultados con la escuela. Puede **retirar** cada autorización desde la aplicación en cualquier momento. Al retirarla, el dato deja de usarse para esa finalidad.

## 6. Con quién se comparten los datos

- **Escuela del deportista:** su personal ve los datos de los deportistas de su escuela, según su rol (administrador o entrenador), y los administradores ven además el nombre y el correo de contacto de los acudientes de sus deportistas y de los entrenadores de la escuela. Compartir los resultados con la escuela requiere su propia autorización: la familia ve un tiempo de la escuela solo si la escuela lo comparte con ella. Un entrenador al que la escuela desactiva deja de ver los datos de esa escuela.
- **Otra familia:** si un acudiente da el código de su deportista a otra familia, esa familia solo ve el nombre corto del deportista («Ana M.»), y puede enviarle tiempos que el acudiente decide aceptar. Puede cambiar el código en cualquier momento, y el anterior deja de servir.
- **Fuente de resultados oficiales:** si se usa «Importar resultados oficiales», enviamos el nombre del deportista y, si la familia lo registró, su número de identificación a la fuente oficial que se elija para buscar sus resultados, solo con autorización. PENDIENTE de revisión legal: confirmar cómo se describe esta transferencia.
- **Proveedores de servicios:** el alojamiento de los datos y el envío del correo con el código se hacen con proveedores que tratan los datos por nuestra cuenta y solo para prestar el servicio. El correo con el código lo envía Resend (confirmado por el maintainer el 2026-11-15). Si la persona ingresa con Google, Google le pide autorización y nos entrega su correo (y su nombre, si lo devuelve). PENDIENTE: nombrar al proveedor de alojamiento y el país donde se alojan los datos, y revisar con la asesoría legal los términos de cada proveedor.

No compartimos datos con nadie más, salvo que una autoridad competente lo exija conforme a la ley.

## 7. Menores de edad

Los datos de menores los registra y autoriza su acudiente. Tratamos los datos de menores únicamente para las finalidades de la sección 4. PENDIENTE: la revisión legal define cómo se describen los derechos de los menores y la declaración de público objetivo en Play.

## 8. Seguridad

- La comunicación entre la aplicación y los servidores va cifrada (HTTPS).
- La copia local de los datos en el dispositivo está cifrada, y el número de identificación del deportista se guarda cifrado en el servidor.
- Cada persona accede solo a los datos que su rol permite.

Ningún sistema es infalible; si ocurre un incidente que afecte tus datos, avisaremos según lo exige la ley. PENDIENTE: procedimiento y canal de aviso.

## 9. Cuánto tiempo los guardamos

PENDIENTE: el producto aún no define plazos de conservación. Mientras se define, los datos se guardan mientras la cuenta esté activa. La revisión legal fija los plazos y el maintainer los implementa.

## 10. Tus derechos

Puedes conocer, actualizar, rectificar y pedir la supresión de tus datos, y revocar las autorizaciones que diste, en los términos de la legislación aplicable (por ejemplo, la Ley 1581 de 2012 de Colombia; PENDIENTE de confirmación legal). Para ejercerlos escribe a PENDIENTE (correo de contacto). PENDIENTE: la aplicación no tiene aún una opción para borrar la cuenta; mientras tanto la solicitud se atiende por correo, y Play exige además una vía de eliminación dentro de la app y en la web.

## 11. Cambios en esta política

Si cambia lo que la aplicación guarda o para qué lo usa, actualizaremos esta política y la fecha de arriba, y PENDIENTE: se define cómo se avisa a los usuarios cuando el cambio requiera una nueva autorización.

## 12. Contacto

PENDIENTE: correo y dirección de contacto del responsable.
