import { describe, expect, it } from 'vitest';
import {
  HORIZONTAL,
  VERTICAL,
  angleBetweenLines,
  distance,
  midpoint,
  perpendicularThrough,
  signedDistanceToVerticalLine,
  signedInclinationFromHorizontal,
} from './primitives';
import type { Line, Pt } from './types';

/** Construye una línea horizontal de izquierda a derecha inclinada `deg`
 * grados (positivo = el extremo derecho más bajo en coordenadas de imagen),
 * de longitud unitaria, centrada en `center`. Espejo del método usado por
 * los fixtures sintéticos de SPEC.md §13.1. */
function tiltedLine(deg: number, center: Pt = { x: 0, y: 0 }, length = 100): Line {
  const rad = (deg * Math.PI) / 180;
  const half = length / 2;
  const dx = Math.cos(rad) * half;
  const dy = Math.sin(rad) * half;
  return {
    p1: { x: center.x - dx, y: center.y - dy },
    p2: { x: center.x + dx, y: center.y + dy },
  };
}

describe('angleBetweenLines', () => {
  it('vale 0° entre dos líneas horizontales idénticas', () => {
    expect(angleBetweenLines(HORIZONTAL, HORIZONTAL)).toBeCloseTo(0, 6);
  });

  it('vale 90° entre horizontal y vertical', () => {
    expect(angleBetweenLines(HORIZONTAL, VERTICAL)).toBeCloseTo(90, 6);
  });

  it('fixture de SPEC.md §13.1: platillos a 15° y −20° → Cobb = 35°, exactitud <0.1°', () => {
    const superior = tiltedLine(15, { x: 0, y: 0 });
    const inferior = tiltedLine(-20, { x: 0, y: 200 });
    const cobb = angleBetweenLines(superior, inferior);
    expect(Math.abs(cobb - 35)).toBeLessThan(0.1);
  });

  it('platillos horizontales (0° y 0°) dan Cobb 0°', () => {
    const superior = tiltedLine(0);
    const inferior = tiltedLine(0, { x: 0, y: 200 });
    expect(angleBetweenLines(superior, inferior)).toBeCloseTo(0, 6);
  });

  it('convexidad derecha (15°/−20°) y convexidad izquierda (−15°/20°) dan la misma magnitud', () => {
    const right = angleBetweenLines(tiltedLine(15), tiltedLine(-20, { x: 0, y: 200 }));
    const left = angleBetweenLines(tiltedLine(-15), tiltedLine(20, { x: 0, y: 200 }));
    expect(right).toBeCloseTo(left, 6);
  });

  it('devuelve el ángulo agudo cuando el bruto supera 90°', () => {
    // 80° y -85°: diferencia bruta de 165°, agudo = 15°.
    const l1 = tiltedLine(80);
    const l2 = tiltedLine(-85, { x: 0, y: 200 });
    const angle = angleBetweenLines(l1, l2);
    expect(angle).toBeLessThanOrEqual(90);
    expect(angle).toBeCloseTo(15, 6);
  });

  it('es invariante a la dirección de recorrido de cada línea (p1/p2 intercambiados)', () => {
    const l1: Line = tiltedLine(15);
    const l1Reversed: Line = { p1: l1.p2, p2: l1.p1 };
    const l2 = tiltedLine(-20, { x: 0, y: 200 });
    expect(angleBetweenLines(l1Reversed, l2)).toBeCloseTo(angleBetweenLines(l1, l2), 6);
  });

  it('imágenes espejadas (x → −x) preservan la magnitud del ángulo', () => {
    const mirror = (l: Line): Line => ({
      p1: { x: -l.p1.x, y: l.p1.y },
      p2: { x: -l.p2.x, y: l.p2.y },
    });
    const superior = tiltedLine(15);
    const inferior = tiltedLine(-20, { x: 0, y: 200 });
    const original = angleBetweenLines(superior, inferior);
    const mirrored = angleBetweenLines(mirror(superior), mirror(inferior));
    expect(mirrored).toBeCloseTo(original, 6);
  });
});

describe('signedDistanceToVerticalLine', () => {
  it('positivo cuando el punto está a la derecha de la línea de referencia', () => {
    expect(signedDistanceToVerticalLine({ x: 10, y: 0 }, 4)).toBe(6);
  });

  it('negativo cuando el punto está a la izquierda', () => {
    expect(signedDistanceToVerticalLine({ x: 1, y: 0 }, 4)).toBe(-3);
  });

  it('cero sobre la línea', () => {
    expect(signedDistanceToVerticalLine({ x: 4, y: 10 }, 4)).toBe(0);
  });
});

describe('signedInclinationFromHorizontal', () => {
  it('vale 0° para una línea horizontal', () => {
    expect(signedInclinationFromHorizontal(HORIZONTAL)).toBeCloseTo(0, 6);
  });

  it('cambia de signo entre inclinación hacia abajo y hacia arriba', () => {
    const down = signedInclinationFromHorizontal(tiltedLine(15));
    const up = signedInclinationFromHorizontal(tiltedLine(-15));
    expect(Math.sign(down)).not.toBe(Math.sign(up));
    expect(Math.abs(down)).toBeCloseTo(15, 6);
    expect(Math.abs(up)).toBeCloseTo(15, 6);
  });
});

describe('perpendicularThrough', () => {
  it('la perpendicular a una horizontal es vertical', () => {
    const perp = perpendicularThrough(HORIZONTAL, { x: 5, y: 5 });
    expect(angleBetweenLines(perp, VERTICAL)).toBeCloseTo(0, 6);
    expect(angleBetweenLines(perp, HORIZONTAL)).toBeCloseTo(90, 6);
  });

  it('pasa por el punto dado', () => {
    const point = { x: 3, y: 7 };
    const perp = perpendicularThrough(HORIZONTAL, point);
    expect(perp.p1).toEqual(point);
  });
});

describe('distance / midpoint', () => {
  it('distancia euclídea básica (3-4-5)', () => {
    expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBeCloseTo(5, 6);
  });

  it('punto medio', () => {
    expect(midpoint({ x: 0, y: 0 }, { x: 10, y: 20 })).toEqual({ x: 5, y: 10 });
  });
});
