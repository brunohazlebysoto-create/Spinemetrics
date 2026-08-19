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

/** Dónde y qué mostrar como etiqueta del ángulo de Cobb sobre la propia
 * imagen — no sólo en el panel lateral. Mismo espíritu que las capturas de
 * referencia del usuario (líneas cruzadas + grados junto al vértice):
 * confirma visualmente el ángulo en el sitio donde se está midiendo, útil
 * sobre todo al anotar a mano. */
export interface CobbAngleLabel {
  point: { x: number; y: number };
  text: string;
}

export interface DerivedLinesResult {
  lines: DerivedLine[];
  cobbLabel: CobbAngleLabel | null;
}

const COBB_LINE_EXTENSION_PX = 30;
const REFERENCE_LINE_COLOR = '#ffe066';
const CSVL_COLOR = '#66ff9e';
const C7PL_COLOR = '#ff6666';

/** Intersección de dos rectas infinitas definidas por (p1,p2) y (p3,p4).
 * `null` si son paralelas (o casi) — un Cobb ~0° no tiene un vértice
 * significativo que etiquetar. */
function lineIntersection(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number },
  p4: { x: number; y: number },
): { x: number; y: number } | null {
  const d1x = p2.x - p1.x;
  const d1y = p2.y - p1.y;
  const d2x = p4.x - p3.x;
  const d2y = p4.y - p3.y;
  const denom = d1x * d2y - d1y * d2x;
  if (Math.abs(denom) < 1e-6) return null;
  const t = ((p3.x - p1.x) * d2y - (p3.y - p1.y) * d2x) / denom;
  return { x: p1.x + t * d1x, y: p1.y + t * d1y };
}

function extendedEndplateSegment(v: VertebraAnnotation, which: 'superior' | 'inferior'): { p1: { x: number; y: number }; p2: { x: number; y: number } } {
  const line = endplateLine(v, which);
  const dir = subtract(line.p2, line.p1);
  const length = Math.hypot(dir.x, dir.y) || 1;
  const unit = scale(dir, 1 / length);
  const p1 = subtract(line.p1, scale(unit, COBB_LINE_EXTENSION_PX));
  const p2 = add(line.p2, scale(unit, COBB_LINE_EXTENSION_PX));
  return { p1, p2 };
}

function findVertebra(radiograph: Radiograph, level: string | null | undefined): VertebraAnnotation | undefined {
  if (!level) return undefined;
  return radiograph.annotations.vertebrae.find((v) => v.level === level);
}

/** Punto medio entre el par de extremos más cercanos de dos segmentos —
 * dónde "casi se tocan" visualmente. Respaldo para cuando la intersección
 * geométrica exacta de las dos rectas cae fuera de la imagen (curvas
 * pronunciadas con platillos muy separados: el cruce real puede quedar a
 * cientos de píxeles de la columna, un lugar inútil para leer el ángulo). */
function closestEndpointsMidpoint(
  a: { p1: { x: number; y: number }; p2: { x: number; y: number } },
  b: { p1: { x: number; y: number }; p2: { x: number; y: number } },
): { x: number; y: number } {
  const pairs: [{ x: number; y: number }, { x: number; y: number }][] = [
    [a.p1, b.p1],
    [a.p1, b.p2],
    [a.p2, b.p1],
    [a.p2, b.p2],
  ];
  let best = pairs[0]!;
  let bestDist = Infinity;
  for (const pair of pairs) {
    const d = Math.hypot(pair[0].x - pair[1].x, pair[0].y - pair[1].y);
    if (d < bestDist) {
      bestDist = d;
      best = pair;
    }
  }
  return { x: (best[0].x + best[1].x) / 2, y: (best[0].y + best[1].y) / 2 };
}

/** Margen (fracción de la dimensión de la imagen) más allá del cual el
 * vértice geométrico exacto se considera "fuera de vista" y se usa el
 * respaldo de `closestEndpointsMidpoint` en su lugar. */
const OUT_OF_BOUNDS_MARGIN_FRACTION = 0.25;

export function computeDerivedLines(
  radiograph: Radiograph,
  measurementSet: MeasurementSet | null,
  imageWidth: number,
  imageHeight: number,
): DerivedLinesResult {
  const lines: DerivedLine[] = [];
  let cobbLabel: CobbAngleLabel | null = null;
  if (!measurementSet) return { lines, cobbLabel };

  const cobb = measurementSet.measurements.cobb as CobbMeasurement | undefined;
  if (cobb?.status !== 'unavailable') {
    const cranial = findVertebra(radiograph, cobb?.cranialVertebra);
    const caudal = findVertebra(radiograph, cobb?.caudalVertebra);
    let cranialSegment: { p1: { x: number; y: number }; p2: { x: number; y: number } } | undefined;
    let caudalSegment: { p1: { x: number; y: number }; p2: { x: number; y: number } } | undefined;
    if (cranial) {
      cranialSegment = extendedEndplateSegment(cranial, 'superior');
      lines.push({ key: 'cobb-cranial', points: [cranialSegment.p1.x, cranialSegment.p1.y, cranialSegment.p2.x, cranialSegment.p2.y], color: REFERENCE_LINE_COLOR });
    }
    if (caudal) {
      caudalSegment = extendedEndplateSegment(caudal, 'inferior');
      lines.push({ key: 'cobb-caudal', points: [caudalSegment.p1.x, caudalSegment.p1.y, caudalSegment.p2.x, caudalSegment.p2.y], color: REFERENCE_LINE_COLOR });
    }

    if (cranialSegment && caudalSegment && cobb!.value !== null) {
      const marginX = imageWidth * OUT_OF_BOUNDS_MARGIN_FRACTION;
      const marginY = imageHeight * OUT_OF_BOUNDS_MARGIN_FRACTION;
      const vertex = lineIntersection(cranialSegment.p1, cranialSegment.p2, caudalSegment.p1, caudalSegment.p2);
      const inBounds =
        vertex !== null &&
        vertex.x >= -marginX &&
        vertex.x <= imageWidth + marginX &&
        vertex.y >= -marginY &&
        vertex.y <= imageHeight + marginY;
      const point = inBounds ? vertex! : closestEndpointsMidpoint(cranialSegment, caudalSegment);
      cobbLabel = { point, text: `${cobb!.value.toFixed(1)}°` };
    }
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

  return { lines, cobbLabel };
}
