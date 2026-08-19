/**
 * Orden anatómico craneal→caudal de `SpinalLevel`. Utilidad puramente de
 * interfaz (inserción ordenada al añadir una vértebra manualmente); no vive
 * en `core/` porque el motor de medición no necesita ordenar nada, sólo
 * recibe la lista ya construida.
 */
import type { SpinalLevel } from '../core/models/types';

const ORDER: SpinalLevel[] = [
  'C7',
  'T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11', 'T12',
  'L1', 'L2', 'L3', 'L4', 'L5',
  'S1',
];

export function spinalLevelRank(level: SpinalLevel): number {
  return ORDER.indexOf(level);
}

export function compareSpinalLevels(a: SpinalLevel, b: SpinalLevel): number {
  return spinalLevelRank(a) - spinalLevelRank(b);
}
