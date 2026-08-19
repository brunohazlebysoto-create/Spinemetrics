/**
 * Botón de importación. SPEC.md §2.1 (DICOM/PNG/JPEG/TIFF), §11
 * (anonimización, modo "conservar identificadores" desactivado por
 * defecto con aviso explícito), §10.1 ("cero clics hasta el resultado":
 * la importación es la única acción manual antes de ver el resultado).
 */
import { useRef, useState } from 'react';
import { useAppStore } from './store';
import { loadDicomFile } from '../imaging/loadDicom';
import { loadRasterImage } from '../imaging/loadRasterImage';
import type { AnonymizationResult } from '../imaging/anonymize';
import type { Radiograph, RadiographView } from '../core/models/types';

function isDicomFile(file: File): boolean {
  return file.name.toLowerCase().endsWith('.dcm') || file.type === 'application/dicom';
}

function newRadiographId(): string {
  return crypto.randomUUID();
}

export function ImportControl(): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null);
  const loadImage = useAppStore((s) => s.loadImage);
  const setPatientRef = useAppStore((s) => s.setPatientRef);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [anonymization, setAnonymization] = useState<AnonymizationResult | null>(null);
  const [preserveIdentifiers, setPreserveIdentifiers] = useState(false);

  async function handleFile(file: File): Promise<void> {
    setStatus('Cargando…');
    setError(null);
    setAnonymization(null);
    try {
      if (isDicomFile(file)) {
        const loaded = await loadDicomFile(file, { preserveIdentifiers });
        const view: RadiographView = loaded.viewHint ?? 'PA_standing';
        const radiograph: Radiograph = { id: newRadiographId(), view, annotations: { vertebrae: [] } };
        loadImage(loaded.image, radiograph, loaded.calibration ?? undefined);
        setPatientRef(loaded.anonymization.pseudonym);
        setAnonymization(loaded.anonymization);
      } else {
        const image = await loadRasterImage(file);
        const radiograph: Radiograph = { id: newRadiographId(), view: 'PA_standing', annotations: { vertebrae: [] } };
        loadImage(image, radiograph);
      }
      setStatus(null);
    } catch (e) {
      setStatus(null);
      setError(e instanceof Error ? e.message : 'No se pudo cargar el archivo.');
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <input
        ref={inputRef}
        type="file"
        accept=".dcm,application/dicom,image/png,image/jpeg,image/tiff,.tif,.tiff,.jpg,.jpeg,.png"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleFile(file);
          e.target.value = '';
        }}
      />
      <button type="button" onClick={() => inputRef.current?.click()}>
        Importar radiografía
      </button>
      <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, color: '#c7cad1' }}>
        <input type="checkbox" checked={preserveIdentifiers} onChange={(e) => setPreserveIdentifiers(e.target.checked)} />
        Conservar identificadores DICOM (no recomendado)
      </label>
      {status && <span style={{ fontSize: 12, color: '#8a8f98' }}>{status}</span>}
      {error && <span style={{ fontSize: 12, color: '#f87171' }}>{error}</span>}
      {anonymization && (
        <span style={{ fontSize: 12, color: anonymization.preservedIdentifiers ? '#fbbf24' : '#4ade80' }}>
          {anonymization.preservedIdentifiers
            ? `⚠ Identificadores conservados — seudónimo ${anonymization.pseudonym}`
            : `Anonimizado (${anonymization.removedTags.length} tag${anonymization.removedTags.length === 1 ? '' : 's'} + ${anonymization.privateTagCount} privado(s)) — seudónimo ${anonymization.pseudonym}`}
          {anonymization.burnedInAnnotation && ' · BurnedInAnnotation=YES: puede haber datos identificables en el píxel'}
        </span>
      )}
    </div>
  );
}
