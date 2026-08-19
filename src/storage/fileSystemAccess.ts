/**
 * Import/export de estudios vía File System Access API. SPEC.md §3.
 * No todos los navegadores la implementan (Firefox y Safari, a fecha de
 * escritura, no) — cuando falta, se recurre a un `<input type="file">`
 * oculto para importar y a un enlace de descarga temporal para exportar,
 * de modo que la función nunca deja de estar disponible.
 */
import { deserializeStudy, serializeStudy } from './jsonExport';
import type { Study } from '../core/models/types';

function hasFileSystemAccess(): boolean {
  return typeof window !== 'undefined' && 'showSaveFilePicker' in window && 'showOpenFilePicker' in window;
}

function suggestedFileName(study: Study): string {
  const safeRef = study.patientRef.replace(/[^a-zA-Z0-9-_]/g, '');
  return `spinemetrics-${safeRef}-${study.date}.json`;
}

async function exportViaFileSystemAccess(study: Study): Promise<void> {
  const handle = await window.showSaveFilePicker({
    suggestedName: suggestedFileName(study),
    types: [{ description: 'Estudio SpineMetrics (JSON)', accept: { 'application/json': ['.json'] } }],
  });
  const writable = await handle.createWritable();
  await writable.write(serializeStudy(study));
  await writable.close();
}

function exportViaDownloadLink(study: Study): void {
  const blob = new Blob([serializeStudy(study)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = suggestedFileName(study);
  link.click();
  URL.revokeObjectURL(url);
}

/** SPEC.md §12: exporta el estudio completo a JSON — "debe bastar para
 * reconstruir todas las anotaciones." */
export async function exportStudyToFile(study: Study): Promise<void> {
  if (hasFileSystemAccess()) {
    try {
      await exportViaFileSystemAccess(study);
      return;
    } catch (error) {
      // El usuario canceló el selector de archivos: no es un error real.
      if (error instanceof DOMException && error.name === 'AbortError') return;
      throw error;
    }
  }
  exportViaDownloadLink(study);
}

async function importViaFileSystemAccess(): Promise<Study | null> {
  let handles: FileSystemFileHandle[];
  try {
    handles = await window.showOpenFilePicker({
      types: [{ description: 'Estudio SpineMetrics (JSON)', accept: { 'application/json': ['.json'] } }],
      multiple: false,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return null;
    throw error;
  }
  const handle = handles[0];
  if (!handle) return null;
  const file = await handle.getFile();
  return deserializeStudy(await file.text());
}

function importViaFileInput(): Promise<Study | null> {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      file
        .text()
        .then((text) => resolve(deserializeStudy(text)))
        .catch(reject);
    };
    input.click();
  });
}

/** Devuelve `null` si el usuario cancela el selector. */
export async function importStudyFromFile(): Promise<Study | null> {
  if (hasFileSystemAccess()) return importViaFileSystemAccess();
  return importViaFileInput();
}
