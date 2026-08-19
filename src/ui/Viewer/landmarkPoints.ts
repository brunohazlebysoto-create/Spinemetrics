/**
 * Enumera todos los landmarks presentes en un `Radiograph` como una lista
 * plana de `(LandmarkRef, punto)`, lista para dibujar. Pura — sin Konva ni
 * DOM — para poder probarla sin un navegador.
 */
import type { LandmarkRef } from '../landmarkRef';
import type { Pt, Radiograph } from '../../core/models/types';

export type LandmarkGroup = 'vertebra' | 'pelvis' | 'rib';

export interface RenderablePoint {
  ref: LandmarkRef;
  point: Pt;
  group: LandmarkGroup;
}

export function listLandmarkPoints(radiograph: Radiograph): RenderablePoint[] {
  const points: RenderablePoint[] = [];

  for (const v of radiograph.annotations.vertebrae) {
    points.push({ ref: { kind: 'vertebraEndplate', level: v.level, which: 'superior', side: 'left' }, point: v.superiorEndplate[0], group: 'vertebra' });
    points.push({ ref: { kind: 'vertebraEndplate', level: v.level, which: 'superior', side: 'right' }, point: v.superiorEndplate[1], group: 'vertebra' });
    points.push({ ref: { kind: 'vertebraEndplate', level: v.level, which: 'inferior', side: 'left' }, point: v.inferiorEndplate[0], group: 'vertebra' });
    points.push({ ref: { kind: 'vertebraEndplate', level: v.level, which: 'inferior', side: 'right' }, point: v.inferiorEndplate[1], group: 'vertebra' });

    if (v.centroid) points.push({ ref: { kind: 'vertebraCentroid', level: v.level }, point: v.centroid, group: 'vertebra' });

    if (v.pedicles) {
      points.push({ ref: { kind: 'vertebraPedicle', level: v.level, side: 'left' }, point: v.pedicles.left, group: 'vertebra' });
      points.push({ ref: { kind: 'vertebraPedicle', level: v.level, side: 'right' }, point: v.pedicles.right, group: 'vertebra' });
    }

    if (v.lateralBorders) {
      points.push({ ref: { kind: 'vertebraLateralBorder', level: v.level, side: 'left' }, point: v.lateralBorders[0], group: 'vertebra' });
      points.push({ ref: { kind: 'vertebraLateralBorder', level: v.level, side: 'right' }, point: v.lateralBorders[1], group: 'vertebra' });
    }

    if (v.posteriorSuperiorCorner) {
      points.push({ ref: { kind: 'vertebraPosteriorSuperiorCorner', level: v.level }, point: v.posteriorSuperiorCorner, group: 'vertebra' });
    }
  }

  const pelvis = radiograph.annotations.pelvis;
  if (pelvis) {
    points.push({ ref: { kind: 'pelvisFemoralHeadCenter', side: 'left' }, point: pelvis.femoralHeads.left.center, group: 'pelvis' });
    points.push({ ref: { kind: 'pelvisFemoralHeadCenter', side: 'right' }, point: pelvis.femoralHeads.right.center, group: 'pelvis' });
    points.push({ ref: { kind: 'pelvisS1Endplate', side: 'left' }, point: pelvis.s1Endplate[0], group: 'pelvis' });
    points.push({ ref: { kind: 'pelvisS1Endplate', side: 'right' }, point: pelvis.s1Endplate[1], group: 'pelvis' });
    if (pelvis.iliacCrests) {
      points.push({ ref: { kind: 'pelvisIliacCrest', side: 'left' }, point: pelvis.iliacCrests.left, group: 'pelvis' });
      points.push({ ref: { kind: 'pelvisIliacCrest', side: 'right' }, point: pelvis.iliacCrests.right, group: 'pelvis' });
    }
  }

  for (const rib of radiograph.annotations.ribs ?? []) {
    points.push({ ref: { kind: 'ribPoint', level: rib.level, side: 'concave', which: 'headMid' }, point: rib.concave.headMid, group: 'rib' });
    points.push({ ref: { kind: 'ribPoint', level: rib.level, side: 'concave', which: 'neckMid' }, point: rib.concave.neckMid, group: 'rib' });
    points.push({ ref: { kind: 'ribPoint', level: rib.level, side: 'convex', which: 'headMid' }, point: rib.convex.headMid, group: 'rib' });
    points.push({ ref: { kind: 'ribPoint', level: rib.level, side: 'convex', which: 'neckMid' }, point: rib.convex.neckMid, group: 'rib' });
  }

  return points;
}

/** Clave estable de React/mapas para un `LandmarkRef`. */
export function landmarkRefKey(ref: LandmarkRef): string {
  switch (ref.kind) {
    case 'vertebraEndplate':
      return `ve:${ref.level}:${ref.which}:${ref.side}`;
    case 'vertebraCentroid':
      return `vc:${ref.level}`;
    case 'vertebraPedicle':
      return `vp:${ref.level}:${ref.side}`;
    case 'vertebraLateralBorder':
      return `vl:${ref.level}:${ref.side}`;
    case 'vertebraPosteriorSuperiorCorner':
      return `vs:${ref.level}`;
    case 'pelvisFemoralHeadCenter':
      return `pf:${ref.side}`;
    case 'pelvisS1Endplate':
      return `ps:${ref.side}`;
    case 'pelvisIliacCrest':
      return `pi:${ref.side}`;
    case 'ribPoint':
      return `r:${ref.level}:${ref.side}:${ref.which}`;
    default: {
      const exhaustive: never = ref;
      return exhaustive;
    }
  }
}

/** Compara dos referencias por igualdad estructural (útil para saber si el
 * landmark seleccionado es el que se está dibujando). */
export function sameLandmarkRef(a: LandmarkRef | null, b: LandmarkRef | null): boolean {
  if (!a || !b) return a === b;
  return landmarkRefKey(a) === landmarkRefKey(b);
}
