# Kit multimedia

Extensión de Chrome (Manifest V3) que reúne en una sola pestaña herramientas para imágenes, audio y vídeo. El procesado se hace en el propio navegador.

## Qué hace

**Imágenes**
- Carga imágenes desde archivos, pegándolas, o desde la web de origen.
- Iguala las medidas de salida (recortar para llenar, encajar con bandas de color o estirar).
- Exporta en WebP, JPEG o PNG, con ajuste de calidad y peso.
- Vista de comparación (lado a lado y zoom 1:1) y descarga de todo en un ZIP.

**Audio y vídeo**
- Extrae el audio a MP3 (128 a 320 kbps) o WAV.
- Convierte vídeo a GIF animado.
- Saca fotogramas de un vídeo como imágenes (JPEG o PNG).
- Comprime, recorta o cambia el formato del vídeo (MP4 o WebM).
- Descarga los resultados en un ZIP.

**Desde enlaces**
- Descarga archivos por enlace tal cual.
- Descarga y extrae el audio en MP3.
- Carga los archivos en las otras pestañas para procesarlos.
- Busca vídeos y audios en la web de origen.

## Instalación (modo desarrollador)

1. Descarga o clona este repositorio.
2. Abre `chrome://extensions`.
3. Activa **Modo de desarrollador** (arriba a la derecha).
4. Pulsa **Cargar descomprimida** y elige la carpeta del proyecto (la que contiene el archivo `manifest.json`).
5. Pulsa el icono de la extensión para abrir el Kit en una pestaña nueva.

## Permisos

| Permiso | Uso |
|---|---|
| `activeTab` | Acceso a la pestaña desde la que abres el Kit. |
| `scripting` | Leer imágenes, vídeos y audios de esa web. |
| `host_permissions` (`<all_urls>`) | Descargar archivos por enlace desde cualquier dominio. |

## Librerías de terceros

En la carpeta `vendor/` se incluyen `lame.min.js` (codificación MP3) y `gifenc` (creación de GIF).

## Estado

Proyecto personal. Solo funciona en modo desarrollador; no está publicado en la Chrome Web Store.