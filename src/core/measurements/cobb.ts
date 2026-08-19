/**
 * Ángulo de Cobb. SPEC.md §7.2. Ref. 1 (Cobb 1948), 14 (Gstoettner 2007),
 * 24 (Zhu 2024 — segmentación vs. regresión de landmarks).
 *
 * Selección automática de vértebras terminales, ápex, convexidad y
 * progresión seriada. Landmarks automáticos y manuales atraviesan
 * exactamente este mismo código (SPEC.md §4): no existe una ruta alternativa
 * para `source === 'manual'`.
 */
import { angleBetweenLines, signedInclinationFromHorizontal } from '../geometry/primitives';
import type { Line } from '../geometry/types';
import { DEFAULT_CONVENTIONS, type Conventions } from '../config/conventions';
import type { MeasurementResult, SpinalLevel, TraceStep, VertebraAnnotation } from '../models/types';
import { CLINICAL } from '../constants';
import { endplateLine, vertebraCentroid } from './vertebraGeometry';

const RELIABLE_CONFIDENCE_THRESHOLD = 0.7;

/** Inclinación con signo del platillo superior, usada como representante de
 * cada vértebra en el barrido que detecta el cambio de signo de la curva. */
export function vertebraInclinationDeg(vertebra: VertebraAnnotation): number {
  return signedInclinationFromHorizontal(endplateLine(vertebra, 'superior'));
}

interface SignRun {
  sign: 1 | -1;
  /** Índices dentro de la lista de vértebras fiables (no la lista original). */
  indices: number[];
}

function groupBySignRuns(inclinations: number[]): SignRun[] {
  const runs: SignRun[] = [];
  let currentSign: 1 | -1 = 1;
  for (let i = 0; i < inclinations.length; i++) {
    const raw = inclinations[i]!;
    const sign: 1 | -1 = raw === 0 ? currentSign : raw > 0 ? 1 : -1;
    const lastRun = runs[runs.length - 1];
    if (!lastRun || lastRun.sign !== sign) {
      runs.push({ sign, indices: [i] });
    } else {
      lastRun.indices.push(i);
    }
    currentSign = sign;
  }
  return runs;
}

/** Índice (dentro de `run.indices`) del máximo |inclinación|, aplicando el
 * desempate de `docs/OPEN_QUESTIONS.md` #2 cuando varias candidatas quedan a
 * menos de `tieBreakThresholdDeg` del máximo. `side` indica si el run es el
 * tramo craneal (más alejado del ápex = índice menor) o caudal (más alejado
 * del ápex = índice mayor) respecto a la inflexión de signo. */
function pickExtremeInRun(
  run: SignRun,
  inclinations: number[],
  side: 'cranial' | 'caudal',
  conventions: Conventions,
): { index: number; ambiguous: boolean } {
  const abs = run.indices.map((i) => Math.abs(inclinations[i]!));
  const maxAbs = Math.max(...abs);
  const tied = run.indices.filter((_i, k) => maxAbs - abs[k]! < conventions.cobb.tieBreakThresholdDeg);

  if (tied.length === 1) {
    return { index: tied[0]!, ambiguous: false };
  }

  if (conventions.cobb.terminalVertebraTieBreak === 'mostIncludingCurve') {
    // Más alejada del ápex (la inflexión de signo está al final del run
    // craneal / al principio del run caudal): índice mínimo o máximo.
    const index = side === 'cranial' ? Math.min(...tied) : Math.max(...tied);
    return { index, ambiguous: true };
  }

  // 'maximizeCobb': entre las empatadas, la de mayor inclinación absoluta
  // (aproxima maximizar el ángulo final resultante).
  let best = tied[0]!;
  for (const i of tied) {
    if (Math.abs(inclinations[i]!) > Math.abs(inclinations[best]!)) best = i;
  }
  return { index: best, ambiguous: true };
}

export interface TerminalVertebraSelection {
  cranial: VertebraAnnotation | null;
  caudal: VertebraAnnotation | null;
  endplateAmbiguity: boolean;
  status: 'ok' | 'unavailable';
  reason?: string;
  trace: TraceStep[];
}

/**
 * SPEC.md §7.2: "calcular la inclinación de cada platillo respecto a la
 * horizontal y elegir las que delimitan el cambio de signo con inclinación
 * máxima." Cuando hay más de una inflexión de signo (varias curvas), se
 * elige el par que produce el mayor ángulo de Cobb — es la curva mayor de
 * SPEC.md §7.3, "siempre estructural".
 *
 * Excluye de la selección las vértebras con `confidence < 0.7` (SPEC.md
 * §8.1: "Confianza de segmentación de una vértebra <0.7 → excluirla de la
 * selección de vértebras terminales").
 */
export function selectCobbTerminalVertebrae(
  vertebrae: VertebraAnnotation[],
  conventions: Conventions = DEFAULT_CONVENTIONS,
): TerminalVertebraSelection {
  const trace: TraceStep[] = [];
  const reliable = vertebrae.filter((v) => v.confidence === undefined || v.confidence >= RELIABLE_CONFIDENCE_THRESHOLD);
  const excluded = vertebrae.length - reliable.length;
  if (excluded > 0) {
    trace.push({
      step: 'exclusión por confianza',
      detail: `${excluded} vértebra(s) con confianza <0.7 excluida(s) de la selección de terminales.`,
    });
  }

  if (reliable.length < 2) {
    return {
      cranial: null,
      caudal: null,
      endplateAmbiguity: false,
      status: 'unavailable',
      reason: 'Menos de dos vértebras fiables: no se pueden seleccionar terminales automáticamente.',
      trace,
    };
  }

  const inclinations = reliable.map(vertebraInclinationDeg);
  trace.push({
    step: 'inclinación de platillos',
    detail: reliable.map((v, i) => `${v.level}: ${inclinations[i]!.toFixed(1)}°`).join(', '),
  });

  const runs = groupBySignRuns(inclinations);
  if (runs.length < 2) {
    return {
      cranial: null,
      caudal: null,
      endplateAmbiguity: false,
      status: 'unavailable',
      reason: 'No se detectó cambio de signo de inclinación: no hay curva que delimitar automáticamente.',
      trace,
    };
  }

  let best: { cranialIdx: number; caudalIdx: number; angle: number; ambiguous: boolean } | null = null;
  for (let k = 0; k < runs.length - 1; k++) {
    const cranialRun = runs[k]!;
    const caudalRun = runs[k + 1]!;
    const cranialPick = pickExtremeInRun(cranialRun, inclinations, 'cranial', conventions);
    const caudalPick = pickExtremeInRun(caudalRun, inclinations, 'caudal', conventions);
    const angle = angleBetweenLines(
      endplateLine(reliable[cranialPick.index]!, 'superior'),
      endplateLine(reliable[caudalPick.index]!, 'inferior'),
    );
    if (!best || angle > best.angle) {
      best = {
        cranialIdx: cranialPick.index,
        caudalIdx: caudalPick.index,
        angle,
        ambiguous: cranialPick.ambiguous || caudalPick.ambiguous,
      };
    }
  }

  const cranial = reliable[best!.cranialIdx]!;
  const caudal = reliable[best!.caudalIdx]!;
  trace.push({
    step: 'selección de terminales',
    detail: `Craneal ${cranial.level}, caudal ${caudal.level} (curva de mayor Cobb entre las inflexiones detectadas).`,
    value: best!.angle,
  });
  if (best!.ambiguous) {
    trace.push({
      step: 'endplateAmbiguity',
      detail:
        'Dos o más candidatas a vértebra terminal quedaron a menos de ' +
        `${conventions.cobb.tieBreakThresholdDeg}° de inclinación; se aplicó el desempate ` +
        `'${conventions.cobb.terminalVertebraTieBreak}' (docs/OPEN_QUESTIONS.md #2).`,
    });
  }

  return { cranial, caudal, endplateAmbiguity: best!.ambiguous, status: 'ok', trace };
}

export interface CobbMeasurement extends MeasurementResult {
  cranialVertebra: SpinalLevel | null;
  caudalVertebra: SpinalLevel | null;
  apexVertebra: SpinalLevel | null;
  convexity: 'left' | 'right' | null;
  endplateAmbiguity: boolean;
}

/**
 * SPEC.md §7.2: salida incluye "vértebra apical". Definición estándar
 * (dossier de referencia §1.4): la más horizontal (mínima |inclinación|)
 * entre las terminales, que coincide con la de mayor desviación lateral.
 */
export function determineApexVertebra(
  reliable: VertebraAnnotation[],
  cranial: VertebraAnnotation,
  caudal: VertebraAnnotation,
): VertebraAnnotation | null {
  const cranialIdx = reliable.indexOf(cranial);
  const caudalIdx = reliable.indexOf(caudal);
  const [lo, hi] = cranialIdx < caudalIdx ? [cranialIdx, caudalIdx] : [caudalIdx, cranialIdx];
  const interior = reliable.slice(lo + 1, hi);
  if (interior.length === 0) return null;

  let apex = interior[0]!;
  let apexAbs = Math.abs(vertebraInclinationDeg(apex));
  for (const v of interior.slice(1)) {
    const abs = Math.abs(vertebraInclinationDeg(v));
    if (abs < apexAbs) {
      apex = v;
      apexAbs = abs;
    }
  }
  return apex;
}

function xOnLineAtY(line: Line, y: number): number {
  const dy = line.p2.y - line.p1.y;
  if (dy === 0) return line.p1.x;
  const t = (y - line.p1.y) / dy;
  return line.p1.x + t * (line.p2.x - line.p1.x);
}

/**
 * Convexidad de la curva: lado hacia el que se desvía la vértebra apical
 * respecto a la línea que une las vértebras terminales.
 */
export function determineConvexity(
  cranial: VertebraAnnotation,
  caudal: VertebraAnnotation,
  apex: VertebraAnnotation,
): 'left' | 'right' {
  const cranialPt = vertebraCentroid(cranial);
  const caudalPt = vertebraCentroid(caudal);
  const apexPt = vertebraCentroid(apex);
  const referenceX = xOnLineAtY({ p1: cranialPt, p2: caudalPt }, apexPt.y);
  return apexPt.x - referenceX >= 0 ? 'right' : 'left';
}

export interface MeasureCobbOptions {
  conventions?: Conventions;
  /** SPEC.md §7.2 "Seguimiento": en estudios sucesivos, reutilizar siempre
   * las vértebras terminales del estudio índice en vez de recalcularlas
   * (`docs/OPEN_QUESTIONS.md` #2, regla obligatoria). */
  forcedTerminals?: { cranial: SpinalLevel; caudal: SpinalLevel };
}

/**
 * Mide el ángulo de Cobb de la curva mayor detectada automáticamente (o de
 * las vértebras terminales forzadas por el estudio índice). SPEC.md §7.2.
 */
export function measureCobb(vertebrae: VertebraAnnotation[], options: MeasureCobbOptions = {}): CobbMeasurement {
  const conventions = options.conventions ?? DEFAULT_CONVENTIONS;
  const trace: TraceStep[] = [
    {
      step: 'convención de platillo',
      detail: `Borde de platillo: '${conventions.cobb.endplateEdge}' (docs/OPEN_QUESTIONS.md #1).`,
    },
  ];

  const reliable = vertebrae.filter((v) => v.confidence === undefined || v.confidence >= RELIABLE_CONFIDENCE_THRESHOLD);

  let cranial: VertebraAnnotation | null;
  let caudal: VertebraAnnotation | null;
  let endplateAmbiguity = false;

  if (options.forcedTerminals) {
    cranial = reliable.find((v) => v.level === options.forcedTerminals!.cranial) ?? null;
    caudal = reliable.find((v) => v.level === options.forcedTerminals!.caudal) ?? null;
    trace.push({
      step: 'vértebras terminales reutilizadas',
      detail:
        `Craneal ${options.forcedTerminals.cranial}, caudal ${options.forcedTerminals.caudal}, ` +
        'heredadas del estudio índice (docs/OPEN_QUESTIONS.md #2, regla obligatoria de seguimiento).',
    });
    if (!cranial || !caudal) {
      return {
        value: null,
        unit: 'deg',
        status: 'unavailable',
        reason: 'Las vértebras terminales del estudio índice no están presentes en este estudio.',
        trace,
        cranialVertebra: null,
        caudalVertebra: null,
        apexVertebra: null,
        convexity: null,
        endplateAmbiguity: false,
      };
    }
  } else {
    const selection = selectCobbTerminalVertebrae(vertebrae, conventions);
    trace.push(...selection.trace);
    if (selection.status === 'unavailable') {
      return {
        value: null,
        unit: 'deg',
        status: 'unavailable',
        ...(selection.reason ? { reason: selection.reason } : {}),
        trace,
        cranialVertebra: null,
        caudalVertebra: null,
        apexVertebra: null,
        convexity: null,
        endplateAmbiguity: false,
      };
    }
    cranial = selection.cranial;
    caudal = selection.caudal;
    endplateAmbiguity = selection.endplateAmbiguity;
  }

  const angle = angleBetweenLines(endplateLine(cranial!, 'superior'), endplateLine(caudal!, 'inferior'));
  trace.push({ step: 'ángulo de Cobb', detail: `${cranial!.level}–${caudal!.level}`, value: angle });

  const apex = determineApexVertebra(reliable, cranial!, caudal!);
  const convexity = apex ? determineConvexity(cranial!, caudal!, apex) : null;
  if (apex) {
    trace.push({ step: 'vértebra apical', detail: `${apex.level}, convexidad ${convexity}` });
  }

  const warnings: string[] = [];
  if (endplateAmbiguity) warnings.push('endplateAmbiguity');

  return {
    value: angle,
    unit: 'deg',
    status: warnings.length > 0 ? 'warning' : 'ok',
    trace,
    warnings,
    cranialVertebra: cranial!.level,
    caudalVertebra: caudal!.level,
    apexVertebra: apex?.level ?? null,
    convexity,
    endplateAmbiguity,
  };
}

/** SPEC.md §7.2: "Escoliosis = Cobb ≥10°." */
export function isScoliosis(cobbDeg: number): boolean {
  return cobbDeg >= CLINICAL.SCOLIOSIS_THRESHOLD_DEG;
}

export type CobbProgressionStatus = 'progression' | 'improvement' | 'stable';

export interface CobbProgressionResult {
  deltaDeg: number;
  status: CobbProgressionStatus;
  note: string;
}

/**
 * SPEC.md §7.2 / `docs/OPEN_QUESTIONS.md` #4: progresión = cambio
 * **estrictamente mayor** que el umbral (por defecto 5°); exactamente el
 * umbral se reporta como dentro del error de medición.
 */
export function evaluateCobbProgression(
  currentDeg: number,
  previousDeg: number,
  conventions: Conventions = DEFAULT_CONVENTIONS,
): CobbProgressionResult {
  const threshold = conventions.cobb.progressionThresholdDeg;
  const deltaDeg = currentDeg - previousDeg;
  let status: CobbProgressionStatus = 'stable';
  let note = `Cambio dentro del error de medición (±${threshold}°).`;
  if (deltaDeg > threshold) {
    status = 'progression';
    note = `Progresión: cambio de ${deltaDeg.toFixed(1)}° > ${threshold}°.`;
  } else if (deltaDeg < -threshold) {
    status = 'improvement';
    note = `Mejoría: cambio de ${deltaDeg.toFixed(1)}° > ${threshold}° en sentido de corrección.`;
  }
  return { deltaDeg, status, note };
}
