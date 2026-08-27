# Tarjeta de Fidelidad

Proyecto web mobile-first inspirado en la tarjeta mostrada en la referencia.

## Archivos

- `index.html`: estructura de la interfaz.
- `styles.css`: diseño responsive.
- `script.js`: sellos, cliente y localStorage.
- `sw.js`: caché/offline.
- `manifest.json`: configuración básica PWA.
- `img/logo.png`: logo de ejemplo.

## Cómo probar

Los Service Workers no funcionan correctamente abriendo `index.html` directamente con `file://`.

Usa un servidor local, por ejemplo:

```bash
python3 -m http.server 8000
```

Luego abre:

```text
http://localhost:8000
```

## Personalización

Reemplaza `img/logo.png` por el logo real del negocio manteniendo el mismo nombre,
o cambia la ruta en `index.html` y `manifest.json`.

Los sellos se guardan con `localStorage`, así que permanecen en el mismo navegador/dispositivo.
