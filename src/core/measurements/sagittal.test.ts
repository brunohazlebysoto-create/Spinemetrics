import { describe, expect, it } from 'vitest';
import { measureLumbarLordosis, measureSVA, measureT1Slope, measureTPA, measureThoracicKyphosis } from './sagittal';
import { calibrationFromRuler } from '../calibration/calibration';
import { DEFAULT_CONVENTIONS } from '../config/conventions';
import type { PelvicAnnotation, Pt, VertebraAnnotation } from '../models/types';

function tiltedEndplate(centerY: number, tiltDeg: number, xCenter = 200, width = 40): [Pt, Pt] {
  const rad = (tiltDeg * Math.PI) / 180;
  const half = width / 2;
  const dx = Math.cos(rad) * half;
  const dy = Math.sin(rad) * half;
  return [
    { x: xCenter - dx, y: centerY - dy },
    { x: xCenter + dx, y: centerY + dy },
  ];
}

function makeVertebra(
  level: VertebraAnnotation['level'],
  centerY: number,
  superiorTiltDeg: number,
  inferiorTiltDeg = superiorTiltDeg,
  xCenter = 200,
): VertebraAnnotation {
  return {
    level,
    superiorEndplate: tiltedEndplate(centerY - 15, superiorTiltDeg, xCenter),
    inferiorEndplate: tiltedEndplate(centerY + 15, inferiorTiltDeg, xCenter),
    centroid: { x: xCenter, y: centerY },
  };
}

function makePelvis(s1MidX: number, femoralY: number, s1Y: number): PelvicAnnotation {
  return {
    femoralHeads: {
      left: { center: { x: s1MidX - 40, y: femoralY }, radius: 15 },
      right: { center: { x: s1MidX + 40, y: femoralY }, radius: 15 },
    },
    s1Endplate: [
      { x: s1MidX - 20, y: s1Y },
      { x: s1MidX + 20, y: s1Y },
    ],
  };
}

describe('measureThoracicKyphosis — SPEC.md §7.5 (T5 sup → T12 inf)', () => {
  it('calcula el ángulo entre T5 y T12', () => {
    const vertebrae = [makeVertebra('T5', 0, 10), makeVertebra('T12', 300, -25)];
    const result = measureThoracicKyphosis(vertebrae);
    expect(result.status).toBe('ok');
    expect(result.value!).toBeCloseTo(35, 6);
  });

  it('unavailable si falta T5 o T12', () => {
    expect(measureThoracicKyphosis([makeVertebra('T12', 300, -25)]).status).toBe('unavailable');
    expect(measureThoracicKyphosis([makeVertebra('T5', 0, 10)]).status).toBe('unavailable');
  });
});

describe('measureLumbarLordosis — docs/OPEN_QUESTIONS.md #15', () => {
  it('por defecto usa L1 platillo superior → S1 platillo superior', () => {
    const vertebrae = [makeVertebra('L1', 0, 10), makeVertebra('S1', 200, -20)];
    const result = measureLumbarLordosis(vertebrae);
    expect(result.status).toBe('ok');
    expect(result.value!).toBeCloseTo(30, 6);
  });

  it('con la convención L1-L5 usa L1 sup → L5 inf y no bloquea sin S1', () => {
    const vertebrae = [makeVertebra('L1', 0, 10), makeVertebra('L5', 200, -20)];
    const conventions = { ...DEFAULT_CONVENTIONS, sagittal: { ...DEFAULT_CONVENTIONS.sagittal, lordosisLevels: 'L1-L5' as const } };
    const result = measureLumbarLordosis(vertebrae, conventions);
    expect(result.status).toBe('ok');
    expect(result.value!).toBeCloseTo(30, 6);
  });

  it('unavailable si falta L1', () => {
    const result = measureLumbarLordosis([makeVertebra('S1', 200, -20)]);
    expect(result.status).toBe('unavailable');
  });
});

describe('measureSVA — docs/OPEN_QUESTIONS.md #14', () => {
  it('por defecto usa el ángulo posterosuperior de S1 y convierte a mm', () => {
    const calibration = calibrationFromRuler(100, 10); // 10 px/mm
    const c7 = makeVertebra('C7', 0, 0, 0, 230);
    const s1: VertebraAnnotation = {
      ...makeVertebra('S1', 400, 0, 0, 200),
      posteriorSuperiorCorner: { x: 200, y: 390 },
    };
    const result = measureSVA([c7, s1], undefined, calibration);
    expect(result.status).toBe('ok');
    expect(result.value!).toBeCloseTo(3, 6); // 30 px / 10 px-per-mm
  });

  it('con la alternativa usa el punto medio del platillo superior de S1 vía la anotación pélvica', () => {
    const calibration = calibrationFromRuler(100, 10);
    const c7 = makeVertebra('C7', 0, 0, 0, 230);
    const pelvis = makePelvis(200, 500, 400);
    const conventions = {
      ...DEFAULT_CONVENTIONS,
      sagittal: { ...DEFAULT_CONVENTIONS.sagittal, svaReference: 'midpointS1SuperiorEndplate' as const },
    };
    const result = measureSVA([c7], pelvis, calibration, conventions);
    expect(result.status).toBe('ok');
    expect(result.value!).toBeCloseTo(3, 6);
  });

  it('unavailable sin C7', () => {
    expect(measureSVA([], undefined, undefined).status).toBe('unavailable');
  });

  it('unavailable si falta el ángulo posterosuperior de S1', () => {
    const c7 = makeVertebra('C7', 0, 0, 0, 230);
    const s1 = makeVertebra('S1', 400, 0, 0, 200); // sin posteriorSuperiorCorner
    const result = measureSVA([c7, s1], undefined, calibrationFromRuler(100, 10));
    expect(result.status).toBe('unavailable');
  });

  it('gris sin calibración', () => {
    const c7 = makeVertebra('C7', 0, 0, 0, 230);
    const s1: VertebraAnnotation = { ...makeVertebra('S1', 400, 0, 0, 200), posteriorSuperiorCorner: { x: 200, y: 390 } };
    const result = measureSVA([c7, s1], undefined, undefined);
    expect(result.status).toBe('unavailable');
    expect(result.value).toBeNull();
  });
});

describe('measureT1Slope', () => {
  it('ángulo del platillo superior de T1 con la horizontal', () => {
    const result = measureT1Slope([makeVertebra('T1', 0, 15)]);
    expect(result.status).toBe('ok');
    expect(result.value!).toBeCloseTo(15, 6);
  });

  it('unavailable sin T1', () => {
    expect(measureT1Slope([]).status).toBe('unavailable');
  });
});

describe('measureTPA', () => {
  it('ángulo entre eje femoral→T1 y eje femoral→platillo de S1', () => {
    const pelvis = makePelvis(200, 500, 400);
    const t1 = makeVertebra('T1', 0, 0, 0, 200);
    const result = measureTPA([t1], pelvis);
    expect(result.status).toBe('ok');
    // F=(200,500), M=(200,400): línea F→M vertical. F→T1(200,0) también vertical → TPA≈0°.
    expect(result.value!).toBeCloseTo(0, 3);
  });

  it('unavailable sin anotación pélvica', () => {
    const t1 = makeVertebra('T1', 0, 0);
    expect(measureTPA([t1], undefined).status).toBe('unavailable');
  });

  it('unavailable sin T1', () => {
    const pelvis = makePelvis(200, 500, 400);
    expect(measureTPA([], pelvis).status).toBe('unavailable');
  });
});
