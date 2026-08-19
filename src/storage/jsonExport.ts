/**
 * Serialización JSON de un `Study`. SPEC.md §12: "El JSON debe bastar para
 * reconstruir todas las anotaciones." Pura — la escritura/lectura de
 * archivo real vive en `fileSystemAccess.ts`.
 */
import type { Study } from '../core/models/types';

export const STUDY_EXPORT_FORMAT_VERSION = 1;

export interface StudyExportFile {
  formatVersion: number;
  exportedAt: string;
  study: Study;
}

export function serializeStudy(study: Study): string {
  const payload: StudyExportFile = {
    formatVersion: STUDY_EXPORT_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    study,
  };
  return JSON.stringify(payload, null, 2);
}

export function deserializeStudy(json: string): Study {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('El archivo no es JSON válido.');
  }

  if (!parsed || typeof parsed !== 'object' || !('study' in parsed)) {
    throw new Error('El archivo no contiene un estudio de SpineMetrics válido.');
  }

  const file = parsed as Partial<StudyExportFile>;
  if (file.formatVersion !== STUDY_EXPORT_FORMAT_VERSION) {
    throw new Error(`Versión de formato de exportación no soportada: ${String(file.formatVersion ?? 'desconocida')}.`);
  }

  return file.study as Study;
}
