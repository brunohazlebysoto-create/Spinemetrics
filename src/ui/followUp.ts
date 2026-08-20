/**
 * Comparación entre el estudio activo y un estudio previo del mismo
 * paciente. SPEC.md §10.4 "Seguimiento seriado": "comparación con el
 * estudio previo del mismo paciente: tabla de deltas y gráfico de
 * evolución del Cobb [...]. Vértebras terminales heredadas del estudio
 * índice automáticamente."
 *
 * Puro y sin DOM/Zustand — se prueba igual que `measurementEngine.ts` y
 * `classificationEngine.ts`. `store.ts` es quien decide CUÁNDO llamar a
 * estas funciones (al elegir un estudio índice), no este módulo.
 */
import type { CobbMeasurement } from '../core/measurements/cobb';
import type { MeasurementSet, MeasurementUnit, Radiograph, SpinalLevel } from '../core/models/types';
import { MEASUREMENT_DISPLAY_CONFIG } from './Panels/measurementDisplayConfig';

/** SPEC.md §7.2, `docs/OPEN_QUESTIONS.md` #4: "progresión = cambio
 * estrictamente mayor de 5° (Δ > 5.0)". Un cambio de exactamente 5° cuenta
 * como dentro del error de medición, no como progresión. */
const COBB_PROGRESSION_THRESHOLD_DEG = 5;

export interface FollowUpDeltaRow {
  key: string;
  label: string;
  unit: MeasurementUnit;
  previousValue: number;
  currentValue: number;
  deltaValue: number;
  /** SPEC.md §10.4 sólo define un umbral de progresión publicado para el
   * ángulo de Cobb (`docs/OPEN_QUESTIONS.md` #4); en el resto de filas no
   * hay un umbral equivalente documentado, así que queda `null` (no
   * aplica) en vez de fabricar uno. */
  isProgression: boolean | null;
}

/**
 * Una fila por cada medición presente y calculable (`status !== 'unavailable'`,
 * `value !== null`) en AMBOS `MeasurementSet` — si falta en cualquiera de
 * los dos, se omite en vez de comparar contra un hueco (SPEC.md §9: "nunca
 * fabricar"). El orden sigue `MEASUREMENT_DISPLAY_CONFIG`, el mismo que ya
 * usa `MeasurementsPanel.tsx`.
 */
export function computeFollowUpDeltas(previous: MeasurementSet, current: MeasurementSet): FollowUpDeltaRow[] {
  const rows: FollowUpDeltaRow[] = [];
  for (const config of MEASUREMENT_DISPLAY_CONFIG) {
    const prev = previous.measurements[config.key];
    const curr = current.measurements[config.key];
    if (!prev || !curr || prev.value === null || curr.value === null) continue;

    const deltaValue = curr.value - prev.value;
    rows.push({
      key: config.key,
      label: config.label,
      unit: curr.unit,
      previousValue: prev.value,
      currentValue: curr.value,
      deltaValue,
      isProgression: config.key === 'cobb' ? Math.abs(deltaValue) > COBB_PROGRESSION_THRESHOLD_DEG : null,
    });
  }
  return rows;
}

/**
 * `docs/OPEN_QUESTIONS.md` #2, "regla obligatoria adicional": "en estudios
 * seriados del mismo paciente, reutilizar siempre las vértebras terminales
 * del estudio índice, aunque el algoritmo proponga otras. Sin esto, la
 * 'progresión' medida es en buena parte ruido de selección." `null` si el
 * estudio índice no tiene un Cobb con ambas terminales determinadas — nunca
 * se fabrica un par de vértebras.
 */
export function inheritedCobbTerminals(indexMeasurementSet: MeasurementSet): { cranial: SpinalLevel; caudal: SpinalLevel } | null {
  const cobb = indexMeasurementSet.measurements.cobb as CobbMeasurement | undefined;
  if (!cobb || cobb.cranialVertebra === null || cobb.caudalVertebra === null) return null;
  return { cranial: cobb.cranialVertebra, caudal: cobb.caudalVertebra };
}

/**
 * SPEC.md §9.1 Paso 1 / `docs/OPEN_QUESTIONS.md` #5: la clasificación y el
 * seguimiento seriado del Cobb están definidos sobre la PA en bipedestación
 * — nunca se compara contra otra proyección del mismo estudio. `null` si
 * el estudio no tiene ninguna radiografía `PA_standing`.
 */
export function paStandingMeasurementSet(study: { radiographs: Radiograph[]; measurementSets: MeasurementSet[] }): MeasurementSet | null {
  const index = study.radiographs.findIndex((r) => r.view === 'PA_standing');
  if (index === -1) return null;
  return study.measurementSets[index] ?? null;
}

export interface CobbSeriesPoint {
  date: string;
  cobbDeg: number;
}

/**
 * Serie cronológica del ángulo de Cobb (PA_standing) para el gráfico de
 * evolución de SPEC.md §10.4. Cada estudio sin Cobb calculable se omite —
 * nunca se interpola un hueco entre dos puntos reales.
 */
export function buildCobbSeries(studies: { date: string; radiographs: Radiograph[]; measurementSets: MeasurementSet[] }[]): CobbSeriesPoint[] {
  const points: CobbSeriesPoint[] = [];
  for (const study of studies) {
    const ms = paStandingMeasurementSet(study);
    const cobb = ms?.measurements.cobb;
    if (cobb && cobb.value !== null) points.push({ date: study.date, cobbDeg: cobb.value });
  }
  return points.sort((a, b) => a.date.localeCompare(b.date));
}
