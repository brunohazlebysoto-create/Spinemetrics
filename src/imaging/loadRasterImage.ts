/**
 * Carga de PNG/JPEG/TIFF. SPEC.md §2.1. Los navegadores decodifican PNG y
 * JPEG de forma nativa (`createImageBitmap`); TIFF no tiene soporte nativo
 * en ningún navegador y se decodifica con UTIF.js (paquete `utif2`), una
 * librería pura en JS sin llamadas de red (SPEC.md §11).
 *
 * La parte de decodificación TIFF en sí (`decodeTiffToRgba`) es pura y no
 * usa DOM, así que se puede probar con Vitest en Node; el resto de esta
 * unidad depende de `File`/`createImageBitmap`/`OffscreenCanvas` y sólo se
 * ejerce en el navegador (verificado con la skill `run`, no con Vitest).
 */
import * as UTIF from 'utif2';
import type { RasterImageSource } from './types';

const TIFF_MIME_TYPES = new Set(['image/tiff', 'image/tif']);

export function isTiffFile(name: string, mimeType: string): boolean {
  if (TIFF_MIME_TYPES.has(mimeType)) return true;
  const lower = name.toLowerCase();
  return lower.endsWith('.tif') || lower.endsWith('.tiff');
}

export interface DecodedRgba {
  width: number;
  height: number;
  /** RGBA, 8 bits por canal, listo para `ImageData`/`putImageData`. Se
   * copia a un `ArrayBuffer` propio (no `ArrayBufferLike`/`SharedArrayBuffer`)
   * porque es lo único que acepta el constructor de `ImageData`. */
  rgba: Uint8ClampedArray<ArrayBuffer>;
}

/** Decodifica el primer fotograma de un TIFF a RGBA8. Pura: sin DOM. */
export function decodeTiffToRgba(buffer: ArrayBuffer): DecodedRgba {
  const ifds = UTIF.decode(buffer);
  const first = ifds[0];
  if (!first) throw new Error('El archivo TIFF no contiene ninguna imagen decodificable.');
  UTIF.decodeImage(buffer, first);
  if (!first.width || !first.height) {
    throw new Error('El archivo TIFF está corrupto o no contiene ninguna imagen decodificable.');
  }
  const rgba = UTIF.toRGBA8(first);
  const copy = new Uint8ClampedArray(new ArrayBuffer(rgba.length));
  copy.set(rgba);
  return { width: first.width, height: first.height, rgba: copy };
}

async function rgbaToBitmap(decoded: DecodedRgba): Promise<ImageBitmap> {
  const imageData = new ImageData(decoded.rgba, decoded.width, decoded.height);
  return createImageBitmap(imageData);
}

/** SPEC.md §2.1: "Cargar [...] PNG/JPEG/TIFF." */
export async function loadRasterImage(file: File): Promise<RasterImageSource> {
  if (isTiffFile(file.name, file.type)) {
    const buffer = await file.arrayBuffer();
    const decoded = decodeTiffToRgba(buffer);
    const bitmap = await rgbaToBitmap(decoded);
    return { kind: 'raster', bitmap, width: decoded.width, height: decoded.height };
  }

  const bitmap = await createImageBitmap(file);
  return { kind: 'raster', bitmap, width: bitmap.width, height: bitmap.height };
}
