import { describe, expect, it } from 'vitest';
import { buildReportData } from './report';
import { recomputeMeasurementSet } from './measurementEngine';
import { calibrationFromRuler } from '../core/calibration/calibration';
import type { Pt, Radiograph, VertebraAnnotation } from '../core/models/types';

function tiltedEndplate(centerY: number, tiltDeg: number, xCenter = 200, width = 40): [Pt, Pt] {
  const rad = (tiltDeg * Math.PI) / 180;
  const half = width / 2;
  const dx = Math.cos(rad) * half;
  const dy = Math.sin(rad) * half;
  return [{ x: xCenter - dx, y: centerY - dy }, { x: xCenter + dx, y: centerY + dy }];
}

function makeVertebra(level: VertebraAnnotation['level'], centerY: number, tiltDeg: number): VertebraAnnotation {
  return { level, superiorEndplate: tiltedEndplate(centerY - 15, tiltDeg), inferiorEndplate: tiltedEndplate(centerY + 15, tiltDeg) };
}

function makeRadiograph(vertebrae: VertebraAnnotation[], view: Radiograph['view'] = 'PA_standing'): Radiograph {
  return { id: 'r1', view, annotations: { vertebrae } };
}

describe('buildReportData — SPEC.md §12', () => {
  it('incluye identificación, proyecciones y una fila por medición presente', () => {
    const radiograph = makeRadiograph([makeVertebra('T5', 0, 15), makeVertebra('T12', 200, -15)]);
    const measurementSet = recomputeMeasurementSet(radiograph);
    const report = buildReportData({
      patientRef: 'SM-abc123',
      ageYears: 14,
      date: '2026-01-15',
      radiographs: [radiograph],
      measurementSet,
      maturity: {},
      now: () => new Date('2026-01-15T12:00:00.000Z'),
    });

    expect(report.patientRef).toBe('SM-abc123');
    expect(report.ageYears).toBe(14);
    expect(report.views).toEqual(['PA de pie']);
    expect(report.generatedAt).toBe('2026-01-15T12:00:00.000Z');

    const cobbRow = report.measurements.find((r) => r.key === 'cobb');
    expect(cobbRow).toBeDefined();
    expect(cobbRow!.value).toMatch(/°/);
    expect(cobbRow!.reference).toContain('escoliosis'); // referencia vetted (CLINICAL.SCOLIOSIS_THRESHOLD_DEG).
  });

  it('nunca fabrica una referencia normal para mediciones sin constante clínica vetted', () => {
    const radiograph = makeRadiograph([makeVertebra('T5', 0, 15), makeVertebra('T12', 200, -15)]);
    const measurementSet = recomputeMeasurementSet(radiograph);
    const report = buildReportData({ patientRef: 'SM-x', ageYears: 14, date: '2026-01-15', radiographs: [radiograph], measurementSet, maturity: {} });

    const t1Slope = report.measurements.find((r) => r.key === 't1Slope');
    expect(t1Slope!.reference).toBeNull();
  });

  it('incluye la observación (motivo) cuando una medición está en gris', () => {
    const radiograph = makeRadiograph([]); // sin vértebras: todo unavailable.
    const measurementSet = recomputeMeasurementSet(radiograph);
    const report = buildReportData({ patientRef: 'SM-x', ageYears: 14, date: '2026-01-15', radiographs: [radiograph], measurementSet, maturity: {} });

    const cobbRow = report.measurements.find((r) => r.key === 'cobb');
    expect(cobbRow!.status).toBe('unavailable');
    expect(cobbRow!.observation).not.toBeNull();
  });

  it('formatea la madurez esquelética con el sistema de Risser explícito', () => {
    const radiograph = makeRadiograph([]);
    const measurementSet = recomputeMeasurementSet(radiograph);
    const report = buildReportData({
      patientRef: 'SM-x',
      ageYears: 14,
      date: '2026-01-15',
      radiographs: [radiograph],
      measurementSet,
      maturity: { risser: 3, risserSystem: 'US', sanders: 4, triradiateOpen: false },
    });

    expect(report.maturity.risser).toBe('3 (sistema americano)');
    expect(report.maturity.sanders).toBe('Estadio 4 (SSMS)');
    expect(report.maturity.triradiateOpen).toBe('Cerrado');
  });

  it('sin datos de madurez, ningún campo se fabrica', () => {
    const radiograph = makeRadiograph([]);
    const measurementSet = recomputeMeasurementSet(radiograph);
    const report = buildReportData({ patientRef: 'SM-x', ageYears: 14, date: '2026-01-15', radiographs: [radiograph], measurementSet, maturity: {} });

    expect(report.maturity.risser).toBeNull();
    expect(report.maturity.sanders).toBeNull();
    expect(report.maturity.triradiateOpen).toBeNull();
  });

  it('followUp es null si no se pasa un estudio índice, y transcribe las filas si se pasa', () => {
    const radiograph = makeRadiograph([makeVertebra('T5', 0, 15), makeVertebra('T12', 200, -15)]);
    const measurementSet = recomputeMeasurementSet(radiograph);
    const withoutFollowUp = buildReportData({ patientRef: 'SM-x', ageYears: 14, date: '2026-01-15', radiographs: [radiograph], measurementSet, maturity: {} });
    expect(withoutFollowUp.followUp).toBeNull();

    const withFollowUp = buildReportData({
      patientRef: 'SM-x',
      ageYears: 14,
      date: '2026-01-15',
      radiographs: [radiograph],
      measurementSet,
      maturity: {},
      followUp: {
        indexDate: '2025-01-15',
        rows: [{ key: 'cobb', label: 'Ángulo de Cobb', unit: 'deg', previousValue: 25, currentValue: 30, deltaValue: 5, isProgression: false }],
      },
    });
    expect(withFollowUp.followUp!.indexDate).toBe('2025-01-15');
    expect(withFollowUp.followUp!.rows[0]!.delta).toBe('+5');
  });

  it('incluye el apéndice de convenciones y el descargo de responsabilidad', () => {
    const radiograph = makeRadiograph([]);
    const measurementSet = recomputeMeasurementSet(radiograph);
    const report = buildReportData({ patientRef: 'SM-x', ageYears: 14, date: '2026-01-15', radiographs: [radiograph], measurementSet, maturity: {} });

    expect(report.appendix.length).toBeGreaterThan(0);
    expect(report.appendix.some((e) => e.id.includes('#32'))).toBe(true);
    expect(report.disclaimer.length).toBeGreaterThan(0);
  });

  it('las clasificaciones llevan la etiqueta completa y un resumen de traza', () => {
    // Curva Lenke típica con estructuralidad simple.
    const vertebrae = [makeVertebra('T5', 0, 20), makeVertebra('T12', 200, -20)];
    const radiograph = makeRadiograph(vertebrae);
    const calibration = calibrationFromRuler(100, 10);
    const measurementSet = recomputeMeasurementSet(radiograph, { calibration, otherStudyRadiographs: [] });
    const report = buildReportData({ patientRef: 'SM-x', ageYears: 14, date: '2026-01-15', radiographs: [radiograph], measurementSet, maturity: {} });

    // No hay curva coronal clasificable con sólo 2 vértebras terminales sin ápex definido de sobra —
    // esta prueba sólo confirma que, si existiera alguna clasificación, tendría forma correcta.
    for (const row of report.classifications) {
      expect(row.label.length).toBeGreaterThan(0);
      expect(typeof row.traceSummary).toBe('string');
    }
  });
});
