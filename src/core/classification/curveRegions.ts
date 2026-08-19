/**
 * Regiones de curva (base de Lenke). SPEC.md §7.3. Clasifica las curvas
 * candidatas de `core/measurements/cobb.ts` (`detectAllCobbCurves`) por la
 * región anatómica de su vértebra apical — esto sí es clasificación, no
 * medición: `cobb.ts` mide ángulos y detecta inflexiones, este módulo
 * interpreta esas curvas en términos clínicos.
 */
import type { CobbCurveCandidate } from '../measurements/cobb';
import type { SpinalLevel, TraceStep } from '../models/types';
import { isSpinalLevelBetween } from '../models/spinalLevelOrder';

export type CurveRegion = 'PT' | 'MT' | 'TL_L';

/**
 * SPEC.md §7.3:
 * - Torácica proximal (PT): ápex entre T3 y T5.
 * - Torácica principal (MT): ápex entre T6 y el disco T11-T12.
 * - Toracolumbar/lumbar (TL/L): ápex entre T12-L1 (TL) y L1-L4 (L).
 *
 * El modelo de datos sólo representa vértebras, nunca discos (no hay
 * landmarks de disco intervertebral en `VertebraAnnotation`), así que el
 * límite "disco T11-T12" se traduce al nivel vertebral más próximo: MT
 * incluye hasta T11, TL_L empieza en T12. Es la misma simplificación que ya
 * hace `docs/OPEN_QUESTIONS.md` #9 para el ápex lumbar en un disco.
 */
const REGION_RANGES: Record<CurveRegion, [SpinalLevel, SpinalLevel]> = {
  PT: ['T3', 'T5'],
  MT: ['T6', 'T11'],
  TL_L: ['T12', 'L4'],
};

export const CURVE_REGION_LABELS: Record<CurveRegion, string> = {
  PT: 'Torácica proximal (PT)',
  MT: 'Torácica principal (MT)',
  TL_L: 'Toracolumbar/lumbar (TL/L)',
};

/** Región de curva a la que pertenece un nivel apical, o `null` si el nivel
 * queda fuera de los tres rangos definidos (p. ej. apex en C7, T1, T2, L5 o
 * S1 — anatómicamente atípico para una curva escoliótica estándar). */
export function classifyCurveRegion(apexLevel: SpinalLevel): CurveRegion | null {
  for (const region of Object.keys(REGION_RANGES) as CurveRegion[]) {
    const [from, to] = REGION_RANGES[region];
    if (isSpinalLevelBetween(apexLevel, from, to)) return region;
  }
  return null;
}

export interface RegionCollision {
  region: CurveRegion;
  /** Curva descartada (menor |ángulo|) al colisionar dos candidatas en la
   * misma región. */
  discarded: CobbCurveCandidate;
}

export interface AssignCurvesToRegionsResult {
  regions: Partial<Record<CurveRegion, CobbCurveCandidate>>;
  /** Curvas cuyo ápex no cae en ninguna región reconocida, o sin ápex
   * determinado (nunca se descartan en silencio). */
  unclassified: CobbCurveCandidate[];
  /** Cuándo dos o más curvas candidatas caen en la misma región: se
   * conserva la de mayor ángulo (más representativa clínicamente de esa
   * región) y se registra la descartada, nunca se pierde en silencio. */
  collisions: RegionCollision[];
  trace: TraceStep[];
}

/**
 * Asigna cada curva candidata (`detectAllCobbCurves`) a su región PT/MT/TL_L
 * según el nivel de su vértebra apical. En arquitectura de curva estándar
 * (2–4 tramos de signo) hay como mucho una curva por región; si la
 * detección geométrica produce más de una candidata para la misma región
 * (caso atípico), se conserva la de mayor ángulo y se registra en
 * `collisions` — nunca se descarta en silencio.
 */
export function assignCurvesToRegions(curves: CobbCurveCandidate[]): AssignCurvesToRegionsResult {
  const regions: Partial<Record<CurveRegion, CobbCurveCandidate>> = {};
  const unclassified: CobbCurveCandidate[] = [];
  const collisions: RegionCollision[] = [];
  const trace: TraceStep[] = [];

  for (const curve of curves) {
    const apexLevel = curve.apexVertebra?.level ?? null;
    const region = apexLevel ? classifyCurveRegion(apexLevel) : null;

    if (!region) {
      unclassified.push(curve);
      trace.push({
        step: 'curva sin región',
        detail: apexLevel
          ? `Ápex en ${apexLevel}, fuera de los rangos PT/MT/TL_L (SPEC.md §7.3).`
          : 'Curva sin vértebra apical determinada: no se puede asignar región.',
      });
      continue;
    }

    const existing = regions[region];
    if (!existing) {
      regions[region] = curve;
      trace.push({
        step: `región ${region}`,
        detail: `${curve.cranialVertebra.level}–${curve.caudalVertebra.level}, ápex ${apexLevel}.`,
        value: curve.angle,
      });
      continue;
    }

    const [kept, discarded] = curve.angle >= existing.angle ? [curve, existing] : [existing, curve];
    regions[region] = kept;
    collisions.push({ region, discarded });
    trace.push({
      step: `colisión de región ${region}`,
      detail:
        `Dos curvas candidatas con ápex en la región ${region}; se conserva la de mayor ángulo ` +
        `(${kept.cranialVertebra.level}–${kept.caudalVertebra.level}, ${kept.angle.toFixed(1)}°).`,
    });
  }

  return { regions, unclassified, collisions, trace };
}
