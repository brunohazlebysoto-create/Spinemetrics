/**
 * Flexibilidad. SPEC.md §7.10. Ref. 9 (Cheung & Luk 1997 — fulcrum
 * bending), 11 (Lenke 2001 — umbral de 25° en bending supino).
 */
import { DEFAULT_CONVENTIONS, type Conventions } from '../config/conventions';
import { CLINICAL } from '../constants';
import type { MeasurementResult, Radiograph, TraceStep } from '../models/types';

export interface StructuralAssessment {
  structural: boolean;
  trace: TraceStep[];
}

/**
 * SPEC.md §7.10: "Curva menor estructural: no corrige por debajo de 25° en
 * inclinación lateral supina." `docs/OPEN_QUESTIONS.md` #6 ★: el borde es
 * inclusivo por defecto (bending exactamente 25.0° → estructural).
 */
export function assessCurveStructurality(
  bendingCobbDeg: number,
  conventions: Conventions = DEFAULT_CONVENTIONS,
): StructuralAssessment {
  const threshold = CLINICAL.STRUCTURAL_BENDING_DEG;
  const structural = conventions.lenke.structuralThresholdsInclusive
    ? bendingCobbDeg >= threshold
    : bendingCobbDeg > threshold;
  const trace: TraceStep[] = [
    {
      step: 'estructuralidad por bending',
      detail:
        `Cobb en bending ${bendingCobbDeg.toFixed(1)}° ${structural ? '≥' : '<'} ${threshold}° → ` +
        `${structural ? 'estructural' : 'no estructural'} (docs/OPEN_QUESTIONS.md #6).`,
      value: bendingCobbDeg,
    },
  ];
  return { structural, trace };
}

/**
 * SPEC.md §7.10: "Índice de flexibilidad = (Cobb de pie − Cobb en
 * bending/fulcrum) / Cobb de pie × 100."
 */
export function measureFlexibilityIndex(standingCobbDeg: number, correctedCobbDeg: number): MeasurementResult {
  if (standingCobbDeg === 0) {
    return {
      value: null,
      unit: 'ratio',
      status: 'unavailable',
      reason: 'No se puede calcular el índice de flexibilidad con Cobb de pie = 0°.',
      trace: [],
    };
  }
  const value = ((standingCobbDeg - correctedCobbDeg) / standingCobbDeg) * 100;
  const trace: TraceStep[] = [
    {
      step: 'índice de flexibilidad',
      detail: '(Cobb de pie − Cobb en bending/fulcrum) / Cobb de pie × 100, en %.',
      value,
    },
  ];
  return { value, unit: 'ratio', status: 'ok', trace };
}

/**
 * SPEC.md §7.10: "FBCI = (tasa de corrección quirúrgica / flexibilidad en
 * fulcrum) × 100." Ambos parámetros son porcentajes (0–100).
 */
export function measureFBCI(surgicalCorrectionRatePercent: number, fulcrumFlexibilityPercent: number): MeasurementResult {
  if (fulcrumFlexibilityPercent === 0) {
    return {
      value: null,
      unit: 'ratio',
      status: 'unavailable',
      reason: 'No se puede calcular el FBCI con flexibilidad en fulcrum = 0%.',
      trace: [],
    };
  }
  const value = (surgicalCorrectionRatePercent / fulcrumFlexibilityPercent) * 100;
  const trace: TraceStep[] = [
    { step: 'FBCI', detail: '(tasa de corrección quirúrgica / flexibilidad en fulcrum) × 100.', value },
  ];
  return { value, unit: 'ratio', status: 'ok', trace };
}

export interface FlexibilityFilmSet {
  standing: Radiograph | null;
  bendLeft: Radiograph | null;
  bendRight: Radiograph | null;
  fulcrum: Radiograph | null;
  traction: Radiograph | null;
}

/**
 * SPEC.md §7.10: "Emparejar automáticamente la placa de bipedestación con
 * sus bendings del mismo estudio." `radiographs` debe ser el array de un
 * único `Study` (SPEC.md §5): el emparejamiento es una simple selección por
 * `view` dentro de ese ámbito, nunca una búsqueda entre estudios distintos.
 */
export function pairFlexibilityFilms(radiographs: Radiograph[]): FlexibilityFilmSet {
  return {
    standing: radiographs.find((r) => r.view === 'PA_standing') ?? null,
    bendLeft: radiographs.find((r) => r.view === 'BEND_left') ?? null,
    bendRight: radiographs.find((r) => r.view === 'BEND_right') ?? null,
    fulcrum: radiographs.find((r) => r.view === 'FULCRUM') ?? null,
    traction: radiographs.find((r) => r.view === 'TRACTION') ?? null,
  };
}
