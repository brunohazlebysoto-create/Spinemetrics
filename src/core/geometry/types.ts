/**
 * Primitivas geométricas puras. SPEC.md §4, §5, §7.1.
 *
 * Todas las coordenadas están en píxeles de la imagen original (nunca en el
 * espacio remuestreado del pipeline de detección — ver SPEC.md §8 etapa 2).
 */

/** Punto en el espacio de la imagen. */
export interface Pt {
  readonly x: number;
  readonly y: number;
}

/** Segmento orientado entre dos puntos. El orden de p1/p2 importa para las
 * funciones que dependen de la dirección (p. ej. inclinación con signo). */
export interface Line {
  readonly p1: Pt;
  readonly p2: Pt;
}
