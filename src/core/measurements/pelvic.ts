/**
 * Parámetros pélvicos y oblicuidad pélvica. SPEC.md §7.6, §7.7. Ref. 10
 * (Legaye 1998 — PI, PT, SS, identidad PI=PT+SS), 25 (SRS Radiographic
 * Measurement Manual — oblicuidad de Osebold).
 */
import { HORIZONTAL, VERTICAL, angleBetweenLines, distance, perpendicularThrough } from '../geometry/primitives';
import type { Line } from '../geometry/types';
import { convertPxToMm, type Calibration } from '../calibration/calibration';
import { DEFAULT_CONVENTIONS, type Conventions } from '../config/conventions';
import { CLINICAL } from '../constants';
import type { MeasurementResult, PelvicAnnotation, TraceStep } from '../models/types';
import { femoralAxisMidpoint, s1EndplateMidpoint } from './pelvicGeometry';

function s1Line(pelvis: PelvicAnnotation): Line {
  return { p1: pelvis.s1Endplate[0], p2: pelvis.s1Endplate[1] };
}

/**
 * SPEC.md §7.6: `SS`, `PT`, `PI` con la verificación automática
 * `|PI − (PT+SS)| ≤ 1°`. Si falla, los tres salen en gris con el motivo
 * "landmarks pélvicos poco fiables" (SPEC.md §8.1) en vez de mostrarse
 * erróneos: es una comprobación conjunta, no independiente por parámetro.
 */
export interface PelvicParameters {
  sacralSlope: MeasurementResult;
  pelvicTilt: MeasurementResult;
  pelvicIncidence: MeasurementResult;
  /** true si pasó la verificación `|PI − (PT+SS)| ≤ 1°`. */
  consistent: boolean;
  discrepancyDeg: number;
}

export function measurePelvicParameters(
  pelvis: PelvicAnnotation,
  calibration: Calibration | undefined = undefined,
  conventions: Conventions = DEFAULT_CONVENTIONS,
): PelvicParameters {
  const line = s1Line(pelvis);
  const f = femoralAxisMidpoint(pelvis);
  const m = s1EndplateMidpoint(pelvis);

  const ssAngle = angleBetweenLines(line, HORIZONTAL);
  const ptAngle = angleBetweenLines({ p1: f, p2: m }, VERTICAL);
  const perpendicular = perpendicularThrough(line, m);
  const piAngle = angleBetweenLines({ p1: f, p2: m }, perpendicular);

  const discrepancyDeg = Math.abs(piAngle - (ptAngle + ssAngle));
  const consistent = discrepancyDeg <= 1;

  const separationPx = distance(pelvis.femoralHeads.left.center, pelvis.femoralHeads.right.center);
  const separationMm = calibration ? convertPxToMm(separationPx, calibration).valueMm : null;
  const rotationWarning =
    separationMm !== null && separationMm > conventions.pelvic.femoralHeadSeparationWarningMm;

  const trace: TraceStep[] = [
    { step: 'SS', detail: 'Ángulo entre el platillo de S1 y la horizontal.', value: ssAngle },
    { step: 'PT', detail: 'Ángulo entre F→M y la vertical.', value: ptAngle },
    { step: 'PI', detail: 'Ángulo entre F→M y la perpendicular al platillo de S1 en M.', value: piAngle },
    { step: 'verificación PI=PT+SS', detail: `|PI − (PT+SS)| = ${discrepancyDeg.toFixed(2)}°`, value: discrepancyDeg },
  ];
  if (rotationWarning) {
    trace.push({
      step: 'rotación del paciente',
      detail: `Centros femorales separados ${separationMm!.toFixed(1)} mm (>${conventions.pelvic.femoralHeadSeparationWarningMm} mm): confianza sagital degradada.`,
    });
  }

  if (!consistent) {
    const reason =
      `Verificación automática fallida: |PI − (PT+SS)| = ${discrepancyDeg.toFixed(2)}° > 1° ` +
      '(landmarks pélvicos poco fiables).';
    const grey = (): MeasurementResult => ({ value: null, unit: 'deg', status: 'unavailable', reason, trace });
    return { sacralSlope: grey(), pelvicTilt: grey(), pelvicIncidence: grey(), consistent, discrepancyDeg };
  }

  const status = rotationWarning ? 'warning' : 'ok';
  const build = (value: number): MeasurementResult => ({
    value,
    unit: 'deg',
    status,
    trace,
    ...(rotationWarning ? { warnings: ['femoralHeadSeparation'] } : {}),
    ...(rotationWarning
      ? { reason: `Centros femorales separados >${conventions.pelvic.femoralHeadSeparationWarningMm} mm: posible rotación del paciente.` }
      : {}),
  });

  return {
    sacralSlope: build(ssAngle),
    pelvicTilt: build(ptAngle),
    pelvicIncidence: build(piAngle),
    consistent,
    discrepancyDeg,
  };
}

/** SPEC.md §7.6: "PI-LL mismatch = PI − LL; objetivo terapéutico ≤10°." */
export function measurePiLlMismatch(pelvicIncidenceDeg: number, lumbarLordosisDeg: number): MeasurementResult {
  const value = pelvicIncidenceDeg - lumbarLordosisDeg;
  const trace: TraceStep[] = [
    {
      step: 'PI-LL mismatch',
      detail: `Objetivo terapéutico ≤${CLINICAL.PI_LL_TARGET_DEG}°.`,
      value,
    },
  ];
  return { value, unit: 'deg', status: 'ok', trace };
}

export interface PiReferenceBand {
  mean: number;
  sd: number;
  range: [number, number];
}

/**
 * SPEC.md §7.6 / `docs/OPEN_QUESTIONS.md` #17: la PI media de referencia es
 * de población adulta; en <18 años no se muestra banda de normalidad ni se
 * colorea como patológico. Devuelve `null` en ese caso — es responsabilidad
 * de quien presenta el valor (fase 2+) no mostrar banda alguna.
 */
export function pelvicIncidenceReferenceBand(
  ageYears: number,
  conventions: Conventions = DEFAULT_CONVENTIONS,
): PiReferenceBand | null {
  if (conventions.pelvic.noPediatricPiNormalBand && ageYears < 18) return null;
  return { mean: CLINICAL.PI_MEAN_ADULT, sd: CLINICAL.PI_SD_ADULT, range: CLINICAL.PI_RANGE_ADULT };
}

/**
 * SPEC.md §7.7: "Oblicuidad pélvica. Método de Osebold por defecto (línea
 * de crestas ilíacas respecto a la horizontal). Método seleccionable e
 * impreso en el informe: no son intercambiables." `docs/OPEN_QUESTIONS.md`
 * #18 ★. Sólo Osebold está implementado en esta fase; cualquier otro
 * método configurado se declara explícitamente no disponible en vez de
 * aproximarse con la fórmula de Osebold.
 */
export function measurePelvicObliquity(
  pelvis: PelvicAnnotation,
  conventions: Conventions = DEFAULT_CONVENTIONS,
): MeasurementResult {
  const method = conventions.pelvic.obliquityMethod;
  if (method !== 'osebold') {
    return {
      value: null,
      unit: 'deg',
      status: 'unavailable',
      reason: `Método de oblicuidad pélvica '${method}' no implementado en esta fase (sólo Osebold).`,
      trace: [],
    };
  }

  if (!pelvis.iliacCrests) {
    return {
      value: null,
      unit: 'deg',
      status: 'unavailable',
      reason: 'Sin crestas ilíacas anotadas: no se puede aplicar el método de Osebold.',
      trace: [],
    };
  }

  const { left, right } = pelvis.iliacCrests;
  const angle = angleBetweenLines({ p1: left, p2: right }, HORIZONTAL);
  // y menor = más craneal en la imagen = cresta más elevada.
  const elevatedSide = left.y < right.y ? 'left' : right.y < left.y ? 'right' : 'none';
  const trace: TraceStep[] = [
    {
      step: 'oblicuidad pélvica (Osebold)',
      detail: `Línea de crestas ilíacas respecto a la horizontal. Lado elevado: ${elevatedSide} (docs/OPEN_QUESTIONS.md #18).`,
      value: angle,
    },
  ];
  return { value: angle, unit: 'deg', status: 'ok', trace };
}
