import { describe, expect, it } from 'vitest';
import { formatMeasurementValue, semaphoreColor } from './formatMeasurement';
import type { MeasurementResult } from '../../core/models/types';

function result(overrides: Partial<MeasurementResult>): MeasurementResult {
  return { value: 42, unit: 'deg', status: 'ok', trace: [], ...overrides };
}

describe('formatMeasurementValue', () => {
  it('formatea grados con el margen (SPEC.md §10.3, "42° ±4°")', () => {
    expect(formatMeasurementValue(result({ value: 42, unit: 'deg', uncertainty: 4 }))).toBe('42° ±4°');
  });

  it('formatea mm y % con sus sufijos', () => {
    expect(formatMeasurementValue(result({ value: 12.34, unit: 'mm' }))).toBe('12.3 mm');
    expect(formatMeasurementValue(result({ value: 60, unit: 'ratio' }))).toBe('60%');
  });

  it('sin incertidumbre, no añade el margen', () => {
    expect(formatMeasurementValue(result({ value: 10, unit: 'deg' }))).toBe('10°');
  });

  it('redondea a un decimal', () => {
    expect(formatMeasurementValue(result({ value: 34.567, unit: 'deg' }))).toBe('34.6°');
  });

  it('devuelve — cuando no hay valor', () => {
    expect(formatMeasurementValue(result({ value: null, status: 'unavailable' }))).toBe('—');
  });

  it('unidad ordinal no añade sufijo', () => {
    expect(formatMeasurementValue(result({ value: 3, unit: 'ordinal' }))).toBe('3');
  });
});

describe('semaphoreColor — SPEC.md §8.1', () => {
  it('verde cuando ok', () => {
    expect(semaphoreColor(result({ status: 'ok' }))).toBe('green');
  });

  it('ámbar cuando warning', () => {
    expect(semaphoreColor(result({ status: 'warning' }))).toBe('amber');
  });

  it('gris cuando unavailable', () => {
    expect(semaphoreColor(result({ status: 'unavailable', value: null }))).toBe('gray');
  });
});
