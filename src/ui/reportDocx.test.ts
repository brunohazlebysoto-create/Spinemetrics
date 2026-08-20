import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { generateReportDocx } from './reportDocx';
import { buildReportData } from './report';
import { recomputeMeasurementSet } from './measurementEngine';
import type { Radiograph, VertebraAnnotation } from '../core/models/types';

function makeRadiograph(vertebrae: VertebraAnnotation[] = []): Radiograph {
  return { id: 'r1', view: 'PA_standing', annotations: { vertebrae } };
}

function makeReport() {
  const radiograph = makeRadiograph([
    { level: 'T5', superiorEndplate: [{ x: 180, y: -15 }, { x: 220, y: -15 }], inferiorEndplate: [{ x: 180, y: 15 }, { x: 220, y: 15 }] },
    { level: 'T12', superiorEndplate: [{ x: 180, y: 185 }, { x: 220, y: 185 }], inferiorEndplate: [{ x: 180, y: 215 }, { x: 220, y: 215 }] },
  ]);
  const measurementSet = recomputeMeasurementSet(radiograph);
  return buildReportData({
    patientRef: 'SM-abc123',
    ageYears: 14,
    date: '2026-01-15',
    radiographs: [radiograph],
    measurementSet,
    maturity: { risser: 2, risserSystem: 'US', sanders: 3 },
    followUp: {
      indexDate: '2025-01-15',
      rows: [{ key: 'cobb', label: 'Ángulo de Cobb', unit: 'deg', previousValue: 20, currentValue: 28, deltaValue: 8, isProgression: true }],
    },
    now: () => new Date('2026-01-15T12:00:00.000Z'),
  });
}

describe('generateReportDocx — SPEC.md §12', () => {
  it('produce un .docx válido (ZIP con document.xml) con contenido no vacío', async () => {
    const bytes = await generateReportDocx(makeReport());
    expect(bytes.length).toBeGreaterThan(500);

    const zip = await JSZip.loadAsync(bytes);
    expect(zip.file('word/document.xml')).not.toBeNull();
    const xml = await zip.file('word/document.xml')!.async('string');
    expect(xml).toContain('SpineMetrics');
    expect(xml).toContain('abc123');
  });

  it('genera un docx igualmente sin imagen anotada', async () => {
    const bytes = await generateReportDocx(makeReport(), undefined);
    expect(bytes.length).toBeGreaterThan(500);
  });

  it('no lanza con un informe sin mediciones/clasificaciones/madurez/seguimiento', async () => {
    const radiograph = makeRadiograph([]);
    const measurementSet = recomputeMeasurementSet(radiograph);
    const report = buildReportData({ patientRef: 'SM-x', ageYears: 10, date: '2026-01-15', radiographs: [radiograph], measurementSet, maturity: {} });
    const bytes = await generateReportDocx(report);
    expect(bytes.length).toBeGreaterThan(200);
  });
});
