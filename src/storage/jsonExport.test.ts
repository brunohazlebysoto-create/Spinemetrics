import { describe, expect, it } from 'vitest';
import { deserializeStudy, serializeStudy, STUDY_EXPORT_FORMAT_VERSION } from './jsonExport';
import { recomputeMeasurementSet } from '../ui/measurementEngine';
import type { Radiograph, Study, VertebraAnnotation } from '../core/models/types';

function makeStudy(): Study {
  const vertebrae: VertebraAnnotation[] = [
    {
      level: 'T5',
      superiorEndplate: [{ x: 180, y: 0 }, { x: 220, y: 4 }],
      inferiorEndplate: [{ x: 180, y: 30 }, { x: 220, y: 30 }],
      confidence: 0.92,
      edited: true,
    },
    {
      level: 'T12',
      superiorEndplate: [{ x: 180, y: 200 }, { x: 220, y: 196 }],
      inferiorEndplate: [{ x: 175, y: 230 }, { x: 220, y: 220 }],
    },
  ];
  const radiograph: Radiograph = { id: 'r1', view: 'PA_standing', annotations: { vertebrae } };
  const measurementSet = recomputeMeasurementSet(radiograph);
  return {
    patientRef: 'SM-abc123',
    date: '2026-01-15',
    ageYears: 14,
    radiographs: [radiograph],
    measurementSets: [measurementSet],
  };
}

describe('serializeStudy / deserializeStudy — SPEC.md §12', () => {
  it('round-trip: el estudio deserializado reconstruye todas las anotaciones', () => {
    const study = makeStudy();
    const json = serializeStudy(study);
    const restored = deserializeStudy(json);
    expect(restored).toEqual(study);
  });

  it('el JSON incluye la versión de formato y la fecha de exportación', () => {
    const json = serializeStudy(makeStudy());
    const parsed = JSON.parse(json);
    expect(parsed.formatVersion).toBe(STUDY_EXPORT_FORMAT_VERSION);
    expect(typeof parsed.exportedAt).toBe('string');
  });

  it('rechaza JSON que no es un objeto o no tiene la forma esperada', () => {
    expect(() => deserializeStudy('not json')).toThrow(/JSON válido/);
    expect(() => deserializeStudy('42')).toThrow(/estudio de SpineMetrics/);
    expect(() => deserializeStudy('{}')).toThrow(/estudio de SpineMetrics/);
  });

  it('rechaza una versión de formato futura/no soportada', () => {
    const future = JSON.stringify({ formatVersion: 999, exportedAt: new Date().toISOString(), study: makeStudy() });
    expect(() => deserializeStudy(future)).toThrow(/versión de formato/i);
  });

  it('conserva edited/confidence de los landmarks (bucle de mejora, SPEC.md §12)', () => {
    const study = makeStudy();
    const restored = deserializeStudy(serializeStudy(study));
    const t5 = restored.radiographs[0]!.annotations.vertebrae[0]!;
    expect(t5.edited).toBe(true);
    expect(t5.confidence).toBe(0.92);
  });
});
