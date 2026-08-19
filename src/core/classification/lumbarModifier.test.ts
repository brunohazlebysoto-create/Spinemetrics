import { describe, expect, it } from 'vitest';
import { determineLumbarModifier } from './lumbarModifier';
import { calibrationFromRuler } from '../calibration/calibration';
import type { PelvicAnnotation, VertebraAnnotation } from '../models/types';

function makePelvis(s1MidX: number): PelvicAnnotation {
  return {
    femoralHeads: {
      left: { center: { x: s1MidX - 40, y: 500 }, radius: 15 },
      right: { center: { x: s1MidX + 40, y: 500 }, radius: 15 },
    },
    s1Endplate: [
      { x: s1MidX - 20, y: 400 },
      { x: s1MidX + 20, y: 400 },
    ],
  };
}

/** Ápex con pedículos en `[pedicleLeftX, pedicleRightX]` y bordes laterales
 * del cuerpo en `[bodyLeftX, bodyRightX]` (ambos centrados en `x=200`, así
 * que el signo de `csvlX - 200` decide el lado de la desviación). */
function makeApex(pedicleHalfWidth: number, bodyHalfWidth: number): VertebraAnnotation {
  return {
    level: 'L3',
    superiorEndplate: [
      { x: 200 - bodyHalfWidth, y: 90 },
      { x: 200 + bodyHalfWidth, y: 90 },
    ],
    inferiorEndplate: [
      { x: 200 - bodyHalfWidth, y: 120 },
      { x: 200 + bodyHalfWidth, y: 120 },
    ],
    centroid: { x: 200, y: 105 },
    pedicles: {
      left: { x: 200 - pedicleHalfWidth, y: 105 },
      right: { x: 200 + pedicleHalfWidth, y: 105 },
    },
    lateralBorders: [
      { x: 200 - bodyHalfWidth, y: 105 },
      { x: 200 + bodyHalfWidth, y: 105 },
    ],
  };
}

describe('determineLumbarModifier', () => {
  const apex = makeApex(10, 30); // pedículos en [190,210], cuerpo en [170,230]
  const calibration = calibrationFromRuler(10, 1); // 10 px/mm

  it('A cuando la CSVL cae entre los pedículos', () => {
    const pelvis = makePelvis(200); // CSVL en x=200, dentro de [190,210]
    const result = determineLumbarModifier(apex, pelvis, calibration);
    expect(result.status).toBe('ok');
    expect(result.modifier).toBe('A');
    expect(result.borderlineBC).toBe(false);
  });

  it('B cuando la CSVL toca el cuerpo entre el pedículo y el margen lateral', () => {
    const pelvis = makePelvis(220); // fuera de [190,210], dentro de [170,230]
    const result = determineLumbarModifier(apex, pelvis, calibration);
    expect(result.modifier).toBe('B');
    expect(result.borderlineBC).toBe(false);
  });

  it('C cuando la CSVL cae completamente fuera del cuerpo, sin contacto', () => {
    const pelvis = makePelvis(260); // fuera de [170,230] por más que la tolerancia
    const result = determineLumbarModifier(apex, pelvis, calibration);
    expect(result.modifier).toBe('C');
    expect(result.borderlineBC).toBe(false);
  });

  it('docs/OPEN_QUESTIONS.md #8: dentro de la tolerancia de ±1 mm más allá del margen lateral, es B y borderlineBC', () => {
    // Margen lateral derecho en x=230; con calibración 10 px/mm, 1 mm = 10 px.
    // x=235 está 5 px (0.5 mm) fuera del margen: dentro de tolerancia → B borderline.
    const pelvis = makePelvis(235);
    const result = determineLumbarModifier(apex, pelvis, calibration);
    expect(result.modifier).toBe('B');
    expect(result.borderlineBC).toBe(true);
  });

  it('más allá de la tolerancia es C, no borderline', () => {
    // x=245 está 15 px (1.5 mm) fuera del margen: excede la tolerancia de 1 mm → C.
    const pelvis = makePelvis(245);
    const result = determineLumbarModifier(apex, pelvis, calibration);
    expect(result.modifier).toBe('C');
    expect(result.borderlineBC).toBe(false);
  });

  it('sin calibración, usa frontera estricta (sin tolerancia) y sigue siendo ok', () => {
    const pelvis = makePelvis(235); // fuera del cuerpo estricto [170,230]
    const result = determineLumbarModifier(apex, pelvis, undefined);
    expect(result.status).toBe('ok');
    expect(result.modifier).toBe('C');
  });

  it('unavailable sin vértebra apical', () => {
    const result = determineLumbarModifier(null, makePelvis(200), calibration);
    expect(result.status).toBe('unavailable');
    expect(result.modifier).toBeNull();
  });

  it('unavailable sin anotación pélvica', () => {
    const result = determineLumbarModifier(apex, undefined, calibration);
    expect(result.status).toBe('unavailable');
  });

  it('unavailable si faltan pedículos o bordes laterales', () => {
    const { pedicles: _pedicles, lateralBorders: _lateralBorders, ...incomplete } = apex;
    void _pedicles;
    void _lateralBorders;
    const result = determineLumbarModifier(incomplete, makePelvis(200), calibration);
    expect(result.status).toBe('unavailable');
    expect(result.reason).toContain('pedículos');
  });
});
