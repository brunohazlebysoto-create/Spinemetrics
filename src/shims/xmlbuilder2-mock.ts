/**
 * Sustituto vacío de `xmlbuilder2` para el bundle del navegador.
 *
 * `@cornerstonejs/core` depende de `@kitware/vtk.js` (motor de render 3D
 * que usa internamente para volúmenes, no para nuestro uso — sólo
 * llamamos a `imageLoader.loadImage`, nunca a `RenderingEngine`), y una de
 * las rutas de exportación XML de vtk.js importa `xmlbuilder2`. Ese
 * paquete usa una jerarquía de clases pensada para Node que revienta al
 * evaluarse en el navegador (`class extends value undefined`) incluso sin
 * llamarlo — el error salta con sólo importar el módulo.
 *
 * Como SpineMetrics nunca usa esa ruta de exportación XML, se sustituye
 * por este stub inerte vía `resolve.alias` en `vite.config.ts`: evita que
 * el bundle intente evaluar el código roto, sin tocar la funcionalidad
 * DICOM real que sí usamos.
 */
function unavailable(): never {
  throw new Error('xmlbuilder2 no está disponible en el navegador (no se usa la exportación XML de vtk.js en SpineMetrics).');
}

export function create(): never {
  return unavailable();
}

export default { create: unavailable };
