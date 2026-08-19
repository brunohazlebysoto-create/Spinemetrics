/**
 * King-Moe. SPEC.md §9.2. "Se incluye por valor histórico y comunicacional:
 * sólo coronal, sólo torácicas, fiabilidad interobservador pobre-regular."
 * `docs/OPEN_QUESTIONS.md` #25: el componente de rigidez del tipo II no se
 * automatiza — es una entrada manual del usuario (conmutador), nunca una
 * medición.
 */
import { DEFAULT_CONVENTIONS, type Conventions } from '../config/conventions';
import type { ClassificationResult, RadiographView, TraceStep } from '../models/types';

export type KingMoeType = 'I' | 'II' | 'III' | 'IV' | 'V';

export const KING_MOE_HISTORICAL_NOTE =
  'King-Moe se incluye por valor histórico y comunicacional: sólo describe curvas coronales torácicas, ' +
  'fiabilidad interobservador pobre-regular. No usar para decidir niveles de fusión (SPEC.md §9.2).';

export interface KingMoeInput {
  view: RadiographView;
  /** Cobb de la curva torácica principal en bipedestación, o `null` si no
   * hay curva torácica medible. */
  thoracicCobbDeg: number | null;
  /** Cobb de la curva lumbar en bipedestación, o `null` si no hay curva
   * lumbar (curva única, no en S). */
  lumbarCobbDeg: number | null;
  /** true si hay una curva torácica proximal también estructural (base del
   * tipo V, doble torácica). */
  doubleThoracic: boolean | null;
  /** `docs/OPEN_QUESTIONS.md` #25: entrada manual — el clínico indica que
   * la curva torácica es más rígida que la lumbar aunque no sea mayor en
   * magnitud. `null` si no se ha evaluado. */
  thoracicMoreRigidManual: boolean | null;
  /** Criterio clásico del tipo IV ("torácica larga"): L4 inclinada hacia la
   * curva torácica. No es automatizable con el modelo de landmarks actual
   * (exige el platillo de L4 y su relación con el sacro) — entrada manual.
   * `null` si no se ha evaluado. */
  longThoracicCurveManual: boolean | null;
}

export interface KingMoeResult extends ClassificationResult {
  type: KingMoeType | null;
}

export function classifyKingMoe(input: KingMoeInput, conventions: Conventions = DEFAULT_CONVENTIONS): KingMoeResult {
  const trace: TraceStep[] = [{ step: 'nota histórica', detail: KING_MOE_HISTORICAL_NOTE }];
  const unmetInputs: string[] = [];

  if (conventions.cobb.requireStandingForClassification && input.view !== 'PA_standing') {
    return {
      result: 'No clasificable: King-Moe exige radiografía en bipedestación (PA_standing).',
      trace: [...trace, { step: 'proyección', detail: `Proyección recibida: '${input.view}'.` }],
      unmetInputs: ['view'],
      type: null,
    };
  }

  if (input.thoracicCobbDeg === null) {
    return {
      result: 'No clasificable: sin curva torácica medible.',
      trace,
      unmetInputs: ['thoracicCobb'],
      type: null,
    };
  }

  if (input.doubleThoracic === true) {
    trace.push({ step: 'tipo V', detail: 'Curva torácica proximal también estructural: doble torácica.' });
    return { result: 'King-Moe V', trace, type: 'V' };
  }

  if (input.longThoracicCurveManual === true) {
    trace.push({ step: 'tipo IV', detail: 'L4 inclinada hacia la curva torácica (criterio manual): torácica larga.' });
    return { result: 'King-Moe IV', trace, type: 'IV' };
  }

  if (input.lumbarCobbDeg === null) {
    trace.push({ step: 'tipo III', detail: 'Sin curva lumbar estructural (no hay curva en S): torácica sin lumbar estructural.' });
    return { result: 'King-Moe III', trace, type: 'III' };
  }

  trace.push({
    step: 'curva en S',
    detail: `Torácica ${input.thoracicCobbDeg.toFixed(1)}°, lumbar ${input.lumbarCobbDeg.toFixed(1)}°.`,
  });

  const thoracicLargerByMagnitude = input.thoracicCobbDeg > input.lumbarCobbDeg;
  if (thoracicLargerByMagnitude) {
    trace.push({ step: 'tipo II (magnitud)', detail: 'Torácica mayor que lumbar por magnitud.' });
    return { result: 'King-Moe II', trace, type: 'II' };
  }

  if (input.thoracicMoreRigidManual === true) {
    trace.push({
      step: 'tipo II (rigidez, docs/OPEN_QUESTIONS.md #25)',
      detail: 'Lumbar de mayor o igual magnitud, pero la torácica se marcó manualmente como más rígida.',
    });
    return { result: 'King-Moe II', trace, type: 'II' };
  }

  if (input.thoracicCobbDeg < input.lumbarCobbDeg) {
    trace.push({ step: 'tipo I', detail: 'Lumbar mayor que torácica: curva en S con lumbar mayor.' });
    return { result: 'King-Moe I', trace, type: 'I' };
  }

  // Empate exacto de magnitud y sin criterio de rigidez manual: no fabricar
  // I ni II (docs/OPEN_QUESTIONS.md #25 pide un conmutador manual explícito
  // para este caso, no una regla de desempate silenciosa).
  unmetInputs.push('thoracicMoreRigidManual');
  trace.push({
    step: 'tipo I vs II indeterminado',
    detail: 'Torácica y lumbar de igual magnitud: se necesita el conmutador manual de rigidez (docs/OPEN_QUESTIONS.md #25).',
  });
  return {
    result: 'No clasificable entre I y II: torácica y lumbar de igual magnitud, falta indicación manual de rigidez.',
    trace,
    unmetInputs,
    type: null,
  };
}
