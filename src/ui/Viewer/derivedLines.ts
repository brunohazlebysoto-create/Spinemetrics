/**
 * Líneas derivadas para dibujar: platillos terminales del Cobb, CSVL,
 * C7PL. SPEC.md §3 (capa "líneas derivadas"), §7.2, §7.4.
 *
 * Pura: a partir del `Radiograph` y el `MeasurementSet` ya calculados (por
 * `core/measurements`, vía `measurementEngine.ts`) decide qué segmentos
 * dibujar. No recalcula nada — sólo relee las vértebras/pelvis que el motor
 * ya identificó (p. ej. `cobb.cranialVertebra`) para trazar su geometría.
 */
import type { CobbMeasurement } from '../../core/measurements/cobb';
import { endplateLine } from '../../core/measurements/vertebraGeometry';
import { s1EndplateMidpoint } from '../../core/measurements/pelvicGeometry';
import { subtract, add, scale } from '../../core/geometry/primitives';
import type { MeasurementSet, Radiograph, VertebraAnnotation } from '../../core/models/types';

export interface DerivedLine {
  key: string;
  points: [number, number, number, number];
  color: string;
  dash?: number[];
}

const COBB_LINE_EXTENSION_PX = 30;
const REFERENCE_LINE_COLOR = '#ffe066';
const CSVL_COLOR = '#66ff9e';
const C7PL_COLOR = '#ff6666';

function extendedEndplatePoints(v: VertebraAnnotation, which: 'superior' | 'inferior'): [number, number, number, number] {
  const line = endplateLine(v, which);
  const dir = subtract(line.p2, line.p1);
  const length = Math.hypot(dir.x, dir.y) || 1;
  const unit = scale(dir, 1 / length);
  const p1 = subtract(line.p1, scale(unit, COBB_LINE_EXTENSION_PX));
  const p2 = add(line.p2, scale(unit, COBB_LINE_EXTENSION_PX));
  return [p1.x, p1.y, p2.x, p2.y];
}

function findVertebra(radiograph: Radiograph, level: string | null | undefined): VertebraAnnotation | undefined {
  if (!level) return undefined;
  return radiograph.annotations.vertebrae.find((v) => v.level === level);
}

export function computeDerivedLines(radiograph: Radiograph, measurementSet: MeasurementSet | null, imageHeight: number): DerivedLine[] {
  const lines: DerivedLine[] = [];
  if (!measurementSet) return lines;

  const cobb = measurementSet.measurements.cobb as CobbMeasurement | undefined;
  if (cobb?.status !== 'unavailable') {
    const cranial = findVertebra(radiograph, cobb?.cranialVertebra);
    const caudal = findVertebra(radiograph, cobb?.caudalVertebra);
    if (cranial) lines.push({ key: 'cobb-cranial', points: extendedEndplatePoints(cranial, 'superior'), color: REFERENCE_LINE_COLOR });
    if (caudal) lines.push({ key: 'cobb-caudal', points: extendedEndplatePoints(caudal, 'inferior'), color: REFERENCE_LINE_COLOR });
  }

  const pelvis = radiograph.annotations.pelvis;
  if (pelvis) {
    const csvlX = s1EndplateMidpoint(pelvis).x;
    lines.push({ key: 'csvl', points: [csvlX, 0, csvlX, imageHeight], color: CSVL_COLOR, dash: [8, 6] });
  }

  const c7 = findVertebra(radiograph, 'C7');
  if (c7?.centroid) {
    const x = c7.centroid.x;
    lines.push({ key: 'c7pl', points: [x, 0, x, imageHeight], color: C7PL_COLOR, dash: [8, 6] });
  }

  return lines;
}
