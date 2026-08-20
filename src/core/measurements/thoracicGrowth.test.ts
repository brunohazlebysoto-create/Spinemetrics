import { describe, expect, it } from 'vitest';
import { measureT1S1Height, measureT1T12Height } from './thoracicGrowth';
import { calibrationFromRuler } from '../calibration/calibration';
import type { PelvicAnnotation, Pt, VertebraAnnotation } from '../models/types';

function flatEndplate(y: number, xCenter = 200, width = 40): [Pt, Pt] {
  return [{ x: xCenter - width / 2, y }, { x: xCenter + width / 2, y }];
}

function makeVertebra(level: VertebraAnnotation['level'], centerY: number): VertebraAnnotation {
  return {
    level,
    superiorEndplate: flatEndplate(centerY - 15),
    inferiorEndplate: flatEndplate(centerY + 15),
  };
}

function makePelvis(s1SuperiorY: number): PelvicAnnotation {
  return {
    femoralHeads: { left: { center: { x: 180, y: s1SuperiorY + 40 }, radius: 15 }, right: { center: { x: 220, y: s1SuperiorY + 40 }, radius: 15 } },
    s1Endplate: flatEndplate(s1SuperiorY),
  };
}

describe('measureT1T12Height — SPEC.md §7.11', () => {
  it('mide la distancia recta T1 platillo superior → T12 platillo inferior, en mm', () => {
    const t1 = makeVertebra('T1', 0); // platillo superior en y=-15
    const t12 = makeVertebra('T12', 300); // platillo inferior en y=315
    const calibration = calibrationFromRuler(100, 10); // 10 px/mm
    const result = measureT1T12Height([t1, t12], calibration);
    expect(result.status).toBe('ok');
    expect(result.value).toBeCloseTo((315 - -15) / 10, 6); // 330px / 10px-por-mm = 33mm
  });

  it('unavailable si falta T1 o T12', () => {
    expect(measureT1T12Height([makeVertebra('T12', 300)], undefined).status).toBe('unavailable');
    expect(measureT1T12Height([makeVertebra('T1', 0)], undefined).status).toBe('unavailable');
  });

  it('unavailable sin calibración: nunca fabrica un mm sin conversión real', () => {
    const result = measureT1T12Height([makeVertebra('T1', 0), makeVertebra('T12', 300)], undefined);
    expect(result.status).toBe('unavailable');
    expect(result.value).toBeNull();
  });
});

describe('measureT1S1Height — SPEC.md §7.11', () => {
  it('mide la distancia recta T1 platillo superior → S1 platillo superior, en mm', () => {
    const t1 = makeVertebra('T1', 0);
    const pelvis = makePelvis(400);
    const calibration = calibrationFromRuler(100, 10);
    const result = measureT1S1Height([t1], pelvis, calibration);
    expect(result.status).toBe('ok');
    expect(result.value).toBeCloseTo((400 - -15) / 10, 6);
  });

  it('unavailable sin anotación pélvica', () => {
    const result = measureT1S1Height([makeVertebra('T1', 0)], undefined, calibrationFromRuler(100, 10));
    expect(result.status).toBe('unavailable');
    expect(result.reason).toMatch(/platillo de S1/);
  });

  it('unavailable sin T1', () => {
    expect(measureT1S1Height([], makePelvis(400), calibrationFromRuler(100, 10)).status).toBe('unavailable');
  });
});
