import { describe, expect, it } from 'vitest';
import {
  buildPipelineQualityControlReport,
  checkConfidenceThreshold,
  checkExpectedBodyCount,
  checkFemoralHeadsInField,
  checkMonotonicOrder,
  checkVertebralHeightConsistency,
} from './qualityControl';
import type { VertebraBandCandidate } from './vertebraDetector';

function makeBand(rowCenter: number, height: number, confidence: number): VertebraBandCandidate {
  return {
    rowCenter,
    rowTop: rowCenter - height / 2,
    rowBottom: rowCenter + height / 2,
    colLeft: 0,
    colRight: 50,
    confidence: { value: confidence, reason: '' },
  };
}

describe('checkMonotonicOrder', () => {
  it('ok cuando las bandas están ordenadas craneal→caudal', () => {
    const bands = [makeBand(0, 20, 0.5), makeBand(30, 20, 0.5), makeBand(60, 20, 0.5)];
    expect(checkMonotonicOrder(bands).status).toBe('ok');
  });

  it('unavailable cuando el orden se rompe', () => {
    const bands = [makeBand(0, 20, 0.5), makeBand(60, 20, 0.5), makeBand(30, 20, 0.5)];
    const result = checkMonotonicOrder(bands);
    expect(result.status).toBe('unavailable');
    expect(result.detail).toMatch(/abortado/);
  });
});

describe('checkConfidenceThreshold', () => {
  it('ok cuando todas las bandas superan 0.7', () => {
    const bands = [makeBand(0, 20, 0.8), makeBand(30, 20, 0.75)];
    expect(checkConfidenceThreshold(bands).status).toBe('ok');
  });

  it('warning cuando algunas bandas están por debajo de 0.7', () => {
    const bands = [makeBand(0, 20, 0.8), makeBand(30, 20, 0.5)];
    const result = checkConfidenceThreshold(bands);
    expect(result.status).toBe('warning');
    expect(result.detail).toContain('1/2');
  });

  it('unavailable cuando ninguna banda es fiable', () => {
    const bands = [makeBand(0, 20, 0.3), makeBand(30, 20, 0.4)];
    expect(checkConfidenceThreshold(bands).status).toBe('unavailable');
  });
});

describe('checkVertebralHeightConsistency', () => {
  it('ok con alturas regulares', () => {
    const bands = [makeBand(0, 20, 0.5), makeBand(30, 21, 0.5), makeBand(60, 19, 0.5), makeBand(90, 20, 0.5)];
    expect(checkVertebralHeightConsistency(bands).status).toBe('ok');
  });

  it('warning cuando una banda se desvía más de ±40% de la mediana de sus vecinas', () => {
    // Vecinas de la banda central tienen alturas 20 y 20 (mediana 20);
    // la banda central mide 35 (75% más) → fuera de ±40%.
    const bands = [makeBand(0, 20, 0.5), makeBand(30, 35, 0.5), makeBand(60, 20, 0.5)];
    const result = checkVertebralHeightConsistency(bands);
    expect(result.status).toBe('warning');
    expect(result.detail).toContain('1');
  });

  it('ok con menos de 3 bandas (sin vecinas suficientes)', () => {
    const bands = [makeBand(0, 20, 0.5), makeBand(30, 100, 0.5)];
    expect(checkVertebralHeightConsistency(bands).status).toBe('ok');
  });
});

describe('checkExpectedBodyCount', () => {
  it('ok sin recuento de referencia', () => {
    expect(checkExpectedBodyCount(10, null).status).toBe('ok');
  });

  it('ok cuando coincide', () => {
    expect(checkExpectedBodyCount(17, 17).status).toBe('ok');
  });

  it('warning cuando no coincide', () => {
    const result = checkExpectedBodyCount(15, 17);
    expect(result.status).toBe('warning');
    expect(result.detail).toMatch(/levelLabelingUncertain/);
  });
});

describe('checkFemoralHeadsInField', () => {
  it('ok cuando se detectaron', () => {
    expect(checkFemoralHeadsInField(true).status).toBe('ok');
  });

  it('unavailable cuando no se detectaron', () => {
    const result = checkFemoralHeadsInField(false);
    expect(result.status).toBe('unavailable');
    expect(result.detail).toMatch(/SVA, PI, PT, SS y TPA/);
  });
});

describe('buildPipelineQualityControlReport', () => {
  it('agrega las 5 comprobaciones', () => {
    const bands = [makeBand(0, 20, 0.8), makeBand(30, 20, 0.8), makeBand(60, 20, 0.8)];
    const report = buildPipelineQualityControlReport({ bands, femoralHeadsDetected: true });
    expect(report.checks).toHaveLength(5);
    expect(report.checks.every((c) => c.status === 'ok')).toBe(true);
  });
});
