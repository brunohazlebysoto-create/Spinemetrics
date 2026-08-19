import { describe, expect, it } from 'vitest';
import { computeDerivedLines } from './derivedLines';
import { recomputeMeasurementSet } from '../measurementEngine';
import type { PelvicAnnotation, Pt, Radiograph, VertebraAnnotation } from '../../core/models/types';

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

describe('computeDerivedLines', () => {
  it('sin measurementSet, no dibuja nada', () => {
    const radiograph: Radiograph = { id: 'r1', view: 'PA_standing', annotations: { vertebrae: [] } };
    expect(computeDerivedLines(radiograph, null, 800)).toEqual([]);
  });

  it('dibuja las líneas de platillo terminal del Cobb cuando es calculable', () => {
    const vertebrae = [makeVertebra('T5', 0, 10), makeVertebra('T12', 200, -15)];
    const radiograph: Radiograph = { id: 'r1', view: 'PA_standing', annotations: { vertebrae } };
    const measurementSet = recomputeMeasurementSet(radiograph);

    const lines = computeDerivedLines(radiograph, measurementSet, 800);
    const keys = lines.map((l) => l.key);
    expect(keys).toContain('cobb-cranial');
    expect(keys).toContain('cobb-caudal');
  });

  it('no dibuja líneas de Cobb cuando es unavailable', () => {
    const radiograph: Radiograph = { id: 'r1', view: 'PA_standing', annotations: { vertebrae: [] } };
    const measurementSet = recomputeMeasurementSet(radiograph);
    const lines = computeDerivedLines(radiograph, measurementSet, 800);
    expect(lines.some((l) => l.key.startsWith('cobb'))).toBe(false);
  });

  it('dibuja la CSVL cuando hay pelvis anotada, de y=0 a y=imageHeight', () => {
    const pelvis: PelvicAnnotation = {
      femoralHeads: { left: { center: { x: 160, y: 500 }, radius: 15 }, right: { center: { x: 240, y: 500 }, radius: 15 } },
      s1Endplate: [{ x: 180, y: 400 }, { x: 220, y: 400 }],
    };
    const radiograph: Radiograph = { id: 'r1', view: 'PA_standing', annotations: { vertebrae: [], pelvis } };
    const measurementSet = recomputeMeasurementSet(radiograph);
    const lines = computeDerivedLines(radiograph, measurementSet, 900);
    const csvl = lines.find((l) => l.key === 'csvl');
    expect(csvl).toBeDefined();
    expect(csvl!.points).toEqual([200, 0, 200, 900]);
  });

  it('dibuja la C7PL cuando C7 tiene centroide', () => {
    const radiograph: Radiograph = {
      id: 'r1',
      view: 'PA_standing',
      annotations: { vertebrae: [{ ...makeVertebra('C7', 0, 0, 215) }] },
    };
    const measurementSet = recomputeMeasurementSet(radiograph);
    const lines = computeDerivedLines(radiograph, measurementSet, 900);
    const c7pl = lines.find((l) => l.key === 'c7pl');
    expect(c7pl).toBeDefined();
    expect(c7pl!.points).toEqual([215, 0, 215, 900]);
  });
});
