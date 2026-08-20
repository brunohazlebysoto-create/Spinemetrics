/**
 * Crecimiento torácico. SPEC.md §7.11: "altura T1–T12, T1–S1 y SAL (razón
 * entre altura hemitorácica cóncava y convexa), con gráfico de evolución."
 *
 * T1–T12 y T1–S1 se derivan de landmarks que ya existen en el modelo de
 * datos (platillos vertebrales, `PelvicAnnotation.s1Endplate`) — misma
 * técnica que la literatura de crecimiento espinal (distancia recta entre
 * los puntos de referencia sobre la radiografía, no una suma segmento a
 * segmento).
 *
 * SAL ("space available for lung", Redding et al.) **no** se implementa
 * aquí: su definición original mide espacios intercostales entre el domo
 * diafragmático y el vértice de la caja torácica de cada hemitórax, un par
 * de landmarks que no existen en el modelo de datos (`RibAnnotation` de
 * `core/models/types.ts` son los puntos de cabeza/cuello costal del RVAD de
 * Mehta, un landmark distinto con otro propósito clínico — reutilizarlos
 * para SAL sería fabricar una medición a partir de un dato que no la
 * describe, prohibido por SPEC.md §8.1). Añadir SAL de verdad exige un tipo
 * de anotación y una herramienta del visor nuevos; queda documentado como
 * pendiente explícito, igual que el modelo entrenado de la Etapa 3/6 del
 * pipeline (`pipeline/README.md`).
 */
import { distance } from '../geometry/primitives';
import { convertPxToMm, type Calibration } from '../calibration/calibration';
import type { MeasurementResult, PelvicAnnotation, SpinalLevel, TraceStep, VertebraAnnotation } from '../models/types';
import { endplateMidpoint } from './vertebraGeometry';
import { s1EndplateMidpoint } from './pelvicGeometry';

function findVertebra(vertebrae: VertebraAnnotation[], level: SpinalLevel): VertebraAnnotation | undefined {
  return vertebrae.find((v) => v.level === level);
}

function missing(level: SpinalLevel): MeasurementResult {
  return {
    value: null,
    unit: 'mm',
    status: 'unavailable',
    reason: `No se encontró la vértebra ${level} en las anotaciones.`,
    trace: [],
  };
}

function distanceInMm(fromLabel: string, from: { x: number; y: number }, toLabel: string, to: { x: number; y: number }, calibration: Calibration | undefined, step: string): MeasurementResult {
  const deltaPx = distance(from, to);
  const conversion = convertPxToMm(deltaPx, calibration);
  const trace: TraceStep[] = [
    {
      step,
      detail: `${fromLabel} → ${toLabel}, distancia recta convertida a mm.`,
      ...(conversion.valueMm !== null ? { value: conversion.valueMm } : {}),
    },
  ];
  return {
    value: conversion.valueMm,
    unit: 'mm',
    status: conversion.status,
    ...(conversion.reason ? { reason: conversion.reason } : {}),
    trace,
  };
}

/** T1 platillo superior → T12 platillo inferior, distancia recta en mm. */
export function measureT1T12Height(vertebrae: VertebraAnnotation[], calibration: Calibration | undefined): MeasurementResult {
  const t1 = findVertebra(vertebrae, 'T1');
  const t12 = findVertebra(vertebrae, 'T12');
  if (!t1) return missing('T1');
  if (!t12) return missing('T12');
  return distanceInMm(
    'T1 platillo superior',
    endplateMidpoint(t1, 'superior'),
    'T12 platillo inferior',
    endplateMidpoint(t12, 'inferior'),
    calibration,
    'altura T1–T12',
  );
}

/** T1 platillo superior → S1 platillo superior, distancia recta en mm. */
export function measureT1S1Height(
  vertebrae: VertebraAnnotation[],
  pelvis: PelvicAnnotation | undefined,
  calibration: Calibration | undefined,
): MeasurementResult {
  const t1 = findVertebra(vertebrae, 'T1');
  if (!t1) return missing('T1');
  if (!pelvis) {
    return {
      value: null,
      unit: 'mm',
      status: 'unavailable',
      reason: 'Sin anotación pélvica: no se puede ubicar el platillo de S1.',
      trace: [],
    };
  }
  return distanceInMm('T1 platillo superior', endplateMidpoint(t1, 'superior'), 'S1 platillo superior', s1EndplateMidpoint(pelvis), calibration, 'altura T1–S1');
}
