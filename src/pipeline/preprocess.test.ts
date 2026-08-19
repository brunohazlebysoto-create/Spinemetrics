import { describe, expect, it } from 'vitest';
import { applyClahe, detectSpineRoi, normalizeIntensity, resampleWithAffine } from './preprocess';
import { applyAffine, applyAffineInverse, type GrayscaleImage } from './types';

function makeImage(width: number, height: number, fill: (x: number, y: number) => number): GrayscaleImage {
  const data = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) data[y * width + x] = fill(x, y);
  }
  return { width, height, data };
}

describe('normalizeIntensity', () => {
  it('produce valores en [0, 1]', () => {
    const image = makeImage(20, 20, (x) => x * 100);
    const result = normalizeIntensity(image);
    expect(Math.min(...result.data)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...result.data)).toBeLessThanOrEqual(1);
  });

  it('no produce NaN en una imagen constante', () => {
    const image = makeImage(10, 10, () => 500);
    const result = normalizeIntensity(image);
    expect(result.data.every((v) => Number.isFinite(v))).toBe(true);
  });

  it('un único valor atípico no comprime el rango dinámico del resto de la imagen', () => {
    // 199 valores "reales" con variación (400–600) + 1 atípico extremo
    // (10000, p. ej. saturación de aire). Con normalización min/max ingenua
    // el rango real quedaría comprimido a ~0.04–0.06; recortando por
    // percentil 1/99, el atípico queda fuera del cálculo de los bordes y el
    // rango real ocupa casi todo [0, 1].
    const data = new Float32Array(200);
    for (let i = 0; i < 199; i++) data[i] = 400 + (i / 198) * 200; // 400..600
    data[199] = 10000;
    const image: GrayscaleImage = { width: 200, height: 1, data };

    const result = normalizeIntensity(image);
    const bulkValues = Array.from(result.data.slice(0, 199));
    const bulkRange = Math.max(...bulkValues) - Math.min(...bulkValues);
    expect(bulkRange).toBeGreaterThan(0.8); // conserva casi todo el contraste real
    expect(result.data[199]).toBeCloseTo(1, 5); // el atípico se recorta al techo
  });
});

describe('applyClahe', () => {
  it('conserva ancho y alto, y devuelve valores en [0, 1]', () => {
    const image = makeImage(64, 64, (x, y) => ((x + y) % 17) / 16);
    const result = applyClahe(image);
    expect(result.width).toBe(64);
    expect(result.height).toBe(64);
    expect(Math.min(...result.data)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...result.data)).toBeLessThanOrEqual(1);
  });

  it('aumenta el contraste local en una región de bajo contraste', () => {
    // Una banda estrecha de valores (bajo contraste) rodeada de una imagen
    // normal: CLAHE debe expandir el rango de esa banda localmente.
    const image = makeImage(64, 64, (x, y) => {
      if (x >= 20 && x < 44 && y >= 20 && y < 44) return 0.5 + ((x + y) % 2) * 0.02; // banda casi plana
      return Math.random();
    });
    const result = applyClahe(image);
    let minInBand = Infinity;
    let maxInBand = -Infinity;
    for (let y = 20; y < 44; y++) {
      for (let x = 20; x < 44; x++) {
        const v = result.data[y * 64 + x]!;
        if (v < minInBand) minInBand = v;
        if (v > maxInBand) maxInBand = v;
      }
    }
    expect(maxInBand - minInBand).toBeGreaterThan(0.02 / (44 - 20)); // el rango original era ~0.02 total
  });
});

describe('detectSpineRoi', () => {
  it('encuentra una franja vertical de alto contraste', () => {
    const image = makeImage(200, 200, (x) => (x >= 80 && x < 120 ? Math.sin(x) * 0.5 + 0.5 : 0.5));
    const roi = detectSpineRoi(image);
    expect(roi.y0).toBe(0);
    expect(roi.y1).toBe(200);
    expect(roi.x0).toBeLessThanOrEqual(100);
    expect(roi.x1).toBeGreaterThanOrEqual(100);
  });

  it('usa la imagen completa cuando no hay contraste', () => {
    const image = makeImage(100, 100, () => 0.5);
    const roi = detectSpineRoi(image);
    expect(roi).toEqual({ x0: 0, y0: 0, x1: 100, y1: 100 });
  });

  it('respeta el ancho mínimo configurado', () => {
    const image = makeImage(200, 200, (x) => (x >= 95 && x < 105 ? Math.sin(x) : 0));
    const roi = detectSpineRoi(image, 0.5);
    expect(roi.x1 - roi.x0).toBeGreaterThanOrEqual(100);
  });
});

describe('resampleWithAffine', () => {
  it('produce el tamaño destino solicitado', () => {
    const image = makeImage(400, 800, (x, y) => x + y);
    const { image: resized } = resampleWithAffine(image, { x0: 0, y0: 0, x1: 400, y1: 800 }, 256, 512);
    expect(resized.width).toBe(256);
    expect(resized.height).toBe(512);
  });

  it('lanza sobre una ROI vacía', () => {
    const image = makeImage(100, 100, () => 0);
    expect(() => resampleWithAffine(image, { x0: 50, y0: 50, x1: 50, y1: 80 }, 64, 64)).toThrow(/ROI vacía/);
  });

  it('SPEC.md §13.7: ida y vuelta de la transformación afín dentro de 0.5 px', () => {
    const image = makeImage(400, 800, () => 0);
    const rois = [
      { x0: 0, y0: 0, x1: 400, y1: 800 },
      { x0: 50, y0: 100, x1: 350, y1: 800 },
      { x0: 10, y0: 0, x1: 390, y1: 750 },
    ];
    for (const roi of rois) {
      const { transform } = resampleWithAffine(image, roi, 256, 512);
      const points = [
        { x: roi.x0 + 5, y: roi.y0 + 5 },
        { x: (roi.x0 + roi.x1) / 2, y: (roi.y0 + roi.y1) / 2 },
        { x: roi.x1 - 5, y: roi.y1 - 5 },
      ];
      for (const point of points) {
        const resampled = applyAffine(point, transform);
        const recovered = applyAffineInverse(resampled, transform);
        expect(Math.abs(recovered.x - point.x)).toBeLessThan(0.5);
        expect(Math.abs(recovered.y - point.y)).toBeLessThan(0.5);
      }
    }
  });
});
