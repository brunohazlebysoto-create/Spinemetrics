import { describe, expect, it } from 'vitest';
import { landmarkRefKey, listLandmarkPoints, sameLandmarkRef } from './landmarkPoints';
import type { Radiograph, VertebraAnnotation } from '../../core/models/types';

function makeVertebra(level: VertebraAnnotation['level']): VertebraAnnotation {
  return {
    level,
    superiorEndplate: [{ x: 0, y: 0 }, { x: 10, y: 0 }],
    inferiorEndplate: [{ x: 0, y: 10 }, { x: 10, y: 10 }],
  };
}

describe('listLandmarkPoints', () => {
  it('enumera las 4 esquinas de cada vértebra', () => {
    const radiograph: Radiograph = { id: 'r1', view: 'PA_standing', annotations: { vertebrae: [makeVertebra('T7')] } };
    const points = listLandmarkPoints(radiograph);
    expect(points).toHaveLength(4);
    expect(points.every((p) => p.group === 'vertebra')).toBe(true);
  });

  it('incluye centroide, pedículos y bordes laterales sólo si están anotados', () => {
    const withExtras: VertebraAnnotation = {
      ...makeVertebra('T7'),
      centroid: { x: 5, y: 5 },
      pedicles: { left: { x: 2, y: 5 }, right: { x: 8, y: 5 } },
      lateralBorders: [{ x: -2, y: 5 }, { x: 12, y: 5 }],
      posteriorSuperiorCorner: { x: 5, y: 10 },
    };
    const radiograph: Radiograph = { id: 'r1', view: 'PA_standing', annotations: { vertebrae: [withExtras] } };
    const points = listLandmarkPoints(radiograph);
    // 4 esquinas + centroide + 2 pedículos + 2 bordes + esquina posterosuperior = 10
    expect(points).toHaveLength(10);
  });

  it('enumera los puntos de la pelvis cuando está presente', () => {
    const radiograph: Radiograph = {
      id: 'r1',
      view: 'LAT_standing',
      annotations: {
        vertebrae: [],
        pelvis: {
          femoralHeads: { left: { center: { x: 0, y: 0 }, radius: 10 }, right: { center: { x: 20, y: 0 }, radius: 10 } },
          s1Endplate: [{ x: 5, y: -10 }, { x: 15, y: -10 }],
          iliacCrests: { left: { x: -5, y: -20 }, right: { x: 25, y: -20 } },
        },
      },
    };
    const points = listLandmarkPoints(radiograph);
    expect(points.filter((p) => p.group === 'pelvis')).toHaveLength(6);
  });

  it('enumera los 4 puntos de cada costilla anotada (Mehta)', () => {
    const radiograph: Radiograph = {
      id: 'r1',
      view: 'PA_standing',
      annotations: {
        vertebrae: [],
        ribs: [
          {
            level: 'T8',
            concave: { headMid: { x: 0, y: 0 }, neckMid: { x: 1, y: 1 } },
            convex: { headMid: { x: 2, y: 2 }, neckMid: { x: 3, y: 3 } },
          },
        ],
      },
    };
    const points = listLandmarkPoints(radiograph);
    expect(points.filter((p) => p.group === 'rib')).toHaveLength(4);
  });
});

describe('landmarkRefKey / sameLandmarkRef', () => {
  it('genera claves distintas para referencias distintas', () => {
    const a = landmarkRefKey({ kind: 'vertebraEndplate', level: 'T7', which: 'superior', side: 'left' });
    const b = landmarkRefKey({ kind: 'vertebraEndplate', level: 'T7', which: 'superior', side: 'right' });
    expect(a).not.toBe(b);
  });

  it('sameLandmarkRef compara por igualdad estructural, no por referencia', () => {
    const a = { kind: 'vertebraCentroid' as const, level: 'T7' as const };
    const b = { kind: 'vertebraCentroid' as const, level: 'T7' as const };
    expect(a).not.toBe(b);
    expect(sameLandmarkRef(a, b)).toBe(true);
  });

  it('sameLandmarkRef(null, null) es true; null vs. ref es false', () => {
    expect(sameLandmarkRef(null, null)).toBe(true);
    expect(sameLandmarkRef(null, { kind: 'vertebraCentroid', level: 'T7' })).toBe(false);
  });
});
