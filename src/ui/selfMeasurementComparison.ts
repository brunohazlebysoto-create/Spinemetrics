/**
 * "Medir yo también" (SPEC.md §10.5): "al terminar, muestra una tabla de
 * tres columnas (propia / automática / diferencia)". Puro y sin DOM/Zustand
 * — mismo patrón que `followUp.ts`, del que reutiliza el catálogo de
 * mediciones a comparar (`MEASUREMENT_DISPLAY_CONFIG`) para no mantener dos
 * listas de claves/etiquetas por separado.
 */
import type { MeasurementSet, MeasurementUnit } from '../core/models/types';
import { MEASUREMENT_DISPLAY_CONFIG } from './Panels/measurementDisplayConfig';

export interface SelfMeasurementComparisonRow {
  key: string;
  label: string;
  unit: MeasurementUnit;
  ownValue: number;
  automaticValue: number;
  differenceValue: number;
}

/**
 * Una fila por cada medición calculable (`value !== null`) en AMBOS
 * `MeasurementSet` — si el clínico no llegó a trazar esa medición, o el
 * automático no la tiene, se omite en vez de comparar contra un hueco
 * (SPEC.md §9: "nunca fabricar"). Mismo orden que `MeasurementsPanel.tsx`.
 */
export function computeSelfMeasurementComparison(own: MeasurementSet, automatic: MeasurementSet): SelfMeasurementComparisonRow[] {
  const rows: SelfMeasurementComparisonRow[] = [];
  for (const config of MEASUREMENT_DISPLAY_CONFIG) {
    const ownResult = own.measurements[config.key];
    const automaticResult = automatic.measurements[config.key];
    if (!ownResult || !automaticResult || ownResult.value === null || automaticResult.value === null) continue;

    rows.push({
      key: config.key,
      label: config.label,
      unit: automaticResult.unit,
      ownValue: ownResult.value,
      automaticValue: automaticResult.value,
      differenceValue: ownResult.value - automaticResult.value,
    });
  }
  return rows;
}
