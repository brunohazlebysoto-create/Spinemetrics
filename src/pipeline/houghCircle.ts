/**
 * Transformada de Hough circular por gradiente. SPEC.md §8 Etapa 5:
 * "Cabezas femorales por Hough circular con refinamiento por ajuste de
 * círculo" — el único método de detección de la Etapa 5 que SPEC.md
 * describe como clásico (no exige un modelo entrenado), así que es real:
 * no es un heurístico de repuesto, es el método que pide la especificación.
 *
 * Variante por gradiente (no el acumulador 3D ingenuo (x,y,r), demasiado
 * costoso en JS puro): para cada píxel de borde, el centro de cualquier
 * círculo que pase por él está a lo largo de la línea normal al gradiente
 * de intensidad, a distancia `r` en cualquiera de los dos sentidos —
 * técnica estándar (Hough circular "orientado por gradiente" / "método de
 * un punto"), no una simplificación inventada.
 */
import type { GrayscaleImage } from './types';

interface GradientField {
  magnitude: Float32Array;
  dirX: Float32Array;
  dirY: Float32Array;
}

function sobelGradient(image: GrayscaleImage): GradientField {
  const { width, height, data } = image;
  const magnitude = new Float32Array(width * height);
  const dirX = new Float32Array(width * height);
  const dirY = new Float32Array(width * height);

  const at = (x: number, y: number): number => data[Math.min(height - 1, Math.max(0, y)) * width + Math.min(width - 1, Math.max(0, x))]!;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const gx =
        -at(x - 1, y - 1) + at(x + 1, y - 1) - 2 * at(x - 1, y) + 2 * at(x + 1, y) - at(x - 1, y + 1) + at(x + 1, y + 1);
      const gy =
        -at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1) + at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1);
      const mag = Math.sqrt(gx * gx + gy * gy);
      const idx = y * width + x;
      magnitude[idx] = mag;
      if (mag > 1e-6) {
        dirX[idx] = gx / mag;
        dirY[idx] = gy / mag;
      }
    }
  }
  return { magnitude, dirX, dirY };
}

export interface DetectedCircle {
  center: { x: number; y: number };
  radius: number;
  /** Votos brutos del acumulador en el pico — no una probabilidad; sirve
   * como insumo real para derivar `DetectionConfidence`, nunca como
   * confianza en sí mismo. */
  votes: number;
}

export interface HoughCircleOptions {
  minRadius: number;
  maxRadius: number;
  radiusStep?: number;
  /** Fracción del gradiente máximo por debajo de la cual un píxel no se
   * considera borde. */
  gradientThresholdFraction?: number;
  /** Distancia mínima (px) entre dos círculos detectados para no
   * fusionarlos en la supresión de no-máximos. */
  minCenterSeparation?: number;
  maxCircles?: number;
}

/** Detecta hasta `maxCircles` círculos por votación de gradiente, con
 * supresión de no-máximos entre radios. */
export function detectCircles(image: GrayscaleImage, options: HoughCircleOptions): DetectedCircle[] {
  const { width, height } = image;
  const radiusStep = options.radiusStep ?? 2;
  const minSeparation = options.minCenterSeparation ?? options.minRadius;
  const maxCircles = options.maxCircles ?? 2;

  const { magnitude, dirX, dirY } = sobelGradient(image);
  let maxMagnitude = 0;
  for (const m of magnitude) if (m > maxMagnitude) maxMagnitude = m;
  if (maxMagnitude <= 1e-6) return []; // imagen sin ningún borde: nada que detectar.
  const threshold = maxMagnitude * (options.gradientThresholdFraction ?? 0.3);

  const edgePixels: { x: number; y: number; nx: number; ny: number }[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (magnitude[idx]! >= threshold) edgePixels.push({ x, y, nx: dirX[idx]!, ny: dirY[idx]! });
    }
  }

  const candidates: DetectedCircle[] = [];
  const accumulator = new Float32Array(width * height);

  for (let radius = options.minRadius; radius <= options.maxRadius; radius += radiusStep) {
    accumulator.fill(0);
    for (const edge of edgePixels) {
      for (const sign of [1, -1]) {
        const cx = Math.round(edge.x + sign * radius * edge.nx);
        const cy = Math.round(edge.y + sign * radius * edge.ny);
        if (cx >= 0 && cx < width && cy >= 0 && cy < height) accumulator[cy * width + cx]! += 1;
      }
    }

    const peaks = findAccumulatorPeaks(accumulator, width, height, maxCircles, minSeparation);
    for (const peak of peaks) candidates.push({ center: { x: peak.x, y: peak.y }, radius, votes: peak.votes });
  }

  candidates.sort((a, b) => b.votes - a.votes);
  const selected: DetectedCircle[] = [];
  for (const candidate of candidates) {
    const tooClose = selected.some((s) => distance(s.center, candidate.center) < minSeparation);
    if (!tooClose) selected.push(candidate);
    if (selected.length >= maxCircles) break;
  }
  return selected;
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Hasta `maxPeaks` picos locales del acumulador de UN radio, extraídos por
 * "encontrar el máximo, suprimir su vecindad, repetir" — necesario porque
 * dos círculos del mismo radio (p. ej. ambas cabezas femorales) producen
 * dos picos comparables en el mismo acumulador, no uno solo. */
function findAccumulatorPeaks(
  accumulator: Float32Array,
  width: number,
  height: number,
  maxPeaks: number,
  suppressionRadius: number,
): { x: number; y: number; votes: number }[] {
  const working = Float32Array.from(accumulator);
  const peaks: { x: number; y: number; votes: number }[] = [];

  for (let p = 0; p < maxPeaks; p++) {
    let best = 0;
    let bestIdx = -1;
    for (let i = 0; i < working.length; i++) {
      if (working[i]! > best) {
        best = working[i]!;
        bestIdx = i;
      }
    }
    if (bestIdx === -1) break;

    const x = bestIdx % width;
    const y = Math.floor(bestIdx / width);
    peaks.push({ x, y, votes: best });

    const r = Math.ceil(suppressionRadius);
    for (let dy = -r; dy <= r; dy++) {
      const yy = y + dy;
      if (yy < 0 || yy >= height) continue;
      for (let dx = -r; dx <= r; dx++) {
        const xx = x + dx;
        if (xx < 0 || xx >= width) continue;
        if (dx * dx + dy * dy <= r * r) working[yy * width + xx] = 0;
      }
    }
  }
  return peaks;
}
