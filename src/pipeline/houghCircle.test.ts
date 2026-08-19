import { describe, expect, it } from 'vitest';
import { detectCircles } from './houghCircle';
import type { GrayscaleImage } from './types';

function makeTwoCirclesImage(
  width: number,
  height: number,
  centers: { x: number; y: number }[],
  radius: number,
): GrayscaleImage {
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

describe('detectCircles', () => {
  it('encuentra dos círculos separados con centro y radio aproximados', () => {
    const centers = [
      { x: 60, y: 50 },
      { x: 140, y: 50 },
    ];
    const radius = 15;
    const image = makeTwoCirclesImage(200, 100, centers, radius);

    const detected = detectCircles(image, { minRadius: 10, maxRadius: 20, radiusStep: 1, maxCircles: 2, minCenterSeparation: 40 });

    expect(detected).toHaveLength(2);
    for (const circle of detected) {
      const nearestCenter = centers.reduce((best, c) => (Math.hypot(c.x - circle.center.x, c.y - circle.center.y) < Math.hypot(best.x - circle.center.x, best.y - circle.center.y) ? c : best));
      expect(Math.hypot(nearestCenter.x - circle.center.x, nearestCenter.y - circle.center.y)).toBeLessThan(5);
      expect(Math.abs(circle.radius - radius)).toBeLessThanOrEqual(2);
    }
  });

  it('encuentra un único círculo cuando sólo hay uno', () => {
    const image = makeTwoCirclesImage(100, 100, [{ x: 50, y: 50 }], 20);
    const detected = detectCircles(image, { minRadius: 15, maxRadius: 25, radiusStep: 1, maxCircles: 1 });
    expect(detected).toHaveLength(1);
    expect(Math.hypot(detected[0]!.center.x - 50, detected[0]!.center.y - 50)).toBeLessThan(5);
  });

  it('no encuentra círculos en una imagen sin bordes (constante)', () => {
    const image: GrayscaleImage = { width: 50, height: 50, data: new Float32Array(2500).fill(0.5) };
    const detected = detectCircles(image, { minRadius: 5, maxRadius: 15 });
    expect(detected).toHaveLength(0);
  });
});
