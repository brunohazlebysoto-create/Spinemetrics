import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { generateReportPdf } from './reportPdf';
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

describe('generateReportPdf — SPEC.md §12', () => {
  it('produce un PDF válido (magic bytes %PDF, parseable) con contenido no vacío', async () => {
    const bytes = await generateReportPdf(makeReport());
    const header = Buffer.from(bytes.slice(0, 5)).toString('utf-8');
    expect(header).toBe('%PDF-');
    expect(bytes.length).toBeGreaterThan(500);

    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it('genera un PDF igualmente sin imagen anotada (no es obligatoria)', async () => {
    const bytes = await generateReportPdf(makeReport(), undefined);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
  });

  it('no lanza con un informe sin mediciones/clasificaciones/madurez/seguimiento (estudio recién creado)', async () => {
    const radiograph = makeRadiograph([]);
    const measurementSet = recomputeMeasurementSet(radiograph);
    const report = buildReportData({ patientRef: 'SM-x', ageYears: 10, date: '2026-01-15', radiographs: [radiograph], measurementSet, maturity: {} });
    const bytes = await generateReportPdf(report);
    expect(bytes.length).toBeGreaterThan(200);
  });
});
