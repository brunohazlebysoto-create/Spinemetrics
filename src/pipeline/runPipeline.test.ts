import { describe, expect, it } from 'vitest';
import { runAutomaticPipeline } from './runPipeline';
import type { DicomImageSource } from '../imaging/types';

/** Imagen sintética: una franja vertical de contraste (columna) con varias
 * "vértebras" (bandas horizontales brillantes) separadas por "discos"
 * (bandas oscuras), sobre un fondo uniforme. */
function makeSyntheticSpineDicom(width: number, height: number, count: number, bodyHeight: number, discHeight: number, colWidth: number): DicomImageSource {
  const pixelData = new Float32Array(width * height).fill(100);
  const xCenter = width / 2;
  const x0 = Math.round(xCenter - colWidth / 2);
  const x1 = Math.round(xCenter + colWidth / 2);
  let y = Math.round(height * 0.05);
  for (let i = 0; i < count; i++) {
    for (let yy = y; yy < y + bodyHeight && yy < height; yy++) {
      for (let xx = x0; xx < x1; xx++) pixelData[yy * width + xx] = 800;
    }
    y += bodyHeight + discHeight;
  }
  return {
    kind: 'dicom',
    width,
    height,
    pixelData,
    defaultWindowCenter: 450,
    defaultWindowWidth: 700,
    monochrome1: false,
  };
}

describe('runAutomaticPipeline', () => {
  it('sin viewHint (proyección desconocida), no calcula measurementSet', () => {
    const image = makeSyntheticSpineDicom(200, 800, 8, 40, 12, 100);
    const result = runAutomaticPipeline(image, null);
    expect(result.viewClassification.view).toBeNull();
    expect(result.measurementSet).toBeNull();
    expect(result.radiograph).toBeNull();
    // Pero sigue detectando bandas candidatas: el trabajo no se tira.
    expect(result.detectedBands.length).toBeGreaterThan(0);
  });

  it('con viewHint pero sin levelAnchor, no calcula measurementSet (Etapa 4 sin ancla)', () => {
    const image = makeSyntheticSpineDicom(200, 800, 8, 40, 12, 100);
    const result = runAutomaticPipeline(image, 'PA_standing');
    expect(result.viewClassification.view).toBe('PA_standing');
    expect(result.levelLabeling.uncertain).toBe(true);
    expect(result.measurementSet).toBeNull();
    expect(result.radiograph).toBeNull();
  });

  it('con viewHint y levelAnchor, calcula un measurementSet automático real', () => {
    const image = makeSyntheticSpineDicom(200, 800, 8, 40, 12, 100);
    const first = runAutomaticPipeline(image, 'PA_standing');
    expect(first.detectedBands.length).toBeGreaterThan(0);

    const result = runAutomaticPipeline(image, 'PA_standing', {
      levelAnchor: { bandIndex: 0, level: 'T4' },
    });

    expect(result.levelLabeling.uncertain).toBe(false);
    expect(result.radiograph).not.toBeNull();
    expect(result.radiograph!.annotations.vertebrae.length).toBe(result.detectedBands.length);
    expect(result.radiograph!.annotations.vertebrae[0]!.level).toBe('T4');

    expect(result.measurementSet).not.toBeNull();
    expect(result.measurementSet!.source).toBe('auto');
    expect(result.measurementSet!.modelVersion).toBe('heuristic-bands-v1');
    expect(result.measurementSet!.qc.checks.length).toBeGreaterThan(0);
  });

  it('nunca construye una anotación pélvica sin segmentación sacra real, aunque detecte cabezas femorales', () => {
    const image = makeSyntheticSpineDicom(200, 800, 8, 40, 12, 100);
    const result = runAutomaticPipeline(image, 'PA_standing', {
      levelAnchor: { bandIndex: 0, level: 'T4' },
    });
    expect(result.radiograph!.annotations.pelvis).toBeUndefined();
  });

  it('las vértebras automáticas llevan confidence (nunca ausente ni inventada como 1.0)', () => {
    const image = makeSyntheticSpineDicom(200, 800, 8, 40, 12, 100);
    const result = runAutomaticPipeline(image, 'PA_standing', {
      levelAnchor: { bandIndex: 0, level: 'T4' },
    });
    for (const v of result.radiograph!.annotations.vertebrae) {
      expect(v.confidence).toBeDefined();
      expect(v.confidence!).toBeGreaterThanOrEqual(0);
      expect(v.confidence!).toBeLessThanOrEqual(0.5);
    }
  });

  describe('vista lateral (Etapa 6, SPEC.md §8)', () => {
    it('con viewHint LAT_standing y ancla, calcula un measurementSet automático con confianza acotada más baja que PA', () => {
      const image = makeSyntheticSpineDicom(200, 800, 8, 40, 12, 100);
      const result = runAutomaticPipeline(image, 'LAT_standing', {
        levelAnchor: { bandIndex: 0, level: 'T4' },
      });

      expect(result.viewClassification.view).toBe('LAT_standing');
      expect(result.levelLabeling.uncertain).toBe(false);
      expect(result.radiograph).not.toBeNull();
      expect(result.measurementSet).not.toBeNull();
      expect(result.measurementSet!.source).toBe('auto');
      expect(result.measurementSet!.modelVersion).toBe('heuristic-bands-v1');
      for (const v of result.radiograph!.annotations.vertebrae) {
        expect(v.confidence!).toBeLessThanOrEqual(0.35);
      }
    });

    it('la misma imagen produce menos confianza en LAT_standing que en PA_standing', () => {
      const image = makeSyntheticSpineDicom(200, 800, 8, 40, 12, 100);
      const pa = runAutomaticPipeline(image, 'PA_standing', { levelAnchor: { bandIndex: 0, level: 'T4' } });
      const lat = runAutomaticPipeline(image, 'LAT_standing', { levelAnchor: { bandIndex: 0, level: 'T4' } });

      const avgPa = pa.detectedBands.reduce((s, b) => s + b.confidence.value, 0) / pa.detectedBands.length;
      const avgLat = lat.detectedBands.reduce((s, b) => s + b.confidence.value, 0) / lat.detectedBands.length;
      expect(avgLat).toBeLessThan(avgPa);
    });
  });
});
