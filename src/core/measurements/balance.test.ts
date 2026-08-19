import { describe, expect, it } from 'vitest';
import {
  c7plX,
  csvlX,
  determineNeutralVertebra,
  determineStableVertebra,
  measureApicalTranslation,
  measureCoronalBalance,
} from './balance';
import { calibrationFromRuler } from '../calibration/calibration';
import type { PelvicAnnotation, Pt, VertebraAnnotation } from '../models/types';

function flatEndplate(xCenter: number, y: number, width = 40): [Pt, Pt] {
  return [
    { x: xCenter - width / 2, y },
    { x: xCenter + width / 2, y },
  ];
}

function makeVertebra(level: VertebraAnnotation['level'], xCenter: number, y: number): VertebraAnnotation {
  return {
    level,
    superiorEndplate: flatEndplate(xCenter, y - 15),
    inferiorEndplate: flatEndplate(xCenter, y + 15),
    centroid: { x: xCenter, y },
  };
}

function makePelvis(s1MidX: number): PelvicAnnotation {
  return {
    femoralHeads: {
      left: { center: { x: s1MidX - 40, y: 400 }, radius: 15 },
      right: { center: { x: s1MidX + 40, y: 400 }, radius: 15 },
    },
    s1Endplate: [
      { x: s1MidX - 20, y: 380 },
      { x: s1MidX + 20, y: 380 },
    ],
  };
}

describe('csvlX / c7plX', () => {
  it('CSVL es el punto medio del platillo superior de S1', () => {
    expect(csvlX(makePelvis(200))).toBeCloseTo(200, 6);
  });

  it('C7PL es el centroide de C7', () => {
    const vertebrae = [makeVertebra('C7', 210, 0), makeVertebra('T1', 205, 30)];
    expect(c7plX(vertebrae)).toBeCloseTo(210, 6);
  });

  it('devuelve null si no hay C7 anotado', () => {
    expect(c7plX([makeVertebra('T1', 205, 30)])).toBeNull();
  });
});

describe('measureCoronalBalance', () => {
  it('unavailable sin C7', () => {
    const result = measureCoronalBalance([makeVertebra('T1', 200, 0)], makePelvis(200), undefined);
    expect(result.status).toBe('unavailable');
    expect(result.value).toBeNull();
  });

  it('gris sin calibración aunque C7 y S1 estén anotados', () => {
    const vertebrae = [makeVertebra('C7', 210, 0)];
    const result = measureCoronalBalance(vertebrae, makePelvis(200), undefined);
    expect(result.status).toBe('unavailable');
    expect(result.value).toBeNull();
  });

  it('positivo cuando C7PL está a la derecha de la CSVL (mm correctos con calibración)', () => {
    const calibration = calibrationFromRuler(100, 10); // 10 px/mm
    const vertebrae = [makeVertebra('C7', 220, 0)]; // 20 px a la derecha de CSVL en x=200
    const result = measureCoronalBalance(vertebrae, makePelvis(200), calibration);
    expect(result.status).toBe('ok');
    expect(result.value).toBeCloseTo(2, 6); // 20 px / 10 px-per-mm = 2 mm
  });

  it('negativo cuando C7PL está a la izquierda de la CSVL', () => {
    const calibration = calibrationFromRuler(100, 10);
    const vertebrae = [makeVertebra('C7', 180, 0)];
    const result = measureCoronalBalance(vertebrae, makePelvis(200), calibration);
    expect(result.value).toBeCloseTo(-2, 6);
  });
});

describe('measureApicalTranslation', () => {
  it('distancia con signo del centroide apical a la CSVL', () => {
    const calibration = calibrationFromRuler(100, 10); // 10 px/mm
    const apex = makeVertebra('T8', 230, 100); // 30 px a la derecha de CSVL en x=200
    const result = measureApicalTranslation(apex, makePelvis(200), calibration);
    expect(result.status).toBe('ok');
    expect(result.value).toBeCloseTo(3, 6);
  });

  it('gris sin calibración', () => {
    const apex = makeVertebra('T8', 230, 100);
    const result = measureApicalTranslation(apex, makePelvis(200), undefined);
    expect(result.status).toBe('unavailable');
  });
});

describe('determineStableVertebra — docs/OPEN_QUESTIONS.md #27', () => {
  it('elige la vértebra cuyo centroide está más cerca de la CSVL', () => {
    const vertebrae = [
      makeVertebra('L1', 220, 0),
      makeVertebra('L2', 205, 30),
      makeVertebra('L3', 240, 60),
    ];
    const stable = determineStableVertebra(vertebrae, makePelvis(200));
    expect(stable!.level).toBe('L2');
  });

  it('en caso de empate exacto, elige la más caudal', () => {
    const vertebrae = [
      makeVertebra('L3', 210, 0), // 10 px de distancia
      makeVertebra('L4', 190, 30), // también 10 px de distancia
    ];
    const stable = determineStableVertebra(vertebrae, makePelvis(200));
    expect(stable!.level).toBe('L4');
  });
});

describe('determineNeutralVertebra — docs/OPEN_QUESTIONS.md #28', () => {
  function withPedicles(
    level: VertebraAnnotation['level'],
    pedicleLeftX: number,
    pedicleRightX: number,
    borderLeftX: number,
    borderRightX: number,
  ): VertebraAnnotation {
    const v = makeVertebra(level, (borderLeftX + borderRightX) / 2, 0);
    return {
      ...v,
      pedicles: { left: { x: pedicleLeftX, y: 0 }, right: { x: pedicleRightX, y: 0 } },
      lateralBorders: [
        { x: borderLeftX, y: 0 },
        { x: borderRightX, y: 0 },
      ],
    };
  }

  it('unavailable si ninguna vértebra tiene pedículos y bordes anotados', () => {
    const result = determineNeutralVertebra([makeVertebra('T8', 200, 0)]);
    expect(result.status).toBe('unavailable');
    expect(result.vertebra).toBeNull();
  });

  it('elige la de menor asimetría relativa y la marca neutra si <10%', () => {
    // T7: pedículos simétricos (asimetría 0%).
    const symmetric = withPedicles('T7', 190, 210, 180, 220);
    // T8: asimetría grande (pedículo derecho mucho más cerca del borde).
    const asymmetric = withPedicles('T8', 185, 215, 180, 216);
    const result = determineNeutralVertebra([asymmetric, symmetric]);
    expect(result.status).toBe('ok');
    expect(result.vertebra!.level).toBe('T7');
    expect(result.asymmetry).toBeCloseTo(0, 6);
    expect(result.isNeutral).toBe(true);
  });

  it('marca isNeutral false si la mejor candidata supera el umbral', () => {
    // Asimetría relativa: |10-16|/16 = 37.5%, muy por encima del 10%.
    const onlyAsymmetric = withPedicles('T8', 190, 200, 180, 216);
    const result = determineNeutralVertebra([onlyAsymmetric]);
    expect(result.status).toBe('ok');
    expect(result.isNeutral).toBe(false);
  });
});
