/**
 * Etapa 4 — Etiquetado de niveles. SPEC.md §8: "Contar desde S1 hacia
 * craneal, anclando en el platillo sacro... si el recuento no cuadra,
 * marcar `levelLabelingUncertain` y pedir confirmación de los niveles
 * ancla, sin adivinar."
 *
 * El ancla real ("platillo sacro") exige segmentación sacra, que no existe
 * sin modelo entrenado (`pipeline/pelvicDetector.ts` sólo detecta cabezas
 * femorales, honestamente, no S1). Sin ancla, esta etapa **nunca** asigna
 * niveles por su cuenta: devuelve las bandas detectadas sin etiquetar y
 * `uncertain: true`, exactamente el comportamiento que SPEC.md exige para
 * "el recuento no cuadra" — aquí el recuento ni siquiera se puede empezar.
 */
import type { SpinalLevel } from '../core/models/types';
import { spinalLevelAtRank, spinalLevelRank } from '../core/models/spinalLevelOrder';
import type { VertebraBandCandidate } from './vertebraDetector';

export interface LevelAnchor {
  /** Índice dentro de `bands` (ordenadas craneal→caudal) que se ancla a `level`. */
  bandIndex: number;
  level: SpinalLevel;
}

export interface LabeledBand {
  band: VertebraBandCandidate;
  /** `null` si no se pudo etiquetar (sin ancla, o el recuento cae fuera del
   * dominio de `SpinalLevel`). */
  level: SpinalLevel | null;
}

export interface LevelLabelingResult {
  labeled: LabeledBand[];
  uncertain: boolean;
  reason?: string;
}

/**
 * `bands` debe venir ya ordenada craneal→caudal (`rowCenter` ascendente en
 * el espacio de imagen, donde y crece hacia caudal). Sin `anchor`, todas las
 * bandas quedan sin nivel y `uncertain: true` — nunca se adivina cuál podría
 * ser T1 o L5 a partir sólo del conteo de bandas.
 */
export function labelVertebraLevels(bands: VertebraBandCandidate[], anchor: LevelAnchor | null): LevelLabelingResult {
  if (bands.length === 0) {
    return { labeled: [], uncertain: true, reason: 'Sin bandas vertebrales detectadas: nada que etiquetar.' };
  }

  if (!anchor) {
    return {
      labeled: bands.map((band) => ({ band, level: null })),
      uncertain: true,
      reason:
        'Sin ancla de nivel (requiere segmentación sacra o confirmación manual): SPEC.md §8 Etapa 4 prohíbe ' +
        'adivinar qué nivel es cada vértebra a partir sólo del conteo de bandas detectadas.',
    };
  }

  if (anchor.bandIndex < 0 || anchor.bandIndex >= bands.length) {
    return {
      labeled: bands.map((band) => ({ band, level: null })),
      uncertain: true,
      reason: `Índice de ancla (${anchor.bandIndex}) fuera del rango de bandas detectadas (0–${bands.length - 1}).`,
    };
  }

  const anchorRank = spinalLevelRank(anchor.level);
  let outOfDomain = false;
  const labeled: LabeledBand[] = bands.map((band, index) => {
    const rank = anchorRank + (index - anchor.bandIndex);
    const level = spinalLevelAtRank(rank);
    if (level === null) outOfDomain = true;
    return { band, level };
  });

  if (outOfDomain) {
    return {
      labeled,
      uncertain: true,
      reason:
        `Contando desde el ancla (${anchor.level} en la banda ${anchor.bandIndex}), al menos una banda cae fuera ` +
        "del dominio C7–S1: el recuento no cuadra (SPEC.md §8 Etapa 4, 'levelLabelingUncertain').",
    };
  }

  return { labeled, uncertain: false };
}
