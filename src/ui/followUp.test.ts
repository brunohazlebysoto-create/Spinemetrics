import { describe, expect, it } from 'vitest';
import { buildCobbSeries, buildMeasurementSeries, computeFollowUpDeltas, inheritedCobbTerminals, paStandingMeasurementSet } from './followUp';
import { recomputeMeasurementSet } from './measurementEngine';
import { calibrationFromRuler } from '../core/calibration/calibration';
import type { Pt, Radiograph, VertebraAnnotation } from '../core/models/types';

function tiltedEndplate(centerY: number, tiltDeg: number, xCenter = 200, width = 40): [Pt, Pt] {
  const rad = (tiltDeg * Math.PI) / 180;
  const half = width / 2;
  const dx = Math.cos(rad) * half;
  const dy = Math.sin(rad) * half;
  return [
    { x: xCenter - dx, y: centerY - dy },
    { x: xCenter + dx, y: centerY + dy },
  ];
}

function makeVertebra(level: VertebraAnnotation['level'], centerY: number, tiltDeg: number, xCenter = 200): VertebraAnnotation {
  return {
    level,
    superiorEndplate: tiltedEndplate(centerY - 15, tiltDeg, xCenter),
    inferiorEndplate: tiltedEndplate(centerY + 15, tiltDeg, xCenter),
    centroid: { x: xCenter, y: centerY },
  };
}

function makeRadiograph(vertebrae: VertebraAnnotation[], view: Radiograph['view'] = 'PA_standing'): Radiograph {
  return { id: 'r1', view, annotations: { vertebrae } };
}

// T5–T12, 30° de Cobb.
function curve30(): VertebraAnnotation[] {
  return [makeVertebra('T5', 0, 15), makeVertebra('T12', 200, -15)];
}

// Misma curva, con un cambio pequeño (~28° vs. 30° de la anterior: Δ<5°, dentro del margen).
function curve28(): VertebraAnnotation[] {
  return [makeVertebra('T5', 0, 14), makeVertebra('T12', 200, -14)];
}

// Misma curva, agravada a ~44° (progresión real, Δ > 5°).
function curve44(): VertebraAnnotation[] {
  return [makeVertebra('T5', 0, 22), makeVertebra('T12', 200, -22)];
}

describe('computeFollowUpDeltas', () => {
  it('calcula el delta de cada medición presente en ambos estudios, con isProgression sólo en Cobb', () => {
    const previous = recomputeMeasurementSet(makeRadiograph(curve30()));
    const current = recomputeMeasurementSet(makeRadiograph(curve44()));

    const rows = computeFollowUpDeltas(previous, current);
    const cobbRow = rows.find((r) => r.key === 'cobb')!;
    expect(cobbRow).toBeDefined();
    expect(cobbRow.deltaValue).toBeCloseTo(cobbRow.currentValue - cobbRow.previousValue, 6);
    expect(cobbRow.isProgression).toBe(true); // Δ > 5°.

    const thoracicKyphosisRow = rows.find((r) => r.key === 'thoracicKyphosis');
    expect(thoracicKyphosisRow?.isProgression).toBeNull(); // sin umbral publicado fuera de Cobb.
  });

  it('un cambio de Cobb ≤5° no cuenta como progresión (docs/OPEN_QUESTIONS.md #4)', () => {
    const previous = recomputeMeasurementSet(makeRadiograph(curve30()));
    const current = recomputeMeasurementSet(makeRadiograph(curve28()));

    const rows = computeFollowUpDeltas(previous, current);
    const cobbRow = rows.find((r) => r.key === 'cobb')!;
    expect(Math.abs(cobbRow.deltaValue)).toBeLessThan(5);
    expect(cobbRow.isProgression).toBe(false);
  });

  it('omite una medición si falta (status unavailable) en cualquiera de los dos estudios, nunca compara contra un hueco', () => {
    const previous = recomputeMeasurementSet(makeRadiograph([])); // sin vértebras: Cobb unavailable.
    const current = recomputeMeasurementSet(makeRadiograph(curve30()));

    const rows = computeFollowUpDeltas(previous, current);
    expect(rows.find((r) => r.key === 'cobb')).toBeUndefined();
  });

  it('nunca lanza sobre estudios sin ninguna medición en común', () => {
    const empty = recomputeMeasurementSet(makeRadiograph([]));
    expect(() => computeFollowUpDeltas(empty, empty)).not.toThrow();
    expect(computeFollowUpDeltas(empty, empty)).toEqual([]);
  });
});

describe('inheritedCobbTerminals', () => {
  it('devuelve las vértebras terminales del Cobb del estudio índice', () => {
    const indexSet = recomputeMeasurementSet(makeRadiograph(curve30()));
    const terminals = inheritedCobbTerminals(indexSet);
    expect(terminals).toEqual({ cranial: 'T5', caudal: 'T12' });
  });

  it('devuelve null si el estudio índice no tiene Cobb calculable (nunca fabrica un par)', () => {
    const indexSet = recomputeMeasurementSet(makeRadiograph([]));
    expect(inheritedCobbTerminals(indexSet)).toBeNull();
  });
});

describe('paStandingMeasurementSet', () => {
  it('devuelve el MeasurementSet alineado con la radiografía PA_standing del estudio', () => {
    const pa = makeRadiograph(curve30(), 'PA_standing');
    const lat = makeRadiograph([], 'LAT_standing');
    const paSet = recomputeMeasurementSet(pa);
    const latSet = recomputeMeasurementSet(lat);

    const study = { radiographs: [lat, pa], measurementSets: [latSet, paSet] };
    expect(paStandingMeasurementSet(study)).toBe(paSet);
  });

  it('devuelve null si el estudio no tiene ninguna PA_standing', () => {
    const lat = makeRadiograph([], 'LAT_standing');
    const study = { radiographs: [lat], measurementSets: [recomputeMeasurementSet(lat)] };
    expect(paStandingMeasurementSet(study)).toBeNull();
  });
});

describe('buildCobbSeries', () => {
  it('construye la serie cronológica del Cobb, ordenada por fecha, omitiendo estudios sin Cobb calculable', () => {
    const pa1 = makeRadiograph(curve30());
    const pa2 = makeRadiograph(curve44());
    const paEmpty = makeRadiograph([]);

    const studies = [
      { date: '2024-06-01', radiographs: [pa2], measurementSets: [recomputeMeasurementSet(pa2)] },
      { date: '2023-01-01', radiographs: [pa1], measurementSets: [recomputeMeasurementSet(pa1)] },
      { date: '2023-09-01', radiographs: [paEmpty], measurementSets: [recomputeMeasurementSet(paEmpty)] },
    ];

    const series = buildCobbSeries(studies);
    expect(series).toHaveLength(2); // el estudio sin Cobb se omite.
    expect(series.map((p) => p.date)).toEqual(['2023-01-01', '2024-06-01']); // cronológico.
    expect(series[1]!.cobbDeg).toBeGreaterThan(series[0]!.cobbDeg);
  });
});

describe('buildMeasurementSeries — SPEC.md §7.11, crecimiento torácico', () => {
  it('construye la serie cronológica de cualquier medición (p.ej. t1t12Height), omitiendo estudios sin valor calculable', () => {
    const calibration = calibrationFromRuler(100, 10);
    const shortSpine = makeRadiograph([makeVertebra('T1', 0, 0), makeVertebra('T12', 200, 0)]);
    const tallerSpine = makeRadiograph([makeVertebra('T1', 0, 0), makeVertebra('T12', 300, 0)]);
    const noT1 = makeRadiograph([makeVertebra('T12', 200, 0)]);

    const studies = [
      { date: '2024-06-01', radiographs: [tallerSpine], measurementSets: [recomputeMeasurementSet(tallerSpine, { calibration })] },
      { date: '2023-01-01', radiographs: [shortSpine], measurementSets: [recomputeMeasurementSet(shortSpine, { calibration })] },
      { date: '2023-09-01', radiographs: [noT1], measurementSets: [recomputeMeasurementSet(noT1, { calibration })] },
    ];

    const series = buildMeasurementSeries(studies, 't1t12Height');
    expect(series).toHaveLength(2); // el estudio sin T1 se omite.
    expect(series.map((p) => p.date)).toEqual(['2023-01-01', '2024-06-01']);
    expect(series[1]!.value).toBeGreaterThan(series[0]!.value); // la columna más alta mide más.
  });

  it('vacío si ningún estudio tiene el valor calculable (nunca fabrica puntos)', () => {
    const noCalibration = makeRadiograph([makeVertebra('T1', 0, 0), makeVertebra('T12', 200, 0)]);
    const studies = [{ date: '2024-01-01', radiographs: [noCalibration], measurementSets: [recomputeMeasurementSet(noCalibration)] }];
    expect(buildMeasurementSeries(studies, 't1t12Height')).toEqual([]);
  });
});
