/**
 * Formato de presentación de un `MeasurementResult`. SPEC.md §10.3:
 * "Valores con su margen (`42° ±4°`)"; "Semáforo verde/ámbar/gris [...]
 * con el motivo en una línea cuando es gris."
 *
 * Puro — sin JSX — para poder probarlo sin renderizar componentes.
 */
import type { MeasurementResult, MeasurementUnit } from '../../core/models/types';

const UNIT_SUFFIX: Record<MeasurementUnit, string> = {
  deg: '°',
  mm: ' mm',
  ratio: '%',
  ordinal: '',
};

/** Redondeo de presentación: los ángulos y distancias no tienen más
 * precisión real que un decimal (SPEC.md §8.1, "un número desnudo comunica
 * una precisión que la medición radiográfica no tiene"). */
function roundForDisplay(value: number): number {
  return Math.round(value * 10) / 10;
}

/** SPEC.md §10.3: "Valores con su margen (`42° ±4°`)." Devuelve `—` cuando
 * no hay valor (status `unavailable`). */
export function formatMeasurementValue(measurement: MeasurementResult): string {
  if (measurement.value === null) return '—';
  const suffix = UNIT_SUFFIX[measurement.unit];
  const base = `${roundForDisplay(measurement.value)}${suffix}`;
  if (measurement.uncertainty === undefined) return base;
  return `${base} ±${roundForDisplay(measurement.uncertainty)}${suffix}`;
}

export type SemaphoreColor = 'green' | 'amber' | 'gray';

/** SPEC.md §8.1: "Semáforo por parámetro: verde (calculado y verificado),
 * ámbar (calculado con advertencias), gris (no calculable, con el motivo
 * en una línea)." */
export function semaphoreColor(measurement: MeasurementResult): SemaphoreColor {
  if (measurement.status === 'unavailable') return 'gray';
  if (measurement.status === 'warning') return 'amber';
  return 'green';
}

export const SEMAPHORE_HEX: Record<SemaphoreColor, string> = {
  green: '#4ade80',
  amber: '#fbbf24',
  gray: '#6b7280',
};
