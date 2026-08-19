/**
 * C-EOS (inicio precoz, <10 años). SPEC.md §9.5. `docs/OPEN_QUESTIONS.md`
 * #22 ★★ (hueco 50/51), #23 (cifosis máxima — ver
 * `core/measurements/sagittal.ts`, `measureMaxKyphosis`), #24 (modificador
 * de progresión).
 */
import { CLINICAL } from '../constants';
import type { ClassificationResult, ScoliosisEtiology, TraceStep } from '../models/types';

export type CeosEtiologyCode = 'C' | 'M' | 'S' | 'I';
export type CeosCurveCategory = 1 | 2 | 3 | 4;
export type CeosKyphosisCategory = '-' | 'N' | '+';
export type CeosProgressionModifier = 'P0' | 'P1' | 'P2';

/** SPEC.md §9.5: C = congénita, M = neuromuscular, S = sindrómica, I =
 * idiopática — mismas categorías que `ScoliosisEtiology` (§5). */
const ETIOLOGY_CODE: Record<ScoliosisEtiology, CeosEtiologyCode> = {
  congenital: 'C',
  neuromuscular: 'M',
  syndromic: 'S',
  idiopathic: 'I',
};

const MIN_PROGRESSION_INTERVAL_YEARS = 0.5;

export interface CeosProgressionInput {
  priorCobbDeg: number;
  priorDate: string;
  currentCobbDeg: number;
  currentDate: string;
}

export interface CeosClassificationInput {
  ageYears: number;
  etiology: ScoliosisEtiology | null;
  majorCobbDeg: number | null;
  /** Cifosis máxima por barrido T1–L2 (`measureMaxKyphosis`), no una cifosis
   * de niveles fijos (`docs/OPEN_QUESTIONS.md` #23). */
  maxKyphosisDeg: number | null;
  /** `docs/OPEN_QUESTIONS.md` #24: opcional; `null` si no hay dos estudios
   * fechados disponibles. */
  progression: CeosProgressionInput | null;
}

export interface CeosClassificationResult extends ClassificationResult {
  agePrefix: number | null;
  etiologyCode: CeosEtiologyCode | null;
  curveCategory: CeosCurveCategory | null;
  kyphosisCategory: CeosKyphosisCategory | null;
  progressionModifier: CeosProgressionModifier | null;
}

/**
 * `docs/OPEN_QUESTIONS.md` #22 ★★: "2 = 20–50°, 3 = 51–90°" deja sin
 * categoría los valores entre 50 y 51 (p. ej. 50.4°). Por defecto: corte
 * único en 50 (`≤50 → 2; >50 → 3`), eliminando el hueco.
 */
function classifyCurveCategory(cobbDeg: number): CeosCurveCategory {
  const [c1, c2, c3] = CLINICAL.CEOS.curve;
  if (cobbDeg < c1) return 1;
  if (cobbDeg <= c2) return 2;
  if (cobbDeg <= c3) return 3;
  return 4;
}

function classifyKyphosisCategory(kyphosisDeg: number): CeosKyphosisCategory {
  const [k1, k2] = CLINICAL.CEOS.kyphosis;
  if (kyphosisDeg < k1) return '-';
  if (kyphosisDeg <= k2) return 'N';
  return '+';
}

function yearsBetween(fromIso: string, toIso: string): number {
  const msPerYear = 365.25 * 24 * 60 * 60 * 1000;
  return (new Date(toIso).getTime() - new Date(fromIso).getTime()) / msPerYear;
}

interface ProgressionAssessment {
  modifier: CeosProgressionModifier | null;
  trace: TraceStep[];
  unmetInputs: string[];
}

/**
 * `docs/OPEN_QUESTIONS.md` #24: "P0 <10°/año, P1 10–19.9°/año, P2 ≥20°/año.
 * Requiere dos estudios con fecha; anualizar linealmente y exigir un
 * intervalo mínimo de 6 meses; por debajo de eso, no calcular el
 * modificador (el ruido de medición domina)."
 */
function assessProgression(input: CeosProgressionInput | null): ProgressionAssessment {
  if (!input) {
    return { modifier: null, trace: [], unmetInputs: [] };
  }

  const intervalYears = yearsBetween(input.priorDate, input.currentDate);
  const trace: TraceStep[] = [
    {
      step: 'intervalo entre estudios',
      detail: `${intervalYears.toFixed(2)} años (${input.priorDate} → ${input.currentDate}).`,
      value: intervalYears,
    },
  ];

  if (intervalYears < MIN_PROGRESSION_INTERVAL_YEARS) {
    trace.push({
      step: 'modificador de progresión',
      detail: `Intervalo <${MIN_PROGRESSION_INTERVAL_YEARS * 12} meses: no se calcula (docs/OPEN_QUESTIONS.md #24, el ruido de medición domina).`,
    });
    return { modifier: null, trace, unmetInputs: ['progressionInterval'] };
  }

  const rateDegPerYear = (input.currentCobbDeg - input.priorCobbDeg) / intervalYears;
  trace.push({
    step: 'tasa de progresión anualizada',
    detail: `(${input.currentCobbDeg.toFixed(1)}° − ${input.priorCobbDeg.toFixed(1)}°) / ${intervalYears.toFixed(2)} años.`,
    value: rateDegPerYear,
  });

  const [p1Lo, p2Lo] = CLINICAL.CEOS.progression;
  let modifier: CeosProgressionModifier;
  if (rateDegPerYear < p1Lo) modifier = 'P0';
  else if (rateDegPerYear < p2Lo) modifier = 'P1';
  else modifier = 'P2';

  trace.push({ step: 'modificador de progresión', detail: `${rateDegPerYear.toFixed(1)}°/año → '${modifier}'.` });
  return { modifier, trace, unmetInputs: [] };
}

/** SPEC.md §9.5: salida p. ej. `5 M3+P1` (edad, etiología+curva+cifosis,
 * modificador de progresión opcional). */
export function classifyCEOS(input: CeosClassificationInput): CeosClassificationResult {
  const trace: TraceStep[] = [];
  const unmetInputs: string[] = [];

  const agePrefix = Math.round(input.ageYears);
  trace.push({ step: 'prefijo de edad', detail: `${agePrefix} años.`, value: agePrefix });

  let etiologyCode: CeosEtiologyCode | null = null;
  if (input.etiology) {
    etiologyCode = ETIOLOGY_CODE[input.etiology];
    trace.push({ step: 'etiología', detail: `${input.etiology} → '${etiologyCode}'.` });
  } else {
    unmetInputs.push('etiology');
  }

  let curveCategory: CeosCurveCategory | null = null;
  if (input.majorCobbDeg !== null) {
    curveCategory = classifyCurveCategory(input.majorCobbDeg);
    trace.push({
      step: 'curva mayor',
      detail: `${input.majorCobbDeg.toFixed(1)}° → categoría ${curveCategory} (docs/OPEN_QUESTIONS.md #22).`,
      value: input.majorCobbDeg,
    });
  } else {
    unmetInputs.push('majorCobb');
  }

  let kyphosisCategory: CeosKyphosisCategory | null = null;
  if (input.maxKyphosisDeg !== null) {
    kyphosisCategory = classifyKyphosisCategory(input.maxKyphosisDeg);
    trace.push({
      step: 'cifosis máxima',
      detail: `${input.maxKyphosisDeg.toFixed(1)}° → '${kyphosisCategory}' (docs/OPEN_QUESTIONS.md #23).`,
      value: input.maxKyphosisDeg,
    });
  } else {
    unmetInputs.push('maxKyphosis');
  }

  const progression = assessProgression(input.progression);
  trace.push(...progression.trace);
  unmetInputs.push(...progression.unmetInputs);

  const resultParts = [String(agePrefix), `${etiologyCode ?? '?'}${curveCategory ?? '?'}${kyphosisCategory ?? '?'}`];
  if (progression.modifier) resultParts.push(progression.modifier);

  return {
    result: resultParts.join(' '),
    trace,
    ...(unmetInputs.length > 0 ? { unmetInputs } : {}),
    agePrefix,
    etiologyCode,
    curveCategory,
    kyphosisCategory,
    progressionModifier: progression.modifier,
  };
}
