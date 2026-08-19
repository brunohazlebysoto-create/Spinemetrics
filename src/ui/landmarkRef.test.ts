import { describe, expect, it } from 'vitest';
import { getLandmarkPoint, setLandmarkPoint, type LandmarkRef } from './landmarkRef';
import type { Radiograph, VertebraAnnotation } from '../core/models/types';

function makeVertebra(level: VertebraAnnotation['level']): VertebraAnnotation {
  return {
    level,
    superiorEndplate: [
      { x: 10, y: 0 },
      { x: 30, y: 0 },
    ],
    inferiorEndplate: [
      { x: 10, y: 20 },
      { x: 30, y: 20 },
    ],
  };
}

function makeRadiograph(vertebrae: VertebraAnnotation[] = []): Radiograph {
  return { id: 'r1', view: 'PA_standing', annotations: { vertebrae } };
}

describe('getLandmarkPoint / setLandmarkPoint — vértebras', () => {
  it('lee y escribe una esquina de platillo, marcando edited', () => {
    const radiograph = makeRadiograph([makeVertebra('T7')]);
    const ref: LandmarkRef = { kind: 'vertebraEndplate', level: 'T7', which: 'superior', side: 'right' };
    expect(getLandmarkPoint(radiograph, ref)).toEqual({ x: 30, y: 0 });

    const updated = setLandmarkPoint(radiograph, ref, { x: 35, y: 2 });
    expect(getLandmarkPoint(updated, ref)).toEqual({ x: 35, y: 2 });
    const v = updated.annotations.vertebrae.find((x) => x.level === 'T7')!;
    expect(v.edited).toBe(true);
    // No muta el original (actualización inmutable).
    expect(getLandmarkPoint(radiograph, ref)).toEqual({ x: 30, y: 0 });
  });

  it('no afecta el lado opuesto del platillo', () => {
    const radiograph = makeRadiograph([makeVertebra('T7')]);
    const ref: LandmarkRef = { kind: 'vertebraEndplate', level: 'T7', which: 'superior', side: 'left' };
    const updated = setLandmarkPoint(radiograph, ref, { x: -5, y: -5 });
    expect(getLandmarkPoint(updated, { kind: 'vertebraEndplate', level: 'T7', which: 'superior', side: 'right' })).toEqual({
      x: 30,
      y: 0,
    });
  });

  it('centroide: null si no está anotado, luego escribible', () => {
    const radiograph = makeRadiograph([makeVertebra('T7')]);
    const ref: LandmarkRef = { kind: 'vertebraCentroid', level: 'T7' };
    expect(getLandmarkPoint(radiograph, ref)).toBeNull();
    const updated = setLandmarkPoint(radiograph, ref, { x: 20, y: 10 });
    expect(getLandmarkPoint(updated, ref)).toEqual({ x: 20, y: 10 });
  });

  it('pedículo: al fijar un lado por primera vez, inicializa el otro con el mismo punto', () => {
    const radiograph = makeRadiograph([makeVertebra('T7')]);
    const updated = setLandmarkPoint(radiograph, { kind: 'vertebraPedicle', level: 'T7', side: 'left' }, { x: 15, y: 10 });
    const v = updated.annotations.vertebrae[0]!;
    expect(v.pedicles).toEqual({ left: { x: 15, y: 10 }, right: { x: 15, y: 10 } });
  });

  it('vértebra no encontrada: setLandmarkPoint no crea vértebras nuevas', () => {
    const radiograph = makeRadiograph([]);
    const updated = setLandmarkPoint(radiograph, { kind: 'vertebraCentroid', level: 'T7' }, { x: 1, y: 1 });
    expect(updated.annotations.vertebrae).toHaveLength(0);
  });
});

describe('getLandmarkPoint / setLandmarkPoint — pelvis', () => {
  it('crea la pelvis por defecto al tocar el primer punto', () => {
    const radiograph = makeRadiograph();
    expect(radiograph.annotations.pelvis).toBeUndefined();
    const updated = setLandmarkPoint(radiograph, { kind: 'pelvisFemoralHeadCenter', side: 'left' }, { x: 100, y: 400 });
    expect(updated.annotations.pelvis).toBeDefined();
    expect(getLandmarkPoint(updated, { kind: 'pelvisFemoralHeadCenter', side: 'left' })).toEqual({ x: 100, y: 400 });
  });

  it('conserva el resto de la pelvis al actualizar un único punto', () => {
    let radiograph = makeRadiograph();
    radiograph = setLandmarkPoint(radiograph, { kind: 'pelvisFemoralHeadCenter', side: 'left' }, { x: 100, y: 400 });
    radiograph = setLandmarkPoint(radiograph, { kind: 'pelvisFemoralHeadCenter', side: 'right' }, { x: 200, y: 400 });
    radiograph = setLandmarkPoint(radiograph, { kind: 'pelvisS1Endplate', side: 'left' }, { x: 130, y: 380 });
    expect(getLandmarkPoint(radiograph, { kind: 'pelvisFemoralHeadCenter', side: 'left' })).toEqual({ x: 100, y: 400 });
    expect(getLandmarkPoint(radiograph, { kind: 'pelvisFemoralHeadCenter', side: 'right' })).toEqual({ x: 200, y: 400 });
  });

  it('crestas ilíacas: inicializa ambos lados al primero', () => {
    const radiograph = makeRadiograph();
    const updated = setLandmarkPoint(radiograph, { kind: 'pelvisIliacCrest', side: 'right' }, { x: 260, y: 250 });
    expect(updated.annotations.pelvis!.iliacCrests).toEqual({
      left: { x: 260, y: 250 },
      right: { x: 260, y: 250 },
    });
  });
});

describe('getLandmarkPoint / setLandmarkPoint — costillas (Mehta)', () => {
  it('crea la anotación costal por nivel al primer punto', () => {
    const radiograph = makeRadiograph();
    const updated = setLandmarkPoint(
      radiograph,
      { kind: 'ribPoint', level: 'T8', side: 'concave', which: 'headMid' },
      { x: 150, y: 200 },
    );
    expect(updated.annotations.ribs).toHaveLength(1);
    expect(getLandmarkPoint(updated, { kind: 'ribPoint', level: 'T8', side: 'concave', which: 'headMid' })).toEqual({
      x: 150,
      y: 200,
    });
  });

  it('no pisa el punto convexo al escribir el cóncavo', () => {
    let radiograph = makeRadiograph();
    radiograph = setLandmarkPoint(radiograph, { kind: 'ribPoint', level: 'T8', side: 'convex', which: 'headMid' }, { x: 250, y: 200 });
    radiograph = setLandmarkPoint(radiograph, { kind: 'ribPoint', level: 'T8', side: 'concave', which: 'headMid' }, { x: 150, y: 200 });
    expect(getLandmarkPoint(radiograph, { kind: 'ribPoint', level: 'T8', side: 'convex', which: 'headMid' })).toEqual({
      x: 250,
      y: 200,
    });
  });
});
