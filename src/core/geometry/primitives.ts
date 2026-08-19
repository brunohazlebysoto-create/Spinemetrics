/**
 * Primitivas geométricas puras usadas por todo `core/measurements`.
 * SPEC.md §7.1. Sin dependencias externas, sin estado.
 */
import type { Line, Pt } from './types';

/** Línea horizontal de referencia (dirección +x). */
export const HORIZONTAL: Line = { p1: { x: 0, y: 0 }, p2: { x: 1, y: 0 } };

/** Línea vertical de referencia (dirección +y, hacia caudal en la imagen). */
export const VERTICAL: Line = { p1: { x: 0, y: 0 }, p2: { x: 0, y: 1 } };

export function subtract(a: Pt, b: Pt): Pt {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function add(a: Pt, b: Pt): Pt {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function scale(v: Pt, k: number): Pt {
  return { x: v.x * k, y: v.y * k };
}

export function distance(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function midpoint(a: Pt, b: Pt): Pt {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

/**
 * SPEC.md §7.1:
 * ```
 * angleBetweenLines(l1, l2):
 *   v1 = l1.p2 - l1.p1;  v2 = l2.p2 - l2.p1
 *   ang = |atan2(cross(v1,v2), dot(v1,v2))| en grados; devolver el agudo si > 90°
 * ```
 * Ángulo sin signo, siempre en [0°, 90°]. Es la primitiva usada por todos los
 * ángulos clínicos definidos como "ángulo entre dos líneas" (Cobb, TK, LL,
 * SS, PT, PI, pendiente de T1, oblicuidad pélvica, RVA...).
 */
export function angleBetweenLines(l1: Line, l2: Line): number {
  const v1 = subtract(l1.p2, l1.p1);
  const v2 = subtract(l2.p2, l2.p1);
  const cross = v1.x * v2.y - v1.y * v2.x;
  const dot = v1.x * v2.x + v1.y * v2.y;
  const angle = Math.abs(toDeg(Math.atan2(cross, dot)));
  return angle > 90 ? 180 - angle : angle;
}

/**
 * SPEC.md §7.1: `signedDistanceToVerticalLine(p, xLine) = p.x - xLine` con
 * signo positivo = derecha del paciente (ver convención de signos en
 * `core/geometry/README.md`). Usada para el balance coronal y la
 * translación apical (§7.4).
 */
export function signedDistanceToVerticalLine(p: Pt, xLine: number): number {
  return p.x - xLine;
}

/**
 * Inclinación de una línea respecto a la horizontal, **con signo**, acotada
 * a (-90°, 90°]. No es un ángulo clínico en sí: es la primitiva interna que
 * usa la selección automática de vértebras terminales del Cobb (§7.2) para
 * detectar el cambio de signo de inclinación de los platillos a lo largo de
 * la columna. El signo depende únicamente del orden p1→p2 de la línea de
 * entrada (por convención, platillo izquierda→derecha del paciente).
 */
export function signedInclinationFromHorizontal(line: Line): number {
  const v = subtract(line.p2, line.p1);
  let angle = toDeg(Math.atan2(v.y, v.x));
  if (angle > 90) angle -= 180;
  if (angle <= -90) angle += 180;
  return angle;
}

/**
 * Línea perpendicular a `line`, que pasa por `point`. Usada para la
 * incidencia pélvica (perpendicular al platillo de S1 en M, §7.6) y para el
 * RVA de Mehta (perpendicular al platillo inferior de la vértebra apical,
 * §7.9).
 */
export function perpendicularThrough(line: Line, point: Pt): Line {
  const v = subtract(line.p2, line.p1);
  const perp: Pt = { x: -v.y, y: v.x };
  return { p1: point, p2: add(point, perp) };
}

/** Línea vertical de referencia que pasa por `point`, para comparar contra
 * líneas verticales concretas (CSVL, C7PL) con `angleBetweenLines`. */
export function verticalThrough(point: Pt): Line {
  return { p1: point, p2: add(point, { x: 0, y: 1 }) };
}

/** Línea horizontal de referencia que pasa por `point`. */
export function horizontalThrough(point: Pt): Line {
  return { p1: point, p2: add(point, { x: 1, y: 0 }) };
}
