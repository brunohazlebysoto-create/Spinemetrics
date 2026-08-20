import { describe, expect, it } from 'vitest';
import { computeSelfMeasurementComparison } from './selfMeasurementComparison';
import { recomputeMeasurementSet } from './measurementEngine';
import type { Pt, Radiograph, VertebraAnnotation } from '../core/models/types';

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

function makeVertebra(level: VertebraAnnotation['level'], centerY: number, tiltDeg: number, xCenter = 200): VertebraAnnotation {
  return {
    level,
    superiorEndplate: tiltedEndplate(centerY - 15, tiltDeg, xCenter),
    inferiorEndplate: tiltedEndplate(centerY + 15, tiltDeg, xCenter),
    centroid: { x: xCenter, y: centerY },
  };
}

function makeRadiograph(vertebrae: VertebraAnnotation[]): Radiograph {
  return { id: 'r1', view: 'PA_standing', annotations: { vertebrae } };
}

describe('computeSelfMeasurementComparison', () => {
  it('calcula propia/automática/diferencia por cada medición presente en ambos', () => {
    const automatic = recomputeMeasurementSet(makeRadiograph([makeVertebra('T5', 0, 15), makeVertebra('T12', 200, -15)]));
    // Trazo propio: casi la misma curva, pero con una imprecisión de trazado real.
    const own = recomputeMeasurementSet(makeRadiograph([makeVertebra('T5', 0, 13), makeVertebra('T12', 200, -17)]));

    const rows = computeSelfMeasurementComparison(own, automatic);
    const cobbRow = rows.find((r) => r.key === 'cobb')!;
    expect(cobbRow).toBeDefined();
    expect(cobbRow.ownValue).toBeCloseTo(own.measurements.cobb!.value!, 6);
    expect(cobbRow.automaticValue).toBeCloseTo(automatic.measurements.cobb!.value!, 6);
    expect(cobbRow.differenceValue).toBeCloseTo(cobbRow.ownValue - cobbRow.automaticValue, 6);
  });

  it('omite una medición si falta en cualquiera de los dos, nunca compara contra un hueco', () => {
    const automatic = recomputeMeasurementSet(makeRadiograph([makeVertebra('T5', 0, 15), makeVertebra('T12', 200, -15)]));
    const own = recomputeMeasurementSet(makeRadiograph([])); // sin ninguna vértebra propia trazada.

    const rows = computeSelfMeasurementComparison(own, automatic);
    expect(rows.find((r) => r.key === 'cobb')).toBeUndefined();
  });

  it('nunca lanza cuando ninguno de los dos tiene mediciones calculables', () => {
    const empty = recomputeMeasurementSet(makeRadiograph([]));
    expect(() => computeSelfMeasurementComparison(empty, empty)).not.toThrow();
    expect(computeSelfMeasurementComparison(empty, empty)).toEqual([]);
  });
});
