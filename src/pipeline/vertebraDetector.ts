/**
 * Etapa 3 — Segmentación vertebral, SIN modelo entrenado. SPEC.md §8 exige
 * aquí "segmentación de instancias" vía U-Net/nnU-Net o Mask R-CNN — ese
 * modelo no existe (ver `training/README.md`: sólo el andamiaje de
 * entrenamiento está listo, no hay checkpoint). Por decisión explícita del
 * usuario ("también calcula sin ellos"), esta etapa se implementa con un
 * heurístico clásico real en vez de quedar vacía: detección de picos en el
 * perfil de intensidad por fila dentro de la ROI de columna (los cuerpos
 * vertebrales son más densos/claros que los discos intervertebrales en una
 * radiografía AP/lateral, así que producen máximos locales periódicos).
 *
 * Es sustancialmente menos fiable que un modelo entrenado — su confianza
 * está deliberadamente acotada bajo (`MAX_CONFIDENCE`) para que el control
 * de calidad de SPEC.md §8.1 ("confianza <0.7 → no fiable, excluir de la
 * selección de terminales") la trate como lo que es. Nunca se presenta como
 * equivalente a una segmentación real.
 */
import type { AffineTransform2D, DetectionConfidence, GrayscaleImage, SpineRoi } from './types';
import { applyAffineInverse } from './types';

/** Ningún heurístico sin entrenar debería reportar más confianza que esto,
 * cualquiera que sea la regularidad de sus picos — un techo deliberado. */
const MAX_CONFIDENCE = 0.5;

export interface VertebraBandCandidate {
  /** Fila central del cuerpo candidato, en el espacio de `image` (remuestreado). */
  rowCenter: number;
  rowTop: number;
  rowBottom: number;
  /** Columnas [x0, x1) del cuerpo candidato dentro de esa banda. */
  colLeft: number;
  colRight: number;
  confidence: DetectionConfidence;
}

function smoothProfile(profile: Float64Array, windowRadius: number): Float64Array {
  const out = new Float64Array(profile.length);
  for (let i = 0; i < profile.length; i++) {
    let sum = 0;
    let count = 0;
    for (let k = -windowRadius; k <= windowRadius; k++) {
      const j = i + k;
      if (j >= 0 && j < profile.length) {
        sum += profile[j]!;
        count += 1;
      }
    }
    out[i] = sum / count;
  }
  return out;
}

interface RowPeak {
  row: number;
  prominence: number;
}

/** Máximos locales del perfil suavizado, cada uno con su "prominencia"
 * (altura sobre el valle más profundo hasta el siguiente máximo a cada
 * lado) — evita contar como vértebra independiente una ondulación menor
 * dentro de un mismo cuerpo. */
function findRowPeaks(profile: Float64Array, minSpacing: number): RowPeak[] {
  const n = profile.length;
  if (n === 0) return [];

  // Codifica el perfil en tramos de valor constante (run-length). Robusto
  // frente al fallo obvio de comparar sólo vecinos adyacentes: en una
  // meseta completamente plana (p. ej. el fondo detrás de la última
  // vértebra) *cualquier* punto "empata" con sus vecinos inmediatos, lo que
  // generaría picos falsos periódicos si no se exige que el tramo entero
  // sea estrictamente más alto que los tramos vecinos.
  const runs: { start: number; end: number; value: number }[] = [];
  let runStart = 0;
  for (let i = 1; i <= n; i++) {
    if (i === n || profile[i]! !== profile[runStart]!) {
      runs.push({ start: runStart, end: i - 1, value: profile[runStart]! });
      runStart = i;
    }
  }

  const peakRuns: { row: number; value: number }[] = [];
  for (let r = 0; r < runs.length; r++) {
    const run = runs[r]!;
    const leftValue = r > 0 ? runs[r - 1]!.value : -Infinity;
    const rightValue = r < runs.length - 1 ? runs[r + 1]!.value : -Infinity;
    if (run.value > leftValue && run.value > rightValue) {
      peakRuns.push({ row: Math.round((run.start + run.end) / 2), value: run.value });
    }
  }

  // Fusiona picos a menos de `minSpacing` (el suavizado puede dejar mesetas
  // adyacentes de valor ligeramente distinto cerca de una misma vértebra).
  const merged: { row: number; value: number }[] = [];
  for (const p of peakRuns) {
    const last = merged[merged.length - 1];
    if (!last || p.row - last.row >= minSpacing) merged.push(p);
    else if (p.value > last.value) merged[merged.length - 1] = p;
  }

  return merged.map((p, idx) => {
    const prevRow = idx > 0 ? merged[idx - 1]!.row : 0;
    const nextRow = idx < merged.length - 1 ? merged[idx + 1]!.row : n - 1;
    let valley = p.value;
    for (let j = prevRow; j <= nextRow; j++) valley = Math.min(valley, profile[j]!);
    return { row: p.row, prominence: p.value - valley };
  });
}

export interface DetectVertebraBandsOptions {
  /** Separación mínima esperada entre centros de cuerpos vertebrales
   * consecutivos, en píxeles del espacio remuestreado. */
  minRowSpacing: number;
  smoothingWindow?: number;
}

/**
 * Detecta candidatos a cuerpo vertebral dentro de `roi` por picos del
 * perfil de intensidad por fila. Cada candidato lleva su propia
 * `DetectionConfidence`, derivada de dos señales geométricas reales (nunca
 * una constante): la prominencia relativa del pico y la regularidad de su
 * espaciado con los vecinos (vértebras reales tienen alturas similares;
 * ruido no).
 */
export function detectVertebraBands(image: GrayscaleImage, roi: SpineRoi, options: DetectVertebraBandsOptions): VertebraBandCandidate[] {
  const { width, height, data } = image;
  const y0 = Math.max(0, roi.y0);
  const y1 = Math.min(height, roi.y1);
  const x0 = Math.max(0, roi.x0);
  const x1 = Math.min(width, roi.x1);
  if (y1 <= y0 || x1 <= x0) return [];

  const rowProfile = new Float64Array(y1 - y0);
  for (let y = y0; y < y1; y++) {
    let sum = 0;
    for (let x = x0; x < x1; x++) sum += data[y * width + x]!;
    rowProfile[y - y0] = sum / (x1 - x0);
  }

  const smoothed = smoothProfile(rowProfile, options.smoothingWindow ?? 2);
  const peaks = findRowPeaks(smoothed, options.minRowSpacing);
  if (peaks.length === 0) return [];

  let maxProminence = 0;
  for (const p of peaks) if (p.prominence > maxProminence) maxProminence = p.prominence;

  const heights: number[] = [];
  const boundsPerPeak = peaks.map((peak, idx) => {
    const prevPeakRow = idx > 0 ? peaks[idx - 1]!.row : Math.max(0, peak.row - options.minRowSpacing);
    const nextPeakRow = idx < peaks.length - 1 ? peaks[idx + 1]!.row : Math.min(smoothed.length - 1, peak.row + options.minRowSpacing);
    const top = Math.round((prevPeakRow + peak.row) / 2);
    const bottom = Math.round((peak.row + nextPeakRow) / 2);
    heights.push(bottom - top);
    return { top, bottom };
  });
  const meanHeight = heights.reduce((a, b) => a + b, 0) / heights.length;

  return peaks.map((peak, idx) => {
    const bounds = boundsPerPeak[idx]!;
    const prominenceScore = maxProminence > 0 ? peak.prominence / maxProminence : 0;
    const heightDeviation = meanHeight > 0 ? Math.abs(heights[idx]! - meanHeight) / meanHeight : 1;
    const regularityScore = Math.max(0, 1 - heightDeviation);
    const rawScore = (prominenceScore + regularityScore) / 2;

    return {
      rowCenter: y0 + peak.row,
      rowTop: y0 + bounds.top,
      rowBottom: y0 + bounds.bottom,
      colLeft: x0,
      colRight: x1,
      confidence: {
        value: Math.min(MAX_CONFIDENCE, rawScore * MAX_CONFIDENCE),
        reason:
          `Heurístico sin modelo entrenado (techo ${MAX_CONFIDENCE}): prominencia relativa ${prominenceScore.toFixed(2)}, ` +
          `regularidad de altura ${regularityScore.toFixed(2)} frente a la media de ${heights.length} candidatos.`,
      },
    };
  });
}

/** Convierte un candidato del espacio remuestreado al espacio de la imagen
 * original usando la `AffineTransform2D` de `preprocess.resampleWithAffine`
 * — SPEC.md §8 Etapa 2: "todas las mediciones se calculan en el espacio de
 * la imagen original, nunca en el remuestreado." */
export function bandToOriginalSpaceRectangle(
  band: VertebraBandCandidate,
  transform: AffineTransform2D,
): { superiorEndplate: [{ x: number; y: number }, { x: number; y: number }]; inferiorEndplate: [{ x: number; y: number }, { x: number; y: number }] } {
  const topLeft = applyAffineInverse({ x: band.colLeft, y: band.rowTop }, transform);
  const topRight = applyAffineInverse({ x: band.colRight, y: band.rowTop }, transform);
  const bottomLeft = applyAffineInverse({ x: band.colLeft, y: band.rowBottom }, transform);
  const bottomRight = applyAffineInverse({ x: band.colRight, y: band.rowBottom }, transform);
  return {
    superiorEndplate: [topLeft, topRight],
    inferiorEndplate: [bottomLeft, bottomRight],
  };
}
