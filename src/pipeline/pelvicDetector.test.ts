import { describe, expect, it } from 'vitest';
import { detectFemoralHeads } from './pelvicDetector';
import type { GrayscaleImage } from './types';

function makeTwoCirclesImage(width: number, height: number, centers: { x: number; y: number }[], radius: number): GrayscaleImage {
  const data = new Float32Array(width * height).fill(0.1);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (const c of centers) {
        if (Math.hypot(x - c.x, y - c.y) <= radius) {
          data[y * width + x] = 0.9;
          break;
        }
      }
    }
  }
  return { width, height, data };
}

describe('detectFemoralHeads', () => {
  it('detecta las dos cabezas femorales y las etiqueta izquierda/derecha por posición x', () => {
    const image = makeTwoCirclesImage(300, 150, [{ x: 100, y: 75 }, { x: 200, y: 75 }], 20);
    const result = detectFemoralHeads(image, { minRadius: 15, maxRadius: 25, radiusStep: 1 });

    expect(result.femoralHeads).not.toBeNull();
    expect(result.femoralHeads!.left.center.x).toBeLessThan(result.femoralHeads!.right.center.x);
    expect(Math.hypot(result.femoralHeads!.left.center.x - 100, result.femoralHeads!.left.center.y - 75)).toBeLessThan(5);
    expect(Math.hypot(result.femoralHeads!.right.center.x - 200, result.femoralHeads!.right.center.y - 75)).toBeLessThan(5);
  });

  it('la confianza es real (no una constante): más alta con bordes limpios', () => {
    const image = makeTwoCirclesImage(300, 150, [{ x: 100, y: 75 }, { x: 200, y: 75 }], 20);
    const result = detectFemoralHeads(image, { minRadius: 15, maxRadius: 25, radiusStep: 1 });
    expect(result.confidence.value).toBeGreaterThan(0);
    expect(result.confidence.value).toBeLessThanOrEqual(0.9);
  });

  it('devuelve null sin inventar una segunda cabeza cuando sólo hay un círculo', () => {
    const image = makeTwoCirclesImage(200, 150, [{ x: 100, y: 75 }], 20);
    const result = detectFemoralHeads(image, { minRadius: 15, maxRadius: 25, radiusStep: 1 });
    expect(result.femoralHeads).toBeNull();
    expect(result.confidence.value).toBe(0);
  });

  it('devuelve null en una imagen sin ningún círculo', () => {
    const image: GrayscaleImage = { width: 100, height: 100, data: new Float32Array(10000).fill(0.5) };
    const result = detectFemoralHeads(image, { minRadius: 10, maxRadius: 20 });
    expect(result.femoralHeads).toBeNull();
  });
});
