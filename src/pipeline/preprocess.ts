/**
 * Preprocesado de imagen. SPEC.md §8 Etapa 2: "Normalización de intensidad,
 * CLAHE para realzar bordes corticales, detección de la ROI de la columna,
 * remuestreo a la resolución de entrada del modelo. Conservar la
 * transformación afín."
 *
 * Espejo en TypeScript de `training/spinemetrics_training/preprocess.py`
 * (mismo algoritmo de detección de ROI y de remuestreo con transformación
 * afín) para que el comportamiento de entrenamiento e inferencia se pueda
 * auditar en paralelo. Opera sobre `GrayscaleImage` puro (sin `ImageBitmap`
 * ni canvas) para poder probarse en Node — ver `pipeline/types.ts`.
 */
import type { AffineTransform2D, GrayscaleImage, SpineRoi } from './types';
import { composeAffine } from './types';

/** Normaliza a `[0, 1]` recortando por percentiles (robusto a saturación/
 * aire), igual que `preprocess.normalize_intensity` en Python. */
export function normalizeIntensity(image: GrayscaleImage, lowPercentile = 1, highPercentile = 99): GrayscaleImage {
  const sorted = Float32Array.from(image.data).sort();
  const low = percentile(sorted, lowPercentile);
  const high = percentile(sorted, highPercentile);

  const out = new Float32Array(image.data.length);
  if (high <= low) {
    return { width: image.width, height: image.height, data: out };
  }
  const range = high - low;
  for (let i = 0; i < image.data.length; i++) {
    const v = (image.data[i]! - low) / range;
    out[i] = v < 0 ? 0 : v > 1 ? 1 : v;
  }
  return { width: image.width, height: image.height, data: out };
}

/** Percentil sobre un array YA ordenado ascendentemente, por interpolación
 * lineal entre los dos índices más cercanos (método "linear" de numpy, el
 * mismo que usa `np.percentile` en `training/preprocess.py`). */
function percentile(sortedData: Float32Array, p: number): number {
  if (sortedData.length === 0) return 0;
  if (sortedData.length === 1) return sortedData[0]!;
  const rank = (p / 100) * (sortedData.length - 1);
  const lowerIndex = Math.floor(rank);
  const upperIndex = Math.ceil(rank);
  if (lowerIndex === upperIndex) return sortedData[lowerIndex]!;
  const t = rank - lowerIndex;
  return sortedData[lowerIndex]! * (1 - t) + sortedData[upperIndex]! * t;
}

/**
 * CLAHE (contrast-limited adaptive histogram equalization) implementado
 * directamente sobre `GrayscaleImage` (sin OpenCV.js, para no añadir una
 * dependencia nativa pesada al bundle del navegador). Espera una imagen ya
 * normalizada a `[0, 1]` (ver `normalizeIntensity`); devuelve otra en
 * `[0, 1]`. Algoritmo estándar: histograma por mosaico con recorte y
 * redistribución del exceso, interpolación bilineal entre los cuatro
 * mosaicos más cercanos a cada píxel.
 */
export function applyClahe(image: GrayscaleImage, tilesX = 8, tilesY = 8, clipLimit = 2.0): GrayscaleImage {
  const { width, height, data } = image;
  const bins = 256;
  const tileWidth = Math.max(1, Math.ceil(width / tilesX));
  const tileHeight = Math.max(1, Math.ceil(height / tilesY));
  const numTilesX = Math.ceil(width / tileWidth);
  const numTilesY = Math.ceil(height / tileHeight);

  // Un lookup table (CDF recortada, 256 valores en [0,1]) por mosaico.
  const luts: Float32Array[][] = [];
  for (let ty = 0; ty < numTilesY; ty++) {
    const row: Float32Array[] = [];
    for (let tx = 0; tx < numTilesX; tx++) {
      row.push(buildTileLut(data, width, tx * tileWidth, ty * tileHeight, tileWidth, tileHeight, width, height, bins, clipLimit));
    }
    luts.push(row);
  }

  const out = new Float32Array(data.length);
  for (let y = 0; y < height; y++) {
    // Centro del mosaico más cercano a cada lado, en coordenadas de mosaico continuas.
    const ty = (y - tileHeight / 2) / tileHeight;
    const ty0 = clampInt(Math.floor(ty), 0, numTilesY - 1);
    const ty1 = clampInt(ty0 + 1, 0, numTilesY - 1);
    const fy = clamp01(ty - ty0);

    for (let x = 0; x < width; x++) {
      const tx = (x - tileWidth / 2) / tileWidth;
      const tx0 = clampInt(Math.floor(tx), 0, numTilesX - 1);
      const tx1 = clampInt(tx0 + 1, 0, numTilesX - 1);
      const fx = clamp01(tx - tx0);

      const bin = clampInt(Math.round(data[y * width + x]! * (bins - 1)), 0, bins - 1);
      const v00 = luts[ty0]![tx0]![bin]!;
      const v01 = luts[ty0]![tx1]![bin]!;
      const v10 = luts[ty1]![tx0]![bin]!;
      const v11 = luts[ty1]![tx1]![bin]!;
      const top = v00 * (1 - fx) + v01 * fx;
      const bottom = v10 * (1 - fx) + v11 * fx;
      out[y * width + x] = top * (1 - fy) + bottom * fy;
    }
  }

  return { width, height, data: out };
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
function clampInt(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function buildTileLut(
  data: Float32Array,
  imageWidth: number,
  x0: number,
  y0: number,
  tileWidth: number,
  tileHeight: number,
  imageBoundWidth: number,
  imageBoundHeight: number,
  bins: number,
  clipLimit: number,
): Float32Array {
  const x1 = Math.min(x0 + tileWidth, imageBoundWidth);
  const y1 = Math.min(y0 + tileHeight, imageBoundHeight);
  const histogram = new Float64Array(bins);
  let count = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const bin = clampInt(Math.round(data[y * imageWidth + x]! * (bins - 1)), 0, bins - 1);
      histogram[bin]! += 1;
      count += 1;
    }
  }
  if (count === 0) {
    const identity = new Float32Array(bins);
    for (let i = 0; i < bins; i++) identity[i] = i / (bins - 1);
    return identity;
  }

  // Recorte del histograma (contrast limiting) y redistribución uniforme
  // del exceso entre todos los bins, como el CLAHE estándar.
  const clip = Math.max(1, clipLimit * (count / bins));
  let excess = 0;
  for (let i = 0; i < bins; i++) {
    if (histogram[i]! > clip) {
      excess += histogram[i]! - clip;
      histogram[i] = clip;
    }
  }
  const redistribution = excess / bins;
  for (let i = 0; i < bins; i++) histogram[i]! += redistribution;

  const lut = new Float32Array(bins);
  let cumulative = 0;
  const total = count;
  for (let i = 0; i < bins; i++) {
    cumulative += histogram[i]!;
    lut[i] = cumulative / total;
  }
  return lut;
}

/**
 * Heurístico de referencia: conserva la banda de columnas con mayor
 * varianza de intensidad, con un margen. **No** es el detector de ROI final
 * (exigiría su propio modelo entrenado) — ver `training/preprocess.py`,
 * mismo algoritmo, mismo motivo documentado allí.
 */
export function detectSpineRoi(image: GrayscaleImage, minWidthFraction = 0.3, marginFraction = 0.15): SpineRoi {
  const { width, height, data } = image;
  const columnVariance = new Float64Array(width);
  for (let x = 0; x < width; x++) {
    let sum = 0;
    let sumSq = 0;
    for (let y = 0; y < height; y++) {
      const v = data[y * width + x]!;
      sum += v;
      sumSq += v * v;
    }
    const mean = sum / height;
    columnVariance[x] = sumSq / height - mean * mean;
  }

  let maxVariance = 0;
  for (let x = 0; x < width; x++) if (columnVariance[x]! > maxVariance) maxVariance = columnVariance[x]!;
  const threshold = maxVariance * 0.2;

  let firstActive = -1;
  let lastActive = -1;
  for (let x = 0; x < width; x++) {
    if (columnVariance[x]! >= threshold) {
      if (firstActive === -1) firstActive = x;
      lastActive = x;
    }
  }
  if (firstActive === -1) {
    return { x0: 0, y0: 0, x1: width, y1: height };
  }

  let x0 = firstActive;
  let x1 = lastActive + 1;
  const margin = Math.floor((x1 - x0) * marginFraction);
  x0 = Math.max(0, x0 - margin);
  x1 = Math.min(width, x1 + margin);

  const minWidth = Math.floor(width * minWidthFraction);
  if (x1 - x0 < minWidth) {
    const center = Math.floor((x0 + x1) / 2);
    x0 = Math.max(0, center - Math.floor(minWidth / 2));
    x1 = Math.min(width, x0 + minWidth);
  }

  return { x0, y0: 0, x1, y1: height };
}

export interface ResampleResult {
  image: GrayscaleImage;
  transform: AffineTransform2D;
}

/**
 * Recorta a `roi` y remuestrea a `targetWidth × targetHeight` por
 * interpolación bilineal, devolviendo la `AffineTransform2D` que mapea el
 * espacio original al remuestreado (SPEC.md §8 Etapa 2). Mismo contrato que
 * `training/preprocess.py::resample_with_affine`.
 */
export function resampleWithAffine(image: GrayscaleImage, roi: SpineRoi, targetWidth: number, targetHeight: number): ResampleResult {
  const croppedWidth = roi.x1 - roi.x0;
  const croppedHeight = roi.y1 - roi.y0;
  if (croppedWidth <= 0 || croppedHeight <= 0) {
    throw new Error(`ROI vacía: ${JSON.stringify(roi)} sobre una imagen de ${image.width}x${image.height}.`);
  }

  const scaleX = targetWidth / croppedWidth;
  const scaleY = targetHeight / croppedHeight;
  const out = new Float32Array(targetWidth * targetHeight);

  for (let ty = 0; ty < targetHeight; ty++) {
    // Coordenada correspondiente en el espacio recortado (centro de píxel).
    const srcYCrop = (ty + 0.5) / scaleY - 0.5;
    const srcY = clampInt(Math.round(roi.y0 + srcYCrop), roi.y0, roi.y1 - 1);
    for (let tx = 0; tx < targetWidth; tx++) {
      const srcXCrop = (tx + 0.5) / scaleX - 0.5;
      const srcX = clampInt(Math.round(roi.x0 + srcXCrop), roi.x0, roi.x1 - 1);
      out[ty * targetWidth + tx] = bilinearSample(image, roi.x0 + srcXCrop, roi.y0 + srcYCrop, srcX, srcY);
    }
  }

  const cropTransform: AffineTransform2D = { scaleX: 1, scaleY: 1, offsetX: -roi.x0, offsetY: -roi.y0 };
  const resizeTransform: AffineTransform2D = { scaleX, scaleY, offsetX: 0, offsetY: 0 };
  return { image: { width: targetWidth, height: targetHeight, data: out }, transform: composeAffine(cropTransform, resizeTransform) };
}

/** Muestreo bilineal con `(fallbackX, fallbackY)` como respaldo cuando las
 * coordenadas continuas caen fuera de los límites de la imagen. */
function bilinearSample(image: GrayscaleImage, x: number, y: number, fallbackX: number, fallbackY: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  if (x0 < 0 || y0 < 0 || x0 + 1 >= image.width || y0 + 1 >= image.height) {
    return image.data[clampInt(fallbackY, 0, image.height - 1) * image.width + clampInt(fallbackX, 0, image.width - 1)]!;
  }
  const fx = x - x0;
  const fy = y - y0;
  const v00 = image.data[y0 * image.width + x0]!;
  const v01 = image.data[y0 * image.width + x0 + 1]!;
  const v10 = image.data[(y0 + 1) * image.width + x0]!;
  const v11 = image.data[(y0 + 1) * image.width + x0 + 1]!;
  const top = v00 * (1 - fx) + v01 * fx;
  const bottom = v10 * (1 - fx) + v11 * fx;
  return top * (1 - fy) + bottom * fy;
}
