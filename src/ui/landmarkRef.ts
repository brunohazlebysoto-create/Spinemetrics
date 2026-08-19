/**
 * Referencia genérica a un landmark dentro de un `Radiograph` y las
 * funciones puras para leerlo/escribirlo de forma inmutable. Es la capa que
 * conecta el lienzo de anotación (`ui/Viewer`, Konva) con el modelo de
 * datos de `core/models` sin que el motor de medición sepa nada de UI
 * (SPEC.md §4: `core/` no importa nada de `ui/`; aquí es al revés, `ui/`
 * depende de `core/`, lo cual sí está permitido).
 *
 * SPEC.md §10.2: "Cualquier landmark es arrastrable directamente [...] El
 * landmark corregido se marca `edited: true` [...] de forma invisible para
 * el usuario." Toda escritura que toque una vértebra pasa por
 * `markEdited`, sin excepción.
 */
import type { Pt } from '../core/geometry/types';
import type { PelvicAnnotation, Radiograph, RibAnnotation, SpinalLevel, VertebraAnnotation } from '../core/models/types';

export type LandmarkRef =
  | { kind: 'vertebraEndplate'; level: SpinalLevel; which: 'superior' | 'inferior'; side: 'left' | 'right' }
  | { kind: 'vertebraCentroid'; level: SpinalLevel }
  | { kind: 'vertebraPedicle'; level: SpinalLevel; side: 'left' | 'right' }
  | { kind: 'vertebraLateralBorder'; level: SpinalLevel; side: 'left' | 'right' }
  | { kind: 'vertebraPosteriorSuperiorCorner'; level: SpinalLevel }
  | { kind: 'pelvisFemoralHeadCenter'; side: 'left' | 'right' }
  | { kind: 'pelvisS1Endplate'; side: 'left' | 'right' }
  | { kind: 'pelvisIliacCrest'; side: 'left' | 'right' }
  | { kind: 'ribPoint'; level: SpinalLevel; side: 'concave' | 'convex'; which: 'headMid' | 'neckMid' };

function sideIndex(side: 'left' | 'right'): 0 | 1 {
  return side === 'left' ? 0 : 1;
}

export function getLandmarkPoint(radiograph: Radiograph, ref: LandmarkRef): Pt | null {
  const { vertebrae, pelvis, ribs } = radiograph.annotations;

  switch (ref.kind) {
    case 'vertebraEndplate': {
      const v = vertebrae.find((x) => x.level === ref.level);
      if (!v) return null;
      const endplate = ref.which === 'superior' ? v.superiorEndplate : v.inferiorEndplate;
      return endplate[sideIndex(ref.side)];
    }
    case 'vertebraCentroid': {
      return vertebrae.find((x) => x.level === ref.level)?.centroid ?? null;
    }
    case 'vertebraPedicle': {
      const v = vertebrae.find((x) => x.level === ref.level);
      return v?.pedicles?.[ref.side] ?? null;
    }
    case 'vertebraLateralBorder': {
      const v = vertebrae.find((x) => x.level === ref.level);
      return v?.lateralBorders?.[sideIndex(ref.side)] ?? null;
    }
    case 'vertebraPosteriorSuperiorCorner': {
      return vertebrae.find((x) => x.level === ref.level)?.posteriorSuperiorCorner ?? null;
    }
    case 'pelvisFemoralHeadCenter': {
      return pelvis?.femoralHeads[ref.side].center ?? null;
    }
    case 'pelvisS1Endplate': {
      return pelvis?.s1Endplate[sideIndex(ref.side)] ?? null;
    }
    case 'pelvisIliacCrest': {
      return pelvis?.iliacCrests?.[ref.side] ?? null;
    }
    case 'ribPoint': {
      const rib = ribs?.find((r) => r.level === ref.level);
      return rib?.[ref.side][ref.which] ?? null;
    }
    default: {
      const exhaustive: never = ref;
      return exhaustive;
    }
  }
}

function updateVertebra(
  radiograph: Radiograph,
  level: SpinalLevel,
  update: (v: VertebraAnnotation) => VertebraAnnotation,
): Radiograph {
  const vertebrae = radiograph.annotations.vertebrae.map((v) => (v.level === level ? update(v) : v));
  return { ...radiograph, annotations: { ...radiograph.annotations, vertebrae } };
}

function updatePelvis(radiograph: Radiograph, update: (p: PelvicAnnotation) => PelvicAnnotation): Radiograph {
  const fallback: PelvicAnnotation = {
    femoralHeads: {
      left: { center: { x: 0, y: 0 }, radius: 15 },
      right: { center: { x: 0, y: 0 }, radius: 15 },
    },
    s1Endplate: [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ],
  };
  const pelvis = update(radiograph.annotations.pelvis ?? fallback);
  return { ...radiograph, annotations: { ...radiograph.annotations, pelvis } };
}

function updateRib(
  radiograph: Radiograph,
  level: SpinalLevel,
  update: (r: RibAnnotation) => RibAnnotation,
): Radiograph {
  const existing = radiograph.annotations.ribs ?? [];
  const found = existing.find((r) => r.level === level);
  const fallback: RibAnnotation = {
    level,
    concave: { headMid: { x: 0, y: 0 }, neckMid: { x: 0, y: 0 } },
    convex: { headMid: { x: 0, y: 0 }, neckMid: { x: 0, y: 0 } },
  };
  const updated = update(found ?? fallback);
  const ribs = found ? existing.map((r) => (r.level === level ? updated : r)) : [...existing, updated];
  return { ...radiograph, annotations: { ...radiograph.annotations, ribs } };
}

function replaceTuple<T>(tuple: [T, T], index: 0 | 1, value: T): [T, T] {
  return index === 0 ? [value, tuple[1]] : [tuple[0], value];
}

/**
 * Devuelve un `Radiograph` nuevo con el landmark de `ref` movido a `point`.
 * Toda escritura sobre una vértebra marca `edited: true` (SPEC.md §10.2).
 * Los landmarks pélvicos/costales que aún no existen se crean con el resto
 * de sus puntos en el origen, a la espera de que el usuario los arrastre a
 * su posición: es deliberado (herramienta manual, sin valores inventados
 * en las mediciones — el punto en el origen no se usa en ningún cálculo
 * hasta que el usuario lo coloca).
 */
export function setLandmarkPoint(radiograph: Radiograph, ref: LandmarkRef, point: Pt): Radiograph {
  switch (ref.kind) {
    case 'vertebraEndplate':
      return updateVertebra(radiograph, ref.level, (v) => ({
        ...v,
        [ref.which === 'superior' ? 'superiorEndplate' : 'inferiorEndplate']: replaceTuple(
          ref.which === 'superior' ? v.superiorEndplate : v.inferiorEndplate,
          sideIndex(ref.side),
          point,
        ),
        edited: true,
      }));
    case 'vertebraCentroid':
      return updateVertebra(radiograph, ref.level, (v) => ({ ...v, centroid: point, edited: true }));
    case 'vertebraPedicle':
      return updateVertebra(radiograph, ref.level, (v) => ({
        ...v,
        pedicles: { left: v.pedicles?.left ?? point, right: v.pedicles?.right ?? point, [ref.side]: point },
        edited: true,
      }));
    case 'vertebraLateralBorder':
      return updateVertebra(radiograph, ref.level, (v) => ({
        ...v,
        lateralBorders: replaceTuple(v.lateralBorders ?? [point, point], sideIndex(ref.side), point),
        edited: true,
      }));
    case 'vertebraPosteriorSuperiorCorner':
      return updateVertebra(radiograph, ref.level, (v) => ({ ...v, posteriorSuperiorCorner: point, edited: true }));
    case 'pelvisFemoralHeadCenter':
      return updatePelvis(radiograph, (p) => ({
        ...p,
        femoralHeads: { ...p.femoralHeads, [ref.side]: { ...p.femoralHeads[ref.side], center: point } },
      }));
    case 'pelvisS1Endplate':
      return updatePelvis(radiograph, (p) => ({ ...p, s1Endplate: replaceTuple(p.s1Endplate, sideIndex(ref.side), point) }));
    case 'pelvisIliacCrest':
      return updatePelvis(radiograph, (p) => ({
        ...p,
        iliacCrests: { left: p.iliacCrests?.left ?? point, right: p.iliacCrests?.right ?? point, [ref.side]: point },
      }));
    case 'ribPoint':
      return updateRib(radiograph, ref.level, (r) => ({
        ...r,
        [ref.side]: { ...r[ref.side], [ref.which]: point },
      }));
    default: {
      const exhaustive: never = ref;
      return exhaustive;
    }
  }
}
