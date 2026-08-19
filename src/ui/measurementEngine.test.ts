import { describe, expect, it } from 'vitest';
import { recomputeMeasurementSet } from './measurementEngine';
import { calibrationFromRuler } from '../core/calibration/calibration';
import type { CobbMeasurement } from '../core/measurements/cobb';
import type { PelvicAnnotation, Pt, Radiograph, VertebraAnnotation } from '../core/models/types';

function tiltedEndplate(centerY: number, tiltDeg: number, xCenter: number, width = 40): [Pt, Pt] {
  const rad = (tiltDeg * Math.PI) / 180;
  const half = width / 2;
  const dx = Math.cos(rad) * half;
  const dy = Math.sin(rad) * half;
  return [
    { x: xCenter - dx, y: centerY - dy },
    { x: xCenter + dx, y: centerY + dy },
  ];
}

function makeVertebra(
  level: VertebraAnnotation['level'],
  centerY: number,
  tiltDeg: number,
  xCenter = 200,
): VertebraAnnotation {
  return {
    level,
    superiorEndplate: tiltedEndplate(centerY - 15, tiltDeg, xCenter),
    inferiorEndplate: tiltedEndplate(centerY + 15, tiltDeg, xCenter),
    centroid: { x: xCenter, y: centerY },
  };
}

function makeFlatPelvis(s1MidX: number, s1Y: number, femoralY: number): PelvicAnnotation {
  return {
    femoralHeads: {
      left: { center: { x: s1MidX - 40, y: femoralY }, radius: 15 },
      right: { center: { x: s1MidX + 40, y: femoralY }, radius: 15 },
    },
    s1Endplate: [
      { x: s1MidX - 20, y: s1Y },
      { x: s1MidX + 20, y: s1Y },
    ],
  };
}

describe('recomputeMeasurementSet — sin anotaciones', () => {
  it('cobb unavailable y no calcula nada pélvico sin pelvis', () => {
    const radiograph: Radiograph = { id: 'r1', view: 'PA_standing', annotations: { vertebrae: [] } };
    const set = recomputeMeasurementSet(radiograph);
    expect(set.measurements.cobb!.status).toBe('unavailable');
    expect(set.measurements.coronalBalance).toBeUndefined();
    expect(set.measurements.pelvicIncidence).toBeUndefined();
    expect(set.source).toBe('manual');
    expect(set.classifications).toEqual({});
  });
});

describe('recomputeMeasurementSet — columna completa con pelvis', () => {
  const vertebrae: VertebraAnnotation[] = [
    makeVertebra('C7', 0, 0, 205),
    makeVertebra('T1', 30, 5, 200),
    makeVertebra('T5', 100, 10, 200),
    makeVertebra('T8', 200, 1, 200),
    makeVertebra('T12', 300, -15, 200),
    makeVertebra('L1', 400, 8, 200),
    { ...makeVertebra('S1', 460, 0, 200), posteriorSuperiorCorner: { x: 200, y: 450 } },
  ];
  const pelvis = makeFlatPelvis(200, 445, 545); // SS=0, PT=0, PI=0: coherente por construcción trivial.
  const calibration = calibrationFromRuler(100, 10); // 10 px/mm

  function build(): Radiograph {
    return { id: 'r1', view: 'PA_standing', annotations: { vertebrae, pelvis } };
  }

  it('calcula el Cobb entre T5 y T12 (única inflexión de signo)', () => {
    const set = recomputeMeasurementSet(build());
    expect(set.measurements.cobb!.status).toBe('ok');
    expect(set.measurements.cobb!.value).toBeCloseTo(25, 6); // |10| + |−15|
  });

  it('calcula cifosis torácica, lordosis lumbar, pendiente de T1 y TPA', () => {
    const set = recomputeMeasurementSet(build());
    expect(set.measurements.thoracicKyphosis!.status).toBe('ok');
    expect(set.measurements.lumbarLordosis!.status).toBe('ok');
    expect(set.measurements.t1Slope!.status).toBe('ok');
    expect(set.measurements.t1Slope!.value).toBeCloseTo(5, 6);
    expect(set.measurements.tpa!.status).toBe('ok');
  });

  it('calcula balance coronal, translación apical y SVA con calibración', () => {
    const set = recomputeMeasurementSet(build(), { calibration });
    expect(set.measurements.coronalBalance!.status).toBe('ok');
    expect(set.measurements.apicalTranslation!.status).toBe('ok');
    expect(set.measurements.sva!.status).toBe('ok');
  });

  it('sin calibración, las distancias salen unavailable pero los ángulos siguen ok', () => {
    const set = recomputeMeasurementSet(build());
    expect(set.measurements.coronalBalance!.status).toBe('unavailable');
    expect(set.measurements.sva!.status).toBe('unavailable');
    expect(set.measurements.thoracicKyphosis!.status).toBe('ok');
  });

  it('calcula SS/PT/PI, oblicuidad pélvica y PI-LL mismatch', () => {
    const set = recomputeMeasurementSet(build());
    expect(set.measurements.sacralSlope!.status).toBe('ok');
    expect(set.measurements.pelvicTilt!.status).toBe('ok');
    expect(set.measurements.pelvicIncidence!.status).toBe('ok');
    expect(set.measurements.pelvicIncidence!.value).toBeCloseTo(0, 3);
    expect(set.measurements.piLlMismatch).toBeDefined();
    expect(set.measurements.piLlMismatch!.value).toBeCloseTo(
      set.measurements.pelvicIncidence!.value! - set.measurements.lumbarLordosis!.value!,
      6,
    );
  });

  it('respeta las vértebras terminales forzadas del estudio índice', () => {
    const set = recomputeMeasurementSet(build(), { forcedCobbTerminals: { cranial: 'T1', caudal: 'L1' } });
    const cobb = set.measurements.cobb as CobbMeasurement;
    expect(cobb.cranialVertebra).toBe('T1');
    expect(cobb.caudalVertebra).toBe('L1');
  });
});
