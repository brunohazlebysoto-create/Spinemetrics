/**
 * RVAD de Mehta (escoliosis de inicio precoz). SPEC.md §7.9. Ref. 3 (Mehta
 * 1972).
 */
import { angleBetweenLines, perpendicularThrough } from '../geometry/primitives';
import type { Line, Pt } from '../geometry/types';
import { DEFAULT_CONVENTIONS, type Conventions } from '../config/conventions';
import { CLINICAL } from '../constants';
import type { MeasurementResult, RibAnnotation, TraceStep, VertebraAnnotation } from '../models/types';
import { endplateLine } from './vertebraGeometry';

/**
 * SPEC.md §7.9: "RVA de cada lado = ángulo entre la perpendicular al
 * platillo inferior de la vértebra apical y la línea que une el punto
 * medio de la cabeza costal con el punto medio del cuello costal."
 * `docs/OPEN_QUESTIONS.md` #31.
 */
export function measureRVA(
  apex: VertebraAnnotation,
  rib: { headMid: Pt; neckMid: Pt },
  conventions: Conventions = DEFAULT_CONVENTIONS,
): MeasurementResult {
  const inferiorLine = endplateLine(apex, 'inferior');
  const perpendicular = perpendicularThrough(inferiorLine, inferiorLine.p1);
  const ribLine: Line = { p1: rib.headMid, p2: rib.neckMid };
  const angle = angleBetweenLines(perpendicular, ribLine);

  const trace: TraceStep[] = [
    {
      step: 'RVA',
      detail:
        `Perpendicular al platillo inferior de ${apex.level} vs. línea cabeza costal–cuello costal. ` +
        `Exige zoom ≥${conventions.rotation.mehtaMinZoomPercent}% al colocar estos puntos (docs/OPEN_QUESTIONS.md #31).`,
      value: angle,
    },
  ];
  return { value: angle, unit: 'deg', status: 'ok', trace };
}

export interface RvadMeasurement extends MeasurementResult {
  concaveRVADeg: number;
  convexRVADeg: number;
  /** SPEC.md §7.9: "RVAD >20° predice progresión." */
  predictsProgression: boolean;
}

/** SPEC.md §7.9: "RVAD = RVA cóncavo − RVA convexo." */
export function measureRVAD(
  apex: VertebraAnnotation,
  ribs: RibAnnotation,
  conventions: Conventions = DEFAULT_CONVENTIONS,
): RvadMeasurement {
  const concave = measureRVA(apex, ribs.concave, conventions);
  const convex = measureRVA(apex, ribs.convex, conventions);
  const value = concave.value! - convex.value!;
  const predictsProgression = value > CLINICAL.MEHTA_RVAD_PROGRESSIVE_DEG;

  const trace: TraceStep[] = [
    ...concave.trace,
    ...convex.trace,
    {
      step: 'RVAD',
      detail: `RVA cóncavo (${concave.value!.toFixed(1)}°) − RVA convexo (${convex.value!.toFixed(1)}°). Progresión predicha si >${CLINICAL.MEHTA_RVAD_PROGRESSIVE_DEG}°.`,
      value,
    },
  ];

  return {
    value,
    unit: 'deg',
    status: 'ok',
    trace,
    concaveRVADeg: concave.value!,
    convexRVADeg: convex.value!,
    predictsProgression,
  };
}

/** SPEC.md §7.9: "Fase costal: I = sin solapamiento de la cabeza costal
 * sobre el cuerpo apical; II = con solapamiento (progresiva). Entrada
 * visual del usuario." */
export type MehtaRibPhase = 'I' | 'II';

export interface RibPhaseAssessment {
  phase: MehtaRibPhase;
  /** true en fase II — el solapamiento marca la curva como progresiva. */
  progressive: boolean;
  trace: TraceStep[];
}

export function assessRibPhase(phase: MehtaRibPhase): RibPhaseAssessment {
  const progressive = phase === 'II';
  const trace: TraceStep[] = [
    {
      step: 'fase costal de Mehta',
      detail:
        `Fase ${phase}: ${progressive ? 'con solapamiento de la cabeza costal sobre el cuerpo apical (progresiva).' : 'sin solapamiento.'}`,
    },
  ];
  return { phase, progressive, trace };
}
