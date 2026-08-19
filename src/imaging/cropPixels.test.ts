import { describe, expect, it } from 'vitest';
import { cropPixelsAround } from './cropPixels';

describe('cropPixelsAround', () => {
  it('extrae una región centrada dentro de los límites', () => {
    // Imagen 4x4, valores = índice lineal.
    const pixelData = new Float32Array(16).map((_, i) => i);
    const crop = cropPixelsAround(pixelData, 4, 4, 2, 2, 2);
    expect(crop.size).toBe(2);
    // half=1 → startX=1, startY=1 → filas 1-2, columnas 1-2.
    expect(Array.from(crop.data)).toEqual([5, 6, 9, 10]);
  });

  it('rellena con NaN los píxeles que caen fuera de la imagen', () => {
    const pixelData = new Float32Array(9).map((_, i) => i); // 3x3
    const crop = cropPixelsAround(pixelData, 3, 3, 0, 0, 4);
    // Con centro en la esquina, buena parte del recorte cae fuera.
    const nanCount = Array.from(crop.data).filter((v) => Number.isNaN(v)).length;
    expect(nanCount).toBeGreaterThan(0);
  });

  it('el tamaño del recorte siempre es size×size', () => {
    const pixelData = new Float32Array(100);
    const crop = cropPixelsAround(pixelData, 10, 10, 5, 5, 6);
    expect(crop.data).toHaveLength(36);
  });
});
