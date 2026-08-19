/**
 * Orden anatómico craneal→caudal de `SpinalLevel`. Copia deliberada de
 * `src/ui/spinalLevelOrder.ts`: aquella existe para la inserción ordenada en
 * la interfaz; esta existe porque `core/classification` sí necesita ordenar
 * niveles (regiones de curva del §7.3, recuento de niveles del §8 Etapa 4) y
 * `core/` no puede importar nada de `ui/` (SPEC.md §4, regla no negociable).
 */
import type { SpinalLevel } from './types';

const ORDER: SpinalLevel[] = [
  'C7',
  'T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11', 'T12',
  'L1', 'L2', 'L3', 'L4', 'L5',
  'S1',
];

export function spinalLevelRank(level: SpinalLevel): number {
  return ORDER.indexOf(level);
}

/** Inversa de `spinalLevelRank`: el nivel en la posición `rank` del orden
 * craneal→caudal, o `null` si `rank` cae fuera de `SpinalLevel` (p. ej.
 * contando más craneal que C7 o más caudal que S1 — SPEC.md §8 Etapa 4, "si
 * el recuento no cuadra... sin adivinar": un recuento que se sale del
 * dominio nunca se redondea al extremo más cercano). */
export function spinalLevelAtRank(rank: number): SpinalLevel | null {
  return rank >= 0 && rank < ORDER.length ? ORDER[rank]! : null;
}

export function compareSpinalLevels(a: SpinalLevel, b: SpinalLevel): number {
  return spinalLevelRank(a) - spinalLevelRank(b);
}

/** true si `level` está entre `from` y `to` (inclusive), en cualquier orden
 * craneal→caudal. Base de la asignación de región de curva (§7.3) y de los
 * rangos de niveles de cifosis (§9.5, §9.1 Paso 6). */
export function isSpinalLevelBetween(level: SpinalLevel, from: SpinalLevel, to: SpinalLevel): boolean {
  const r = spinalLevelRank(level);
  const a = spinalLevelRank(from);
  const b = spinalLevelRank(to);
  const [lo, hi] = a <= b ? [a, b] : [b, a];
  return r >= lo && r <= hi;
}
