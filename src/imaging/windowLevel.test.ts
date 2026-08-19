import { describe, expect, it } from 'vitest';
import { applyWindowLevel } from './windowLevel';

function pixelAt(rgba: Uint8ClampedArray, index: number): [number, number, number, number] {
  const o = index * 4;
  return [rgba[o]!, rgba[o + 1]!, rgba[o + 2]!, rgba[o + 3]!];
}

describe('applyWindowLevel', () => {
  it('mapea el centro de la ventana a gris medio (~128)', () => {
    const out = applyWindowLevel(new Float32Array([100]), 100, 200, false);
    const [r, g, b, a] = pixelAt(out, 0);
    expect(r).toBe(g);
    expect(g).toBe(b);
    expect(r).toBeGreaterThanOrEqual(126);
    expect(r).toBeLessThanOrEqual(129);
    expect(a).toBe(255);
  });

  it('recorta por debajo de la ventana a negro y por encima a blanco', () => {
    const out = applyWindowLevel(new Float32Array([-1000, 1000]), 0, 400, false);
    expect(pixelAt(out, 0)).toEqual([0, 0, 0, 255]);
    expect(pixelAt(out, 1)).toEqual([255, 255, 255, 255]);
  });

  it('invert intercambia negro y blanco', () => {
    const out = applyWindowLevel(new Float32Array([-1000, 1000]), 0, 400, true);
    expect(pixelAt(out, 0)).toEqual([255, 255, 255, 255]);
    expect(pixelAt(out, 1)).toEqual([0, 0, 0, 255]);
  });

  it('produce un buffer de longitud 4× el número de píxeles', () => {
    const out = applyWindowLevel(new Float32Array(6), 0, 100, false);
    expect(out).toHaveLength(24);
  });

  it('nunca produce NaN incluso con anchura de ventana 0', () => {
    const out = applyWindowLevel(new Float32Array([50]), 50, 0, false);
    const [r] = pixelAt(out, 0);
    expect(Number.isNaN(r)).toBe(false);
  });
});
