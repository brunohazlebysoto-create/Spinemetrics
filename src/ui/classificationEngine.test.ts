import { describe, expect, it } from 'vitest';
import { DEFAULT_MANUAL_CLASSIFICATION_INPUTS, recomputeClassifications, type ManualClassificationInputs } from './classificationEngine';
import type { PelvicAnnotation, Pt, Radiograph, VertebraAnnotation } from '../core/models/types';

function manual(overrides: Partial<ManualClassificationInputs>): ManualClassificationInputs {
  return { ...DEFAULT_MANUAL_CLASSIFICATION_INPUTS, ...overrides };
}

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

describe('recomputeClassifications — clasificadores de entrada manual (SPEC.md §9.5–§9.7, §9.9)', () => {
  it('sin `manual`, no añade ninguna de las cuatro claves manuales', () => {
    const result = recomputeClassifications([makeRadiograph(singleMtCurve)], { ageYears: 8 });
    expect(result.ceos).toBeUndefined();
    expect(result.congenital).toBeUndefined();
    expect(result.neuromuscular).toBeUndefined();
    expect(result.lenkeSilva).toBeUndefined();
  });

  it('sin etiología elegida, no calcula C-EOS aunque la edad sea <10 (nunca por un valor por defecto)', () => {
    const result = recomputeClassifications([makeRadiograph(singleMtCurve)], {
      ageYears: 5,
      manual: manual({}),
    });
    expect(result.ceos).toBeUndefined();
  });

  it('con etiología y edad <10, calcula C-EOS a partir de la curva mayor de la PA y la cifosis máxima de la lateral', () => {
    const pa = makeRadiograph(singleMtCurve, 'PA_standing');
    const lat = makeRadiograph([makeVertebra('T5', 0, 25), makeVertebra('T12', 200, -30)], 'LAT_standing');
    const result = recomputeClassifications([pa, lat], {
      ageYears: 6,
      manual: manual({ etiology: 'idiopathic' }),
    });
    expect(result.ceos).toBeDefined();
    expect(result.ceos!.result).toMatch(/^6 /);
    const ceos = result.ceos as unknown as { agePrefix: number; etiologyCode: string; curveCategory: number | null; kyphosisCategory: string | null };
    expect(ceos.agePrefix).toBe(6);
    expect(ceos.etiologyCode).toBe('I');
    expect(ceos.curveCategory).not.toBeNull();
    expect(ceos.kyphosisCategory).not.toBeNull();
  });

  it('con edad ≥10, no calcula C-EOS aunque haya etiología (SPEC.md §9.5: sólo <10 años)', () => {
    const result = recomputeClassifications([makeRadiograph(singleMtCurve)], {
      ageYears: 14,
      manual: manual({ etiology: 'idiopathic' }),
    });
    expect(result.ceos).toBeUndefined();
  });

  it('etiología congénita activa el clasificador Winter/McMaster, incluso sin curva coronal detectada todavía', () => {
    const result = recomputeClassifications([makeRadiograph([])], {
      manual: manual({ etiology: 'congenital', congenitalFormationFailure: { kind: 'partialWedge' } }),
    });
    expect(result.congenital).toBeDefined();
    const congenital = result.congenital as unknown as { mainType: string | null };
    expect(congenital.mainType).toBe('I');
  });

  it('etiología distinta de congénita no activa Winter/McMaster', () => {
    const result = recomputeClassifications([makeRadiograph(singleMtCurve)], {
      manual: manual({ etiology: 'idiopathic', congenitalFormationFailure: { kind: 'partialWedge' } }),
    });
    expect(result.congenital).toBeUndefined();
  });

  it('etiología neuromuscular activa Lonstein-Akbarnia con los datos manuales', () => {
    const result = recomputeClassifications([makeRadiograph(singleMtCurve)], {
      manual: manual({
        etiology: 'neuromuscular',
        neuromuscularEtiologyClass: 'neuropathicUpperMotorNeuron',
        neuromuscularTrunkBalanced: true,
        neuromuscularDoubleBalancedCurve: true,
        neuromuscularGmfcs: 4,
      }),
    });
    expect(result.neuromuscular).toBeDefined();
    const nm = result.neuromuscular as unknown as { lonsteinAkbarniaGroup: string | null; highSeverityGmfcs: boolean };
    expect(nm.lonsteinAkbarniaGroup).toBe('IA');
    expect(nm.highSeverityGmfcs).toBe(true);
  });

  it('lenkeSilvaEnabled activa el árbol guiado independientemente de la etiología', () => {
    const result = recomputeClassifications([makeRadiograph(singleMtCurve)], {
      manual: manual({
        lenkeSilvaEnabled: true,
        lenkeSilvaChecklist: {
          anteriorOsteophytes: true,
          subluxationOver2mm: true,
          curveMagnitudeAbove30Or45Deg: false,
          lumbarKyphosis: false,
          globalImbalance: false,
          bendingCorrectionBelow30Percent: false,
        },
        lenkeSilvaClinicianLevel: 'III',
      }),
    });
    expect(result.lenkeSilva).toBeDefined();
    const ls = result.lenkeSilva as unknown as { level: string | null };
    expect(ls.level).toBe('III');
  });

  it('lenkeSilvaEnabled=false (por defecto) no añade la clave aunque haya checklist marcada', () => {
    const result = recomputeClassifications([makeRadiograph(singleMtCurve)], {
      manual: manual({ lenkeSilvaClinicianLevel: 'III' }),
    });
    expect(result.lenkeSilva).toBeUndefined();
  });
});
