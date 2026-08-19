/**
 * Etapa 1 — Clasificación de la proyección. SPEC.md §8: "Primero por
 * metadatos DICOM (`ViewPosition`, `SeriesDescription`); si faltan,
 * clasificador de imagen ligero. Si la confianza es <0.9, preguntar:
 * clasificar mal la proyección invalida todo lo posterior."
 *
 * No existe un "clasificador de imagen ligero" real: entrenarlo exige datos
 * etiquetados que no existen en este repositorio (ver `training/README.md`).
 * En su ausencia, sin metadatos la confianza es honestamente 0 — nunca se
 * inventa una clasificación basada en píxeles sin verificar. El resultado
 * es exactamente el que pide SPEC.md para ese caso: confianza <0.9 →
 * preguntar al usuario.
 */
import type { RadiographView } from '../core/models/types';

export interface ViewClassification {
  view: RadiographView | null;
  confidence: number;
  source: 'dicomMetadata' | 'none';
  /** true si la confianza es <0.9: SPEC.md §8 exige preguntar al usuario en
   * vez de continuar con un valor no verificado. */
  requiresConfirmation: boolean;
  reason: string;
}

const METADATA_CONFIDENCE = 0.95;

/**
 * `viewHint` viene de `imaging/loadDicom.ts::guessRadiographView` (lectura
 * de `ViewPosition`/`SeriesDescription`), ya la única fuente real de
 * evidencia disponible sin un clasificador de imagen entrenado.
 */
export function classifyView(viewHint: RadiographView | null): ViewClassification {
  if (viewHint !== null) {
    return {
      view: viewHint,
      confidence: METADATA_CONFIDENCE,
      source: 'dicomMetadata',
      requiresConfirmation: METADATA_CONFIDENCE < 0.9,
      reason: `Proyección '${viewHint}' inferida de metadatos DICOM (ViewPosition/SeriesDescription).`,
    };
  }

  return {
    view: null,
    confidence: 0,
    source: 'none',
    requiresConfirmation: true,
    reason:
      'Sin metadatos DICOM de proyección y sin clasificador de imagen entrenado (ver training/README.md): ' +
      'no se puede inferir la proyección de forma fiable. Confirmación manual obligatoria (SPEC.md §8 Etapa 1).',
  };
}
