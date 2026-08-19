/**
 * Parámetros sagitales. SPEC.md §7.5. Ref. 25 (SRS Radiographic Measurement
 * Manual), 18 (Schwab 2012 — SVA), 10 (Legaye 1998 — TPA usa el eje femoral).
 */
import { angleBetweenLines, signedDistanceToVerticalLine, HORIZONTAL } from '../geometry/primitives';
import { convertPxToMm, type Calibration } from '../calibration/calibration';
import { DEFAULT_CONVENTIONS, type Conventions } from '../config/conventions';
import type { MeasurementResult, PelvicAnnotation, SpinalLevel, TraceStep, VertebraAnnotation } from '../models/types';
import { compareSpinalLevels, isSpinalLevelBetween } from '../models/spinalLevelOrder';
import { endplateLine, vertebraCentroid } from './vertebraGeometry';
import { femoralAxisMidpoint, s1EndplateMidpoint } from './pelvicGeometry';

function findVertebra(vertebrae: VertebraAnnotation[], level: SpinalLevel): VertebraAnnotation | undefined {
  return vertebrae.find((v) => v.level === level);
}

function missing(level: SpinalLevel): MeasurementResult {
  return {
    value: null,
    unit: 'deg',
    status: 'unavailable',
    reason: `No se encontró la vértebra ${level} en las anotaciones.`,
    trace: [],
  };
}

/** SPEC.md §7.5: "Cifosis torácica (TK): T5 platillo superior → T12
 * platillo inferior. Normal ~10–40°." */
export function measureThoracicKyphosis(vertebrae: VertebraAnnotation[]): MeasurementResult {
  const t5 = findVertebra(vertebrae, 'T5');
  const t12 = findVertebra(vertebrae, 'T12');
  if (!t5) return missing('T5');
  if (!t12) return missing('T12');

  const angle = angleBetweenLines(endplateLine(t5, 'superior'), endplateLine(t12, 'inferior'));
  const trace: TraceStep[] = [{ step: 'cifosis torácica T5–T12', detail: 'T5 platillo superior → T12 platillo inferior.', value: angle }];
  return { value: angle, unit: 'deg', status: 'ok', trace };
}

/**
 * Cifosis genérica entre dos niveles cualesquiera (platillo superior del
 * craneal → platillo inferior del caudal), como `measureThoracicKyphosis`
 * pero parametrizable. Base de los criterios de estructuralidad de Lenke
 * (`docs/OPEN_QUESTIONS.md` #13: cifosis T2–T5 para PT, T10–L2 para MT/TL_L,
 * nunca reutilizar una cifosis calculada para un propósito distinto del que
 * le corresponde) y de la cifosis máxima del C-EOS (#23).
 */
export function measureKyphosisSegment(
  vertebrae: VertebraAnnotation[],
  cranialLevel: SpinalLevel,
  caudalLevel: SpinalLevel,
): MeasurementResult {
  const cranial = findVertebra(vertebrae, cranialLevel);
  const caudal = findVertebra(vertebrae, caudalLevel);
  if (!cranial) return missing(cranialLevel);
  if (!caudal) return missing(caudalLevel);

  const angle = angleBetweenLines(endplateLine(cranial, 'superior'), endplateLine(caudal, 'inferior'));
  const trace: TraceStep[] = [
    { step: `cifosis ${cranialLevel}–${caudalLevel}`, detail: `${cranialLevel} platillo superior → ${caudalLevel} platillo inferior.`, value: angle },
  ];
  return { value: angle, unit: 'deg', status: 'ok', trace };
}

export interface MaxKyphosisResult extends MeasurementResult {
  cranialLevel: SpinalLevel | null;
  caudalLevel: SpinalLevel | null;
}

/**
 * `docs/OPEN_QUESTIONS.md` #23 (C-EOS, "cifosis máxima"): "calcular la
 * cifosis máxima por barrido de todos los pares de platillos entre T1 y L2,
 * tomando el valor máximo, y registrar los niveles usados." Sólo considera
 * pares craneal→caudal en el orden anatómico correcto, restringidos al
 * rango `[fromLevel, toLevel]` y a las vértebras realmente presentes.
 */
export function measureMaxKyphosis(
  vertebrae: VertebraAnnotation[],
  fromLevel: SpinalLevel = 'T1',
  toLevel: SpinalLevel = 'L2',
): MaxKyphosisResult {
  const inRange = vertebrae.filter((v) => isSpinalLevelBetween(v.level, fromLevel, toLevel));
  if (inRange.length < 2) {
    return {
      value: null,
      unit: 'deg',
      status: 'unavailable',
      reason: `Menos de dos vértebras anotadas entre ${fromLevel} y ${toLevel}: no se puede barrer la cifosis máxima.`,
      trace: [],
      cranialLevel: null,
      caudalLevel: null,
    };
  }

  let best: { cranial: VertebraAnnotation; caudal: VertebraAnnotation; angle: number } | null = null;
  for (const cranial of inRange) {
    for (const caudal of inRange) {
      if (compareSpinalLevels(cranial.level, caudal.level) >= 0) continue;
      const angle = angleBetweenLines(endplateLine(cranial, 'superior'), endplateLine(caudal, 'inferior'));
      if (!best || angle > best.angle) best = { cranial, caudal, angle };
    }
  }

  // No debería ocurrir tras el chequeo `inRange.length < 2`, pero se
  // maneja explícitamente en vez de asumirlo (nunca lanzar en `core/`).
  if (!best) {
    return {
      value: null,
      unit: 'deg',
      status: 'unavailable',
      reason: `Ningún par craneal→caudal válido entre ${fromLevel} y ${toLevel}.`,
      trace: [],
      cranialLevel: null,
      caudalLevel: null,
    };
  }

  const trace: TraceStep[] = [
    {
      step: 'cifosis máxima (barrido)',
      detail:
        `Máximo entre todos los pares de platillos ${fromLevel}–${toLevel}: ` +
        `${best.cranial.level}–${best.caudal.level} (docs/OPEN_QUESTIONS.md #23).`,
      value: best.angle,
    },
  ];
  return {
    value: best.angle,
    unit: 'deg',
    status: 'ok',
    trace,
    cranialLevel: best.cranial.level,
    caudalLevel: best.caudal.level,
  };
}

/** SPEC.md §7.5 / `docs/OPEN_QUESTIONS.md` #15: por defecto L1 platillo
 * superior → S1 platillo superior; L1–L5 como valor secundario informativo,
 * nunca como entrada de SRS-Schwab. */
export function measureLumbarLordosis(
  vertebrae: VertebraAnnotation[],
  conventions: Conventions = DEFAULT_CONVENTIONS,
): MeasurementResult {
  const l1 = findVertebra(vertebrae, 'L1');
  if (!l1) return missing('L1');

  if (conventions.sagittal.lordosisLevels === 'L1-L5') {
    const l5 = findVertebra(vertebrae, 'L5');
    if (!l5) return missing('L5');
    const angle = angleBetweenLines(endplateLine(l1, 'superior'), endplateLine(l5, 'inferior'));
    const trace: TraceStep[] = [
      {
        step: 'lordosis lumbar L1–L5',
        detail: 'Valor secundario informativo (docs/OPEN_QUESTIONS.md #15); no usar como entrada de SRS-Schwab.',
        value: angle,
      },
    ];
    return { value: angle, unit: 'deg', status: 'ok', trace };
  }

  const s1 = findVertebra(vertebrae, 'S1');
  if (!s1) return missing('S1');
  const angle = angleBetweenLines(endplateLine(l1, 'superior'), endplateLine(s1, 'superior'));
  const trace: TraceStep[] = [
    { step: 'lordosis lumbar L1–S1', detail: 'L1 platillo superior → S1 platillo superior.', value: angle },
  ];
  return { value: angle, unit: 'deg', status: 'ok', trace };
}

/** SPEC.md §7.5: "SVA: distancia horizontal de la plomada de C7 al ángulo
 * posterosuperior de S1." `docs/OPEN_QUESTIONS.md` #14 ★: referencia
 * configurable (por defecto el ángulo posterosuperior de S1). */
export function measureSVA(
  vertebrae: VertebraAnnotation[],
  pelvis: PelvicAnnotation | undefined,
  calibration: Calibration | undefined,
  conventions: Conventions = DEFAULT_CONVENTIONS,
): MeasurementResult {
  const trace: TraceStep[] = [];
  const c7 = findVertebra(vertebrae, 'C7');
  if (!c7) return missing('C7');
  const c7x = vertebraCentroid(c7).x;
  trace.push({ step: 'plomada de C7', detail: 'Centroide de C7.', value: c7x });

  let referenceX: number;
  if (conventions.sagittal.svaReference === 'midpointS1SuperiorEndplate') {
    if (!pelvis) {
      return {
        value: null,
        unit: 'mm',
        status: 'unavailable',
        reason: 'Sin anotación pélvica: no se puede ubicar el platillo superior de S1.',
        trace,
      };
    }
    referenceX = s1EndplateMidpoint(pelvis).x;
    trace.push({ step: 'referencia distal', detail: 'Punto medio del platillo superior de S1 (docs/OPEN_QUESTIONS.md #14).', value: referenceX });
  } else {
    const s1 = findVertebra(vertebrae, 'S1');
    if (!s1 || !s1.posteriorSuperiorCorner) {
      return {
        value: null,
        unit: 'mm',
        status: 'unavailable',
        reason: 'Falta el ángulo posterosuperior de S1 en las anotaciones.',
        trace,
      };
    }
    referenceX = s1.posteriorSuperiorCorner.x;
    trace.push({ step: 'referencia distal', detail: 'Ángulo posterosuperior de S1 (docs/OPEN_QUESTIONS.md #14, por defecto).', value: referenceX });
  }

  const deltaPx = signedDistanceToVerticalLine({ x: c7x, y: 0 }, referenceX);
  const conversion = convertPxToMm(deltaPx, calibration);
  trace.push({
    step: 'SVA',
    detail: 'Plomada de C7 − referencia distal, convertido a mm.',
    ...(conversion.valueMm !== null ? { value: conversion.valueMm } : {}),
  });

  return {
    value: conversion.valueMm,
    unit: 'mm',
    status: conversion.status,
    ...(conversion.reason ? { reason: conversion.reason } : {}),
    trace,
  };
}

/** SPEC.md §7.5: "Pendiente de T1: ángulo del platillo superior de T1 con
 * la horizontal." */
export function measureT1Slope(vertebrae: VertebraAnnotation[]): MeasurementResult {
  const t1 = findVertebra(vertebrae, 'T1');
  if (!t1) return missing('T1');
  const angle = angleBetweenLines(endplateLine(t1, 'superior'), HORIZONTAL);
  const trace: TraceStep[] = [{ step: 'pendiente de T1', detail: 'Platillo superior de T1 respecto a la horizontal.', value: angle }];
  return { value: angle, unit: 'deg', status: 'ok', trace };
}

/** SPEC.md §7.5: "TPA: ángulo entre la línea eje femoral→centroide de T1 y
 * la línea eje femoral→punto medio del platillo de S1." */
export function measureTPA(vertebrae: VertebraAnnotation[], pelvis: PelvicAnnotation | undefined): MeasurementResult {
  const t1 = findVertebra(vertebrae, 'T1');
  if (!t1) return missing('T1');
  if (!pelvis) {
    return {
      value: null,
      unit: 'deg',
      status: 'unavailable',
      reason: 'Sin anotación pélvica: no se puede trazar el eje femoral ni el platillo de S1.',
      trace: [],
    };
  }

  const f = femoralAxisMidpoint(pelvis);
  const m = s1EndplateMidpoint(pelvis);
  const t1Centroid = vertebraCentroid(t1);
  const angle = angleBetweenLines({ p1: f, p2: t1Centroid }, { p1: f, p2: m });
  const trace: TraceStep[] = [
    { step: 'TPA', detail: 'Ángulo entre eje femoral→centroide de T1 y eje femoral→platillo de S1.', value: angle },
  ];
  return { value: angle, unit: 'deg', status: 'ok', trace };
}
