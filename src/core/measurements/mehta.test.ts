import { describe, expect, it } from 'vitest';
import { assessRibPhase, measureRVA, measureRVAD } from './mehta';
import { CLINICAL } from '../constants';
import type { RibAnnotation, VertebraAnnotation } from '../models/types';

function makeApex(): VertebraAnnotation {
  return {
    level: 'T8',
    superiorEndplate: [
      { x: 180, y: 60 },
      { x: 220, y: 60 },
    ],
    inferiorEndplate: [
      { x: 180, y: 100 },
      { x: 220, y: 100 },
    ],
  };
}

describe('measureRVA — SPEC.md §7.9', () => {
  it('0° cuando la línea costal es paralela a la perpendicular del platillo inferior', () => {
    const apex = makeApex();
    // Platillo inferior horizontal → perpendicular vertical. Línea costal
    // también vertical (dx=0) → RVA = 0°.
    const result = measureRVA(apex, { headMid: { x: 200, y: 200 }, neckMid: { x: 200, y: 100 } });
    expect(result.status).toBe('ok');
    expect(result.value!).toBeCloseTo(0, 6);
  });

  it('calcula el ángulo entre la perpendicular y la línea costal', () => {
    const apex = makeApex();
    const headMid = { x: 200, y: 200 };
    const neckMid = { x: 230, y: 160 }; // dx=30, dy=-40 respecto a headMid
    const result = measureRVA(apex, { headMid, neckMid });
    const expectedDeg = (Math.atan(30 / 40) * 180) / Math.PI;
    expect(result.value!).toBeCloseTo(expectedDeg, 6);
  });
});

describe('measureRVAD — RVA cóncavo − RVA convexo, predicción de progresión >20°', () => {
  it('calcula RVAD y marca predictsProgression cuando supera el umbral', () => {
    const apex = makeApex();
    const ribs: RibAnnotation = {
      level: 'T8',
      concave: { headMid: { x: 200, y: 200 }, neckMid: { x: 230, y: 160 } }, // ~36.87°
      convex: { headMid: { x: 200, y: 200 }, neckMid: { x: 200, y: 100 } }, // 0°
    };
    const result = measureRVAD(apex, ribs);
    const expectedConcave = (Math.atan(30 / 40) * 180) / Math.PI;
    expect(result.concaveRVADeg).toBeCloseTo(expectedConcave, 6);
    expect(result.convexRVADeg).toBeCloseTo(0, 6);
    expect(result.value!).toBeCloseTo(expectedConcave, 6);
    expect(result.value!).toBeGreaterThan(CLINICAL.MEHTA_RVAD_PROGRESSIVE_DEG);
    expect(result.predictsProgression).toBe(true);
  });

  it('no predice progresión con RVAD ≤20°', () => {
    const apex = makeApex();
    const ribs: RibAnnotation = {
      level: 'T8',
      concave: { headMid: { x: 200, y: 200 }, neckMid: { x: 210, y: 150 } }, // ángulo pequeño
      convex: { headMid: { x: 200, y: 200 }, neckMid: { x: 200, y: 100 } }, // 0°
    };
    const result = measureRVAD(apex, ribs);
    expect(result.value!).toBeLessThan(CLINICAL.MEHTA_RVAD_PROGRESSIVE_DEG);
    expect(result.predictsProgression).toBe(false);
  });
});

describe('assessRibPhase — SPEC.md §7.9', () => {
  it('fase I no es progresiva', () => {
    expect(assessRibPhase('I').progressive).toBe(false);
  });

  it('fase II es progresiva (solapamiento de la cabeza costal)', () => {
    expect(assessRibPhase('II').progressive).toBe(true);
  });
});
