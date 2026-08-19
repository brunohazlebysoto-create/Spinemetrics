import { describe, expect, it } from 'vitest';
import { recomputeClassifications } from './classificationEngine';
import type { PelvicAnnotation, Pt, Radiograph, VertebraAnnotation } from '../core/models/types';

function endplate(centerY: number, tiltDeg: number, xCenter = 200, width = 40): [Pt, Pt] {
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
    superiorEndplate: endplate(centerY - 15, tiltDeg, xCenter),
    inferiorEndplate: endplate(centerY + 15, tiltDeg, xCenter),
    centroid: { x: xCenter, y: centerY },
  };
}

// Curva torácica principal única (MT, ápex T8): T6..T11 con inflexión.
const singleMtCurve: VertebraAnnotation[] = [
  makeVertebra('T6', 0, 12),
  makeVertebra('T7', 30, 18),
  makeVertebra('T8', 60, 2),
  makeVertebra('T9', 90, -15),
  makeVertebra('T10', 120, -22),
  makeVertebra('T11', 150, -8),
];

function makeRadiograph(vertebrae: VertebraAnnotation[], view: Radiograph['view'] = 'PA_standing', pelvis?: PelvicAnnotation): Radiograph {
  return { id: 'r1', view, annotations: { vertebrae, ...(pelvis ? { pelvis } : {}) } };
}

describe('recomputeClassifications', () => {
  it('sin ninguna curva coronal detectable, no añade ninguna clave', () => {
    const result = recomputeClassifications(makeRadiograph([makeVertebra('T6', 0, 5), makeVertebra('T7', 30, 6)]));
    expect(Object.keys(result)).toHaveLength(0);
  });

  it('con una curva torácica única, calcula Lenke tipo 1 sin necesitar bending (PT/TL_L ausentes, no indeterminados)', () => {
    const result = recomputeClassifications(makeRadiograph(singleMtCurve));
    expect(result.lenke).toBeDefined();
    expect(result.lenke!.result).toMatch(/Lenke/);
    const lenke = result.lenke as unknown as { curveType: number | null };
    expect(lenke.curveType).toBe(1);
  });

  it('calcula King-Moe y PUMC a partir de las mismas curvas coronales', () => {
    const result = recomputeClassifications(makeRadiograph(singleMtCurve));
    expect(result.kingMoe).toBeDefined();
    expect(result.pumc).toBeDefined();
    expect(result.pumc!.result).toMatch(/PUMC/);
  });

  it('calcula el descriptor coronal de SRS-Schwab incluso sin lateral (los modificadores sagitales quedan null)', () => {
    const result = recomputeClassifications(makeRadiograph(singleMtCurve));
    expect(result.srsSchwab).toBeDefined();
    expect(result.srsSchwab!.unmetInputs).toEqual(expect.arrayContaining(['PI-LL', 'SVA', 'PT']));
  });

  it('Roussouly no se calcula en una PA (exige lateral + pelvis)', () => {
    const result = recomputeClassifications(makeRadiograph(singleMtCurve, 'PA_standing'));
    expect(result.roussouly).toBeUndefined();
  });

  it('Roussouly sí se calcula en una lateral con pelvis anotada', () => {
    const pelvis: PelvicAnnotation = {
      femoralHeads: { left: { center: { x: 160, y: 500 }, radius: 15 }, right: { center: { x: 240, y: 500 }, radius: 15 } },
      s1Endplate: [{ x: 180, y: 400 }, { x: 220, y: 400 }],
    };
    const result = recomputeClassifications(makeRadiograph(singleMtCurve, 'LAT_standing', pelvis));
    expect(result.roussouly).toBeDefined();
  });

  it('nunca lanza sobre datos parciales o atípicos', () => {
    expect(() => recomputeClassifications(makeRadiograph([]))).not.toThrow();
  });
});
