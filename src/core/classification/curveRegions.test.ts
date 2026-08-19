import { describe, expect, it } from 'vitest';
import { assignCurvesToRegions, classifyCurveRegion } from './curveRegions';
import type { CobbCurveCandidate } from '../measurements/cobb';
import type { Pt, VertebraAnnotation } from '../models/types';

function makeVertebra(level: VertebraAnnotation['level'], xCenter = 200, y = 0): VertebraAnnotation {
  const pt = (dx: number, dy: number): Pt => ({ x: xCenter + dx, y: y + dy });
  return {
    level,
    superiorEndplate: [pt(-20, -15), pt(20, -15)],
    inferiorEndplate: [pt(-20, 15), pt(20, 15)],
    centroid: { x: xCenter, y },
  };
}

function makeCurve(
  cranialLevel: VertebraAnnotation['level'],
  caudalLevel: VertebraAnnotation['level'],
  apexLevel: VertebraAnnotation['level'] | null,
  angle = 30,
): CobbCurveCandidate {
  return {
    cranialVertebra: makeVertebra(cranialLevel),
    caudalVertebra: makeVertebra(caudalLevel),
    angle,
    apexVertebra: apexLevel ? makeVertebra(apexLevel) : null,
    convexity: 'right',
    ambiguous: false,
  };
}

describe('classifyCurveRegion', () => {
  it('T3, T4 y T5 son PT', () => {
    expect(classifyCurveRegion('T3')).toBe('PT');
    expect(classifyCurveRegion('T4')).toBe('PT');
    expect(classifyCurveRegion('T5')).toBe('PT');
  });

  it('T6 a T11 son MT', () => {
    expect(classifyCurveRegion('T6')).toBe('MT');
    expect(classifyCurveRegion('T11')).toBe('MT');
  });

  it('T12 a L4 son TL_L', () => {
    expect(classifyCurveRegion('T12')).toBe('TL_L');
    expect(classifyCurveRegion('L1')).toBe('TL_L');
    expect(classifyCurveRegion('L4')).toBe('TL_L');
  });

  it('niveles fuera de rango (C7, T1, T2, L5, S1) no tienen región', () => {
    expect(classifyCurveRegion('C7')).toBeNull();
    expect(classifyCurveRegion('T1')).toBeNull();
    expect(classifyCurveRegion('T2')).toBeNull();
    expect(classifyCurveRegion('L5')).toBeNull();
    expect(classifyCurveRegion('S1')).toBeNull();
  });
});

describe('assignCurvesToRegions', () => {
  it('asigna una curva doble típica (PT + MT) a sus dos regiones', () => {
    const curves = [makeCurve('T2', 'T6', 'T4', 20), makeCurve('T6', 'T11', 'T8', 45)];
    const result = assignCurvesToRegions(curves);
    expect(result.regions.PT).toBe(curves[0]);
    expect(result.regions.MT).toBe(curves[1]);
    expect(result.regions.TL_L).toBeUndefined();
    expect(result.unclassified).toHaveLength(0);
    expect(result.collisions).toHaveLength(0);
  });

  it('marca como no clasificada una curva con ápex fuera de rango', () => {
    const curves = [makeCurve('C7', 'T3', 'T1', 15)];
    const result = assignCurvesToRegions(curves);
    expect(result.unclassified).toEqual(curves);
    expect(Object.keys(result.regions)).toHaveLength(0);
  });

  it('marca como no clasificada una curva sin vértebra apical', () => {
    const curves = [makeCurve('T3', 'T9', null, 20)];
    const result = assignCurvesToRegions(curves);
    expect(result.unclassified).toEqual(curves);
  });

  it('en colisión, conserva la curva de mayor ángulo y registra la descartada', () => {
    const small = makeCurve('T6', 'T9', 'T7', 15);
    const large = makeCurve('T7', 'T10', 'T8', 40);
    const result = assignCurvesToRegions([small, large]);
    expect(result.regions.MT).toBe(large);
    expect(result.collisions).toHaveLength(1);
    expect(result.collisions[0]!.discarded).toBe(small);
  });
});
