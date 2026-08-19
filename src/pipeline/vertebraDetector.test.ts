import { describe, expect, it } from 'vitest';
import { bandToOriginalSpaceRectangle, detectVertebraBands } from './vertebraDetector';
import type { GrayscaleImage } from './types';

/** Imagen sintética con `count` "cuerpos vertebrales" (bandas brillantes)
 * de altura `bodyHeight` separados por "discos" (bandas oscuras) de altura
 * `discHeight`, dentro de una columna de ancho `bodyWidth`. */
function makeSyntheticSpine(
  width: number,
  height: number,
  count: number,
  bodyHeight: number,
  discHeight: number,
  bodyWidth: number,
): GrayscaleImage {
  const data = new Float32Array(width * height).fill(0.1);
  const xCenter = width / 2;
  const x0 = Math.round(xCenter - bodyWidth / 2);
  const x1 = Math.round(xCenter + bodyWidth / 2);
  let y = 20;
  for (let i = 0; i < count; i++) {
    for (let yy = y; yy < y + bodyHeight; yy++) {
      for (let xx = x0; xx < x1; xx++) data[yy * width + xx] = 0.8;
    }
    y += bodyHeight + discHeight;
  }
  return { width, height, data };
}

describe('detectVertebraBands', () => {
  it('detecta aproximadamente el número de cuerpos vertebrales sintéticos', () => {
    const image = makeSyntheticSpine(100, 400, 6, 25, 8, 50);
    const bands = detectVertebraBands(image, { x0: 0, y0: 0, x1: 100, y1: 400 }, { minRowSpacing: 15 });
    // Tolerancia: el heurístico no tiene por qué acertar exactamente, pero
    // debe acercarse al número real de cuerpos (6).
    expect(bands.length).toBeGreaterThanOrEqual(4);
    expect(bands.length).toBeLessThanOrEqual(8);
  });

  it('nunca reporta confianza por encima del techo deliberado (0.5)', () => {
    const image = makeSyntheticSpine(100, 400, 6, 25, 8, 50);
    const bands = detectVertebraBands(image, { x0: 0, y0: 0, x1: 100, y1: 400 }, { minRowSpacing: 15 });
    for (const band of bands) {
      expect(band.confidence.value).toBeLessThanOrEqual(0.5);
      expect(band.confidence.value).toBeGreaterThanOrEqual(0);
    }
  });

  it('da más confianza a un patrón regular que a uno irregular', () => {
    const regular = makeSyntheticSpine(100, 400, 6, 25, 8, 50);
    const regularBands = detectVertebraBands(regular, { x0: 0, y0: 0, x1: 100, y1: 400 }, { minRowSpacing: 15 });
    const avgRegularConfidence = regularBands.reduce((s, b) => s + b.confidence.value, 0) / regularBands.length;

    // Imagen con ruido uniforme aleatorio: sin patrón periódico real.
    const noisyData = new Float32Array(100 * 400);
    let seed = 42;
    for (let i = 0; i < noisyData.length; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      noisyData[i] = (seed % 1000) / 1000;
    }
    const noisy: GrayscaleImage = { width: 100, height: 400, data: noisyData };
    const noisyBands = detectVertebraBands(noisy, { x0: 0, y0: 0, x1: 100, y1: 400 }, { minRowSpacing: 15 });
    const avgNoisyConfidence = noisyBands.length > 0 ? noisyBands.reduce((s, b) => s + b.confidence.value, 0) / noisyBands.length : 0;

    expect(avgRegularConfidence).toBeGreaterThan(avgNoisyConfidence);
  });

  it('devuelve un array vacío para una ROI degenerada', () => {
    const image = makeSyntheticSpine(100, 400, 6, 25, 8, 50);
    expect(detectVertebraBands(image, { x0: 50, y0: 50, x1: 50, y1: 80 }, { minRowSpacing: 15 })).toEqual([]);
  });
});

describe('bandToOriginalSpaceRectangle', () => {
  it('aplica la transformación inversa a las cuatro esquinas', () => {
    const band = { rowCenter: 100, rowTop: 90, rowBottom: 110, colLeft: 20, colRight: 60, confidence: { value: 0.3, reason: '' } };
    const transform = { scaleX: 2, scaleY: 2, offsetX: -10, offsetY: -10 };
    const rect = bandToOriginalSpaceRectangle(band, transform);
    // apply(original) = original*scale + offset → original = (resampled-offset)/scale.
    expect(rect.superiorEndplate[0]).toEqual({ x: (20 + 10) / 2, y: (90 + 10) / 2 });
    expect(rect.inferiorEndplate[1]).toEqual({ x: (60 + 10) / 2, y: (110 + 10) / 2 });
  });
});
