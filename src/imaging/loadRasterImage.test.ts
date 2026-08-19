import { describe, expect, it } from 'vitest';
import * as UTIF from 'utif2';
import { decodeTiffToRgba, isTiffFile } from './loadRasterImage';

describe('isTiffFile', () => {
  it('reconoce por tipo MIME', () => {
    expect(isTiffFile('radiografia.bin', 'image/tiff')).toBe(true);
  });

  it('reconoce por extensión cuando el MIME está vacío (caso común al arrastrar archivos)', () => {
    expect(isTiffFile('radiografia.tif', '')).toBe(true);
    expect(isTiffFile('RADIOGRAFIA.TIFF', '')).toBe(true);
  });

  it('no reconoce PNG/JPEG como TIFF', () => {
    expect(isTiffFile('radiografia.png', 'image/png')).toBe(false);
    expect(isTiffFile('radiografia.jpg', 'image/jpeg')).toBe(false);
  });
});

describe('decodeTiffToRgba', () => {
  it('decodifica un TIFF sintético a RGBA8 con las dimensiones correctas', () => {
    const width = 3;
    const height = 2;
    // 6 píxeles RGBA: rojo, verde, azul, blanco, negro, gris.
    const rgba = new Uint8Array([
      255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255,
      255, 255, 255, 255, 0, 0, 0, 255, 128, 128, 128, 255,
    ]);
    const tiffBuffer = UTIF.encodeImage(rgba, width, height);

    const decoded = decodeTiffToRgba(tiffBuffer);
    expect(decoded.width).toBe(width);
    expect(decoded.height).toBe(height);
    expect(decoded.rgba).toHaveLength(width * height * 4);
    // Primer píxel rojo opaco.
    expect(Array.from(decoded.rgba.slice(0, 4))).toEqual([255, 0, 0, 255]);
  });

  it('lanza un error legible si el TIFF no contiene ninguna imagen', () => {
    expect(() => decodeTiffToRgba(new ArrayBuffer(0))).toThrow();
  });
});
