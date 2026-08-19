/**
 * Puente entre `imaging/types.ts::ImageSource` (lo que carga la app) y
 * `pipeline/types.ts::GrayscaleImage` (lo que consumen los algoritmos del
 * pipeline). Necesita `OffscreenCanvas`/`document` — sólo se ejecuta en el
 * navegador o en el Web Worker del pipeline, nunca en las pruebas unitarias
 * de Node (`vitest.config.ts` usa `environment: 'node'`); por eso vive
 * separado de `preprocess.ts`, que sí se prueba ahí.
 */
import type { DicomImageSource, ImageSource, RasterImageSource } from '../imaging/types';
import type { GrayscaleImage } from './types';

function bitmapToGrayscale(source: RasterImageSource): GrayscaleImage {
  const { width, height, bitmap } = source;
  let ctx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null;
  if (typeof OffscreenCanvas !== 'undefined') {
    const canvas = new OffscreenCanvas(width, height);
    ctx = canvas.getContext('2d');
    ctx?.drawImage(bitmap, 0, 0);
  } else {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    ctx = canvas.getContext('2d');
    ctx?.drawImage(bitmap, 0, 0);
  }
  if (!ctx) throw new Error('No se pudo obtener un contexto 2D de canvas para convertir la imagen a escala de grises.');

  const { data } = ctx.getImageData(0, 0, width, height);
  const out = new Float32Array(width * height);
  // Luminancia perceptual estándar (Rec. 601): suficiente para radiografía
  // ya renderizada en escala de grises (R=G=B en la práctica).
  for (let i = 0; i < out.length; i++) {
    const r = data[i * 4]!;
    const g = data[i * 4 + 1]!;
    const b = data[i * 4 + 2]!;
    out[i] = 0.299 * r + 0.587 * g + 0.114 * b;
  }
  return { width, height, data: out };
}

function dicomToGrayscale(source: DicomImageSource): GrayscaleImage {
  // `pixelData` ya es un Float32Array fila por fila del mismo tamaño —
  // no hace falta canvas para este caso.
  return { width: source.width, height: source.height, data: source.pixelData };
}

export function toGrayscaleImage(source: ImageSource): GrayscaleImage {
  return source.kind === 'dicom' ? dicomToGrayscale(source) : bitmapToGrayscale(source);
}
