import { describe, expect, it } from 'vitest';
import {
  determineConvexity,
  evaluateCobbProgression,
  isScoliosis,
  measureCobb,
  selectCobbTerminalVertebrae,
  vertebraInclinationDeg,
} from './cobb';
import { DEFAULT_CONVENTIONS } from '../config/conventions';
import type { Pt, VertebraAnnotation } from '../models/types';

/** Platillo de anchura `width` centrado en `(xCenter, centerY)`, inclinado
 * `tiltDeg` (positivo = extremo derecho más bajo, misma convención que
 * `signedInclinationFromHorizontal`). */
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

interface VertebraSpec {
  level: VertebraAnnotation['level'];
  centerY: number;
  superiorTiltDeg: number;
  inferiorTiltDeg?: number;
  xCenter?: number;
  confidence?: number;
}

function makeVertebra(spec: VertebraSpec): VertebraAnnotation {
  const inferiorTilt = spec.inferiorTiltDeg ?? spec.superiorTiltDeg;
  const v: VertebraAnnotation = {
    level: spec.level,
    superiorEndplate: endplate(spec.centerY - 15, spec.superiorTiltDeg, spec.xCenter ?? 200),
    inferiorEndplate: endplate(spec.centerY + 15, inferiorTilt, spec.xCenter ?? 200),
    centroid: { x: spec.xCenter ?? 200, y: spec.centerY },
  };
  if (spec.confidence !== undefined) v.confidence = spec.confidence;
  return v;
}

describe('measureCobb — fixture de SPEC.md §13.1 (platillos a 15° y −20°)', () => {
  it('da Cobb = 35° con exactitud <0.1°', () => {
    const cranial = makeVertebra({ level: 'T4', centerY: 0, superiorTiltDeg: 15 });
    const caudal = makeVertebra({ level: 'T12', centerY: 200, superiorTiltDeg: -20, inferiorTiltDeg: -20 });
    const result = measureCobb([cranial, caudal]);
    expect(result.status).toBe('ok');
    expect(Math.abs(result.value! - 35)).toBeLessThan(0.1);
    expect(result.cranialVertebra).toBe('T4');
    expect(result.caudalVertebra).toBe('T12');
  });

  it('platillos horizontales dan Cobb 0°', () => {
    const cranial = makeVertebra({ level: 'T4', centerY: 0, superiorTiltDeg: 0.001 });
    const caudal = makeVertebra({ level: 'T12', centerY: 200, superiorTiltDeg: -0.001, inferiorTiltDeg: 0 });
    const result = measureCobb([cranial, caudal]);
    expect(result.value!).toBeCloseTo(0, 1);
  });
});

describe('measureCobb — selección automática de vértebras terminales y ápex', () => {
  // Curva torácica derecha: T5..T11, inflexión de signo entre T7 (+) y T9 (−).
  const rightCurve: VertebraAnnotation[] = [
    makeVertebra({ level: 'T5', centerY: 0, superiorTiltDeg: 5, xCenter: 200 }),
    makeVertebra({ level: 'T6', centerY: 30, superiorTiltDeg: 12, xCenter: 205 }),
    makeVertebra({ level: 'T7', centerY: 60, superiorTiltDeg: 18, xCenter: 210 }),
    makeVertebra({ level: 'T8', centerY: 90, superiorTiltDeg: 2, xCenter: 220 }),
    makeVertebra({ level: 'T9', centerY: 120, superiorTiltDeg: -15, xCenter: 208 }),
    makeVertebra({ level: 'T10', centerY: 150, superiorTiltDeg: -22, xCenter: 200 }),
    makeVertebra({ level: 'T11', centerY: 180, superiorTiltDeg: -8, xCenter: 195 }),
  ];

  it('elige como terminales las vértebras de inclinación máxima a cada lado de la inflexión', () => {
    const selection = selectCobbTerminalVertebrae(rightCurve);
    expect(selection.status).toBe('ok');
    expect(selection.cranial!.level).toBe('T7');
    expect(selection.caudal!.level).toBe('T10');
  });

  it('identifica la vértebra apical como la más horizontal entre las terminales', () => {
    const result = measureCobb(rightCurve);
    expect(result.apexVertebra).toBe('T8');
  });

  it('determina la convexidad según el lado de desviación del ápex', () => {
    const result = measureCobb(rightCurve);
    expect(result.convexity).toBe('right');

    const mirrored = rightCurve.map((v) => ({
      ...v,
      superiorEndplate: [
        { x: 400 - v.superiorEndplate[1].x, y: v.superiorEndplate[1].y },
        { x: 400 - v.superiorEndplate[0].x, y: v.superiorEndplate[0].y },
      ] as [Pt, Pt],
      inferiorEndplate: [
        { x: 400 - v.inferiorEndplate[1].x, y: v.inferiorEndplate[1].y },
        { x: 400 - v.inferiorEndplate[0].x, y: v.inferiorEndplate[0].y },
      ] as [Pt, Pt],
      centroid: { x: 400 - v.centroid!.x, y: v.centroid!.y },
    }));
    const mirroredResult = measureCobb(mirrored);
    expect(mirroredResult.convexity).toBe('left');
    expect(mirroredResult.value!).toBeCloseTo(result.value!, 6);
  });

  it('excluye vértebras con confianza <0.7 de la selección de terminales', () => {
    const withUnreliablePeak = rightCurve.map((v) =>
      v.level === 'T7' ? { ...v, superiorEndplate: endplate(45, 25, 210), confidence: 0.5 } : v,
    );
    const selection = selectCobbTerminalVertebrae(withUnreliablePeak);
    // T7 tendría la mayor inclinación (25°) pero queda excluido; el siguiente
    // candidato fiable del tramo craneal es T6 (12°).
    expect(selection.cranial!.level).toBe('T6');
  });
});

describe('measureCobb — desempate de terminal por inclinaciones <2° (docs/OPEN_QUESTIONS.md #2)', () => {
  it('elige la candidata más alejada del ápex y marca endplateAmbiguity', () => {
    const vertebrae: VertebraAnnotation[] = [
      makeVertebra({ level: 'T5', centerY: 0, superiorTiltDeg: 17.5 }),
      makeVertebra({ level: 'T6', centerY: 30, superiorTiltDeg: 18.0 }),
      makeVertebra({ level: 'T7', centerY: 60, superiorTiltDeg: 4 }),
      makeVertebra({ level: 'T8', centerY: 90, superiorTiltDeg: -20, inferiorTiltDeg: -20 }),
    ];
    const result = measureCobb(vertebrae);
    expect(result.endplateAmbiguity).toBe(true);
    expect(result.status).toBe('warning');
    expect(result.warnings).toContain('endplateAmbiguity');
    // 'mostIncludingCurve' (por defecto): la más alejada del ápex es T5.
    expect(result.cranialVertebra).toBe('T5');
  });

  it("respeta la alternativa 'maximizeCobb' cuando se configura explícitamente", () => {
    const vertebrae: VertebraAnnotation[] = [
      makeVertebra({ level: 'T5', centerY: 0, superiorTiltDeg: 17.5 }),
      makeVertebra({ level: 'T6', centerY: 30, superiorTiltDeg: 18.0 }),
      makeVertebra({ level: 'T7', centerY: 60, superiorTiltDeg: 4 }),
      makeVertebra({ level: 'T8', centerY: 90, superiorTiltDeg: -20, inferiorTiltDeg: -20 }),
    ];
    const conventions = {
      ...DEFAULT_CONVENTIONS,
      cobb: { ...DEFAULT_CONVENTIONS.cobb, terminalVertebraTieBreak: 'maximizeCobb' as const },
    };
    const result = measureCobb(vertebrae, { conventions });
    expect(result.cranialVertebra).toBe('T6');
  });
});

describe('measureCobb — reutilización de vértebras terminales del estudio índice (#2, regla obligatoria)', () => {
  it('usa las terminales forzadas en vez de recalcularlas', () => {
    const vertebrae: VertebraAnnotation[] = [
      makeVertebra({ level: 'T5', centerY: 0, superiorTiltDeg: 5 }),
      makeVertebra({ level: 'T6', centerY: 30, superiorTiltDeg: 20 }),
      makeVertebra({ level: 'T7', centerY: 60, superiorTiltDeg: 2 }),
      makeVertebra({ level: 'T8', centerY: 90, superiorTiltDeg: -18, inferiorTiltDeg: -18 }),
    ];
    const forced = measureCobb(vertebrae, { forcedTerminals: { cranial: 'T5', caudal: 'T8' } });
    expect(forced.cranialVertebra).toBe('T5');
    expect(forced.caudalVertebra).toBe('T8');

    const auto = measureCobb(vertebrae);
    expect(auto.cranialVertebra).toBe('T6');
  });

  it('devuelve unavailable si la vértebra forzada no está en el estudio', () => {
    const vertebrae: VertebraAnnotation[] = [
      makeVertebra({ level: 'T5', centerY: 0, superiorTiltDeg: 5 }),
      makeVertebra({ level: 'T8', centerY: 90, superiorTiltDeg: -18, inferiorTiltDeg: -18 }),
    ];
    const result = measureCobb(vertebrae, { forcedTerminals: { cranial: 'T1', caudal: 'T8' } });
    expect(result.status).toBe('unavailable');
    expect(result.value).toBeNull();
  });
});

describe('measureCobb — casos sin curva detectable', () => {
  it('unavailable con menos de dos vértebras fiables', () => {
    const result = measureCobb([makeVertebra({ level: 'T5', centerY: 0, superiorTiltDeg: 10 })]);
    expect(result.status).toBe('unavailable');
    expect(result.value).toBeNull();
  });

  it('unavailable cuando todos los platillos inclinan en el mismo sentido', () => {
    const vertebrae = [
      makeVertebra({ level: 'T5', centerY: 0, superiorTiltDeg: 5 }),
      makeVertebra({ level: 'T6', centerY: 30, superiorTiltDeg: 8 }),
      makeVertebra({ level: 'T7', centerY: 60, superiorTiltDeg: 12 }),
    ];
    const result = measureCobb(vertebrae);
    expect(result.status).toBe('unavailable');
  });
});

describe('determineConvexity — determinismo geométrico directo', () => {
  it('convex derecha cuando el ápex se desvía a la derecha de la línea terminal', () => {
    const cranial = makeVertebra({ level: 'T5', centerY: 0, superiorTiltDeg: 0, xCenter: 200 });
    const caudal = makeVertebra({ level: 'T10', centerY: 200, superiorTiltDeg: 0, xCenter: 200 });
    const apex = makeVertebra({ level: 'T8', centerY: 100, superiorTiltDeg: 0, xCenter: 230 });
    expect(determineConvexity(cranial, caudal, apex)).toBe('right');
  });

  it('convex izquierda cuando el ápex se desvía a la izquierda', () => {
    const cranial = makeVertebra({ level: 'T5', centerY: 0, superiorTiltDeg: 0, xCenter: 200 });
    const caudal = makeVertebra({ level: 'T10', centerY: 200, superiorTiltDeg: 0, xCenter: 200 });
    const apex = makeVertebra({ level: 'T8', centerY: 100, superiorTiltDeg: 0, xCenter: 170 });
    expect(determineConvexity(cranial, caudal, apex)).toBe('left');
  });
});

describe('vertebraInclinationDeg', () => {
  it('coincide con la inclinación con signo del platillo superior', () => {
    const v = makeVertebra({ level: 'T7', centerY: 0, superiorTiltDeg: 12.3 });
    expect(vertebraInclinationDeg(v)).toBeCloseTo(12.3, 6);
  });
});

describe('isScoliosis', () => {
  it('Cobb ≥10° es escoliosis (borde inclusivo)', () => {
    expect(isScoliosis(10)).toBe(true);
    expect(isScoliosis(9.9)).toBe(false);
    expect(isScoliosis(35)).toBe(true);
  });
});

describe('evaluateCobbProgression — docs/OPEN_QUESTIONS.md #4', () => {
  it('exactamente 5° de cambio se reporta como dentro del error de medición', () => {
    const result = evaluateCobbProgression(35, 30);
    expect(result.status).toBe('stable');
    expect(result.deltaDeg).toBe(5);
  });

  it('cambio estrictamente mayor a 5° es progresión', () => {
    const result = evaluateCobbProgression(35.1, 30);
    expect(result.status).toBe('progression');
  });

  it('cambio estrictamente menor a −5° es mejoría', () => {
    const result = evaluateCobbProgression(24.9, 30);
    expect(result.status).toBe('improvement');
  });

  it('respeta un umbral de progresión configurado explícitamente', () => {
    const conventions = { ...DEFAULT_CONVENTIONS, cobb: { ...DEFAULT_CONVENTIONS.cobb, progressionThresholdDeg: 3 } };
    const result = evaluateCobbProgression(34, 30, conventions);
    expect(result.status).toBe('progression');
  });
});
