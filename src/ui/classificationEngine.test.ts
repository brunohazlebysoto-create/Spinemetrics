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

// Curva doble PT (T3–T5, ápex T4, menor) + MT (T5–T8, ápex ~T8, mayor):
// comparten T5 como vértebra de inflexión, igual que
// `cobb.test.ts::detectAllCobbCurves`. MT es mayor por ángulo → estructural
// por definición; PT es menor → su estructuralidad depende del bending.
const ptPlusMtCurve: VertebraAnnotation[] = [
  makeVertebra('T2', 0, 5),
  makeVertebra('T3', 30, 15),
  makeVertebra('T4', 60, -3),
  makeVertebra('T5', 90, -18),
  makeVertebra('T6', 120, -10),
  makeVertebra('T7', 150, 2),
  makeVertebra('T8', 180, 25),
  makeVertebra('T9', 210, 8),
];

function makeRadiograph(vertebrae: VertebraAnnotation[], view: Radiograph['view'] = 'PA_standing', pelvis?: PelvicAnnotation): Radiograph {
  return { id: 'r1', view, annotations: { vertebrae, ...(pelvis ? { pelvis } : {}) } };
}

function findRegion(curves: { region: string; structural: boolean | null }[], region: string): boolean | null {
  return curves.find((c) => c.region === region)?.structural ?? null;
}

describe('recomputeClassifications', () => {
  it('sin ninguna curva coronal detectable, no añade ninguna clave', () => {
    const result = recomputeClassifications([makeRadiograph([makeVertebra('T6', 0, 5), makeVertebra('T7', 30, 6)])]);
    expect(Object.keys(result)).toHaveLength(0);
  });

  it('sin ninguna PA_standing en el estudio, no añade ninguna clave (nunca se calcula sobre otra vista)', () => {
    const result = recomputeClassifications([makeRadiograph(singleMtCurve, 'LAT_standing')]);
    expect(Object.keys(result)).toHaveLength(0);
  });

  it('con una curva torácica única, calcula Lenke tipo 1 sin necesitar bending (PT/TL_L ausentes, no indeterminados)', () => {
    const result = recomputeClassifications([makeRadiograph(singleMtCurve)]);
    expect(result.lenke).toBeDefined();
    expect(result.lenke!.result).toMatch(/Lenke/);
    const lenke = result.lenke as unknown as { curveType: number | null };
    expect(lenke.curveType).toBe(1);
  });

  it('calcula King-Moe y PUMC a partir de las mismas curvas coronales', () => {
    const result = recomputeClassifications([makeRadiograph(singleMtCurve)]);
    expect(result.kingMoe).toBeDefined();
    expect(result.pumc).toBeDefined();
    expect(result.pumc!.result).toMatch(/PUMC/);
  });

  it('calcula el descriptor coronal de SRS-Schwab incluso sin lateral (los modificadores sagitales quedan null)', () => {
    const result = recomputeClassifications([makeRadiograph(singleMtCurve)]);
    expect(result.srsSchwab).toBeDefined();
    expect(result.srsSchwab!.unmetInputs).toEqual(expect.arrayContaining(['PI-LL', 'SVA', 'PT']));
  });

  it('Roussouly no se calcula sin ninguna lateral en el estudio (exige lateral + pelvis)', () => {
    const result = recomputeClassifications([makeRadiograph(singleMtCurve, 'PA_standing')]);
    expect(result.roussouly).toBeUndefined();
  });

  it('Roussouly sí se calcula cuando el estudio incluye una lateral con pelvis anotada', () => {
    const pelvis: PelvicAnnotation = {
      femoralHeads: { left: { center: { x: 160, y: 500 }, radius: 15 }, right: { center: { x: 240, y: 500 }, radius: 15 } },
      s1Endplate: [{ x: 180, y: 400 }, { x: 220, y: 400 }],
    };
    const pa = makeRadiograph(singleMtCurve, 'PA_standing');
    const lat = makeRadiograph(singleMtCurve, 'LAT_standing', pelvis);
    const result = recomputeClassifications([pa, lat]);
    expect(result.roussouly).toBeDefined();
  });

  it('nunca lanza sobre datos parciales o atípicos', () => {
    expect(() => recomputeClassifications([makeRadiograph([])])).not.toThrow();
  });

  it('usa la lateral del estudio (no la PA activa) para el modificador sagital T5-T12 de Lenke', () => {
    const pa = makeRadiograph(singleMtCurve, 'PA_standing');
    const withoutLat = recomputeClassifications([pa]);
    expect(withoutLat.lenke).toBeDefined();
    const withoutLatResult = withoutLat.lenke as unknown as { sagittalModifier: string | null };
    expect(withoutLatResult.sagittalModifier).toBeNull();

    // T5 y T12 con inclinaciones marcadamente opuestas → cifosis alta (>40°).
    const kyphoticVertebrae: VertebraAnnotation[] = [makeVertebra('T5', 0, 20), makeVertebra('T12', 200, -30)];
    const lat = makeRadiograph(kyphoticVertebrae, 'LAT_standing');
    const withLat = recomputeClassifications([pa, lat]);
    expect(withLat.lenke).toBeDefined();
    const withLatResult = withLat.lenke as unknown as { sagittalModifier: string | null };
    expect(withLatResult.sagittalModifier).not.toBeNull();
  });

  it('usa el bending del estudio (no la PA activa) para decidir la estructuralidad de la curva menor (PT)', () => {
    const pa = makeRadiograph(ptPlusMtCurve, 'PA_standing');

    // Bending derecho: T3 y T5 casi paralelos → Cobb forzado T3-T5 cercano
    // a 0° → PT debería salir no estructural.
    const correctedPt: VertebraAnnotation[] = [makeVertebra('T3', 30, 10), makeVertebra('T5', 90, 8)];
    const bendRight = makeRadiograph(correctedPt, 'BEND_right');

    const result = recomputeClassifications([pa, bendRight]);
    expect(result.lenke).toBeDefined();
    const lenke = result.lenke as unknown as { curves: { region: string; structural: boolean | null }[] };
    expect(findRegion(lenke.curves, 'PT')).toBe(false);
  });

  it('con ambos bending, usa el más corregido (menor) de los dos para PT (docs/OPEN_QUESTIONS.md #46)', () => {
    const pa = makeRadiograph(ptPlusMtCurve, 'PA_standing');

    // Izquierdo: sin corregir (misma angulación que en bipedestación) →
    // por sí solo daría PT estructural.
    const bendLeft = makeRadiograph([makeVertebra('T3', 30, 15), makeVertebra('T5', 90, -18)], 'BEND_left');
    // Derecho: corregido casi a 0° → por sí solo daría PT no estructural.
    const bendRight = makeRadiograph([makeVertebra('T3', 30, 10), makeVertebra('T5', 90, 8)], 'BEND_right');

    const result = recomputeClassifications([pa, bendLeft, bendRight]);
    expect(result.lenke).toBeDefined();
    const lenke = result.lenke as unknown as { curves: { region: string; structural: boolean | null }[] };
    // Criterio conservador: se usa el mínimo (más corregido) de ambos → no
    // estructural, igual que si sólo existiera el derecho.
    expect(findRegion(lenke.curves, 'PT')).toBe(false);
  });
});
