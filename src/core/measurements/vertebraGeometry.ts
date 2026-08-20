/**
 * Utilidades geométricas compartidas entre mediciones de `core/measurements`.
 * No es un módulo de SPEC.md §4 en sí mismo: existe para no duplicar lógica
 * entre `cobb.ts`, `balance.ts` y el resto (SPEC.md §17.7, "cualquier
 * duplicación de esa lógica es un error de diseño").
 */
import type { Line, Pt } from '../geometry/types';
import type { VertebraAnnotation } from '../models/types';

/** Línea del platillo superior o inferior de una vértebra, en el orden
 * izquierda→derecha del paciente definido por el modelo de datos (SPEC.md
 * §5). */
export function endplateLine(v: VertebraAnnotation, which: 'superior' | 'inferior'): Line {
  const [left, right] = which === 'superior' ? v.superiorEndplate : v.inferiorEndplate;
  return { p1: left, p2: right };
}

/** Punto medio del platillo superior o inferior de una vértebra. */
export function endplateMidpoint(v: VertebraAnnotation, which: 'superior' | 'inferior'): Pt {
  const [left, right] = which === 'superior' ? v.superiorEndplate : v.inferiorEndplate;
  return { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 };
}

/**
 * Centroide de una vértebra: usa el campo `centroid` cuando está presente
 * (landmark directo del pipeline o del usuario); si no, el promedio de las
 * cuatro esquinas de los platillos.
 */
export function vertebraCentroid(v: VertebraAnnotation): Pt {
  if (v.centroid) return v.centroid;
  const [supLeft, supRight] = v.superiorEndplate;
  const [infLeft, infRight] = v.inferiorEndplate;
  return {
    x: (supLeft.x + supRight.x + infLeft.x + infRight.x) / 4,
    y: (supLeft.y + supRight.y + infLeft.y + infRight.y) / 4,
  };
}
