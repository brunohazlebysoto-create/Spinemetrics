/**
 * Líneas y balance coronal. SPEC.md §7.4. Ref. 6 (King 1983 — vértebra
 * estable/neutra), 25 (SRS Radiographic Measurement Manual — CSVL, C7PL).
 */
import { distance, signedDistanceToVerticalLine } from '../geometry/primitives';
import { convertPxToMm, type Calibration } from '../calibration/calibration';
import { DEFAULT_CONVENTIONS, type Conventions } from '../config/conventions';
import type { MeasurementResult, PelvicAnnotation, TraceStep, VertebraAnnotation } from '../models/types';
import { vertebraCentroid } from './vertebraGeometry';
import { s1EndplateMidpoint } from './pelvicGeometry';

/** SPEC.md §7.4: "CSVL: vertical desde el punto medio del platillo superior
 * de S1." Devuelve la coordenada x de esa vertical. */
export function csvlX(pelvis: PelvicAnnotation): number {
  return s1EndplateMidpoint(pelvis).x;
}

/** SPEC.md §7.4: "Plomada de C7 (C7PL): vertical desde el centroide de C7." */
export function c7plX(vertebrae: VertebraAnnotation[]): number | null {
  const c7 = vertebrae.find((v) => v.level === 'C7');
  if (!c7) return null;
  return vertebraCentroid(c7).x;
}

/**
 * SPEC.md §7.4: "Balance coronal = distancia horizontal con signo entre
 * C7PL y CSVL (mm)." Signo positivo = C7PL a la derecha de la CSVL, es
 * decir, tronco desplazado hacia la derecha del paciente (convención de
 * `core/geometry/README.md`).
 */
export function measureCoronalBalance(
  vertebrae: VertebraAnnotation[],
  pelvis: PelvicAnnotation,
  calibration: Calibration | undefined,
): MeasurementResult {
  const trace: TraceStep[] = [];
  const c7x = c7plX(vertebrae);
  if (c7x === null) {
    return {
      value: null,
      unit: 'mm',
      status: 'unavailable',
      reason: 'No se encontró C7 en las anotaciones: no se puede trazar la plomada C7 (C7PL).',
      trace,
    };
  }

  const csvl = csvlX(pelvis);
  trace.push({ step: 'CSVL', detail: 'Punto medio del platillo superior de S1.', value: csvl });
  trace.push({ step: 'C7PL', detail: 'Centroide de C7.', value: c7x });

  const deltaPx = signedDistanceToVerticalLine({ x: c7x, y: 0 }, csvl);
  const conversion = convertPxToMm(deltaPx, calibration);
  trace.push({
    step: 'balance coronal',
    detail: 'C7PL − CSVL, convertido a mm.',
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

/**
 * SPEC.md §7.4: "Translación apical = distancia horizontal del centroide
 * apical a la CSVL (mm)."
 */
export function measureApicalTranslation(
  apex: VertebraAnnotation,
  pelvis: PelvicAnnotation,
  calibration: Calibration | undefined,
): MeasurementResult {
  const trace: TraceStep[] = [];
  const csvl = csvlX(pelvis);
  const apexCentroid = vertebraCentroid(apex);
  trace.push({ step: 'vértebra apical', detail: apex.level });
  trace.push({ step: 'CSVL', detail: 'Punto medio del platillo superior de S1.', value: csvl });

  const deltaPx = signedDistanceToVerticalLine(apexCentroid, csvl);
  const conversion = convertPxToMm(deltaPx, calibration);
  trace.push({
    step: 'translación apical',
    detail: 'Centroide apical − CSVL, convertido a mm.',
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

/**
 * SPEC.md §7.4: "Vértebra estable = la más bisectada por la CSVL (empate →
 * la más caudal)." `docs/OPEN_QUESTIONS.md` #27.
 */
export function determineStableVertebra(
  vertebrae: VertebraAnnotation[],
  pelvis: PelvicAnnotation,
): VertebraAnnotation | null {
  if (vertebrae.length === 0) return null;
  const csvl = csvlX(pelvis);
  const distances = vertebrae.map((v) => Math.abs(vertebraCentroid(v).x - csvl));
  const minDistance = Math.min(...distances);
  const TIE_EPSILON_PX = 1e-6;

  // Recorre en orden craneal→caudal y se queda con la última que empata con
  // el mínimo: así, entre empatadas, prevalece siempre la más caudal.
  let stable = vertebrae[0]!;
  for (let i = 0; i < vertebrae.length; i++) {
    if (distances[i]! <= minDistance + TIE_EPSILON_PX) stable = vertebrae[i]!;
  }
  return stable;
}

function pedicleAsymmetry(v: VertebraAnnotation): number | null {
  if (!v.pedicles || !v.lateralBorders) return null;
  const [borderLeft, borderRight] = v.lateralBorders;
  const distanceLeft = distance(v.pedicles.left, borderLeft);
  const distanceRight = distance(v.pedicles.right, borderRight);
  const denom = Math.max(distanceLeft, distanceRight);
  return denom === 0 ? 0 : Math.abs(distanceLeft - distanceRight) / denom;
}

export interface NeutralVertebraResult {
  vertebra: VertebraAnnotation | null;
  /** Asimetría relativa (0–1) entre las distancias pediculares a los bordes
   * laterales de la vértebra elegida. */
  asymmetry: number | null;
  /** true si `asymmetry` está por debajo del umbral configurado
   * (`docs/OPEN_QUESTIONS.md` #28 — convención propia, no estándar publicado). */
  isNeutral: boolean;
  status: 'ok' | 'unavailable';
  reason?: string;
}

/**
 * SPEC.md §7.4: "Vértebra neutra = la de menor asimetría pedicular."
 * `docs/OPEN_QUESTIONS.md` #28: neutra si la diferencia relativa entre las
 * distancias pediculares a los bordes laterales es <10% (configurable,
 * convención propia de la aplicación).
 */
export function determineNeutralVertebra(
  vertebrae: VertebraAnnotation[],
  conventions: Conventions = DEFAULT_CONVENTIONS,
): NeutralVertebraResult {
  const candidates = vertebrae.filter((v) => v.pedicles && v.lateralBorders);
  if (candidates.length === 0) {
    return {
      vertebra: null,
      asymmetry: null,
      isNeutral: false,
      status: 'unavailable',
      reason: 'Ninguna vértebra tiene pedículos y bordes laterales anotados.',
    };
  }

  let best = candidates[0]!;
  let bestAsymmetry = pedicleAsymmetry(best)!;
  for (const v of candidates.slice(1)) {
    const asymmetry = pedicleAsymmetry(v)!;
    if (asymmetry < bestAsymmetry) {
      best = v;
      bestAsymmetry = asymmetry;
    }
  }

  return {
    vertebra: best,
    asymmetry: bestAsymmetry,
    isNeutral: bestAsymmetry < conventions.reference.neutralVertebraPedicleAsymmetryThreshold,
    status: 'ok',
  };
}
