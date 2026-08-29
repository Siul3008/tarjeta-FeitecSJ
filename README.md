# FESTEC SJ 2026 · Tarjeta de fidelidad

Aplicación mobile-first para clientes y encargados, publicada en GitHub Pages y conectada a Google Sheets mediante Google Apps Script.

## Qué incluye

- Registro e inicio de sesión.
- Código `FST-XXXXXXXX` único, creado únicamente en el backend.
- QR que contiene solo el código del cliente.
- Vista de cliente de solo lectura con 10 sellos.
- Vista de encargado con cámara, búsqueda manual y botón para agregar sellos.
- Contraseñas con salt individual, pepper privado e iteraciones SHA-256; nunca se guardan en texto plano.
- Sesiones de 12 horas y auditoría de cada sello agregado.
- Bloqueo para evitar códigos duplicados o dos actualizaciones simultáneas.

## 1. Crear y preparar Google Sheets

1. Crea una hoja de cálculo vacía.
2. Copia el identificador que aparece entre `/d/` y `/edit` en su URL.
3. En [Google Apps Script](https://script.google.com/), crea un proyecto independiente.
4. Copia `apps-script/Code.gs` y `apps-script/appsscript.json` al proyecto.
5. En **Configuración del proyecto → Propiedades de la secuencia de comandos**, agrega:
   - `SPREADSHEET_ID`: identificador copiado en el paso 2.
   - `ADMIN_EMAIL`: correo inicial del encargado.
   - `ADMIN_PASSWORD`: contraseña inicial de al menos 8 caracteres.
6. Ejecuta manualmente la función `setup` y acepta los permisos. Esta crea las hojas `Usuarios`, `Sesiones` y `Auditoria`, genera el secreto privado y crea el encargado. La propiedad `ADMIN_PASSWORD` se elimina después de crear la cuenta.

La hoja `Usuarios` tendrá estas columnas:

| id | nombre | correo | passwordHash | salt | codigo | sellos | rol | creadoEn |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |

No cambies los nombres ni el orden de esas columnas.

## 2. Publicar Apps Script

1. Selecciona **Implementar → Nueva implementación → Aplicación web**.
2. En **Ejecutar como**, selecciona **Yo**.
3. En **Quién tiene acceso**, selecciona **Cualquier usuario**.
4. Publica y copia la URL que termina en `/exec` (no la URL `/dev`).
5. En `script.js`, reemplaza `PEGA_AQUI_LA_URL_DE_APPS_SCRIPT` por esa URL.

Aunque el endpoint sea público, las operaciones protegidas requieren una sesión válida y `addStamp` además exige el rol `encargado` en el servidor.

## 3. Publicar la web

Sube los cambios a la rama configurada en GitHub Pages. La cámara requiere HTTPS; GitHub Pages ya lo proporciona. Si actualizas Apps Script, crea una versión nueva de la implementación. Si actualizas la web y ves la versión anterior, cierra y vuelve a abrir la PWA para que el Service Worker renueve la caché.

## Archivos principales

- `index.html`: pantallas de acceso, cliente y encargado.
- `styles.css`: interfaz responsive y línea gráfica FESTEC.
- `script.js`: comunicación con el backend, QR y lector de cámara.
- `apps-script/Code.gs`: autenticación, códigos, sesiones y sellos.
- `apps-script/appsscript.json`: configuración del proyecto Apps Script.
- `sw.js`: caché de la interfaz; las llamadas al backend siempre van a la red.

## Seguridad operativa

- Protege el acceso de edición a Google Sheets y Apps Script.
- Usa una contraseña exclusiva para cada encargado.
- No compartas tokens, hashes, salts ni el pepper.
- Para agregar otro encargado, cambia temporalmente `ADMIN_EMAIL`, define `ADMIN_PASSWORD`, ejecuta `setup` y confirma que `ADMIN_PASSWORD` desapareció.
- La tarjeta se detiene en 10 sellos. Un nuevo ciclo debe definirse explícitamente antes de reiniciar datos.
