/**
 * Cambia entre las radiografías de un mismo `Study` y añade nuevas (bending,
 * lateral, etc.). SPEC.md §5 permite varias radiografías por estudio;
 * `store.ts::otherRadiographs` las guarda fuera del visor hasta que se
 * activan. Añadir una radiografía nunca requiere volver a anotar la activa
 * desde cero: sólo recalcula su clasificación (`addRadiographToStudy`),
 * porque Lenke/SRS-Schwab/Roussouly pueden depender de la nueva (SPEC.md §9).
 */
import { useRef, useState } from 'react';
import { useAppStore } from './store';
import { loadDicomFile } from '../imaging/loadDicom';
import { loadRasterImage } from '../imaging/loadRasterImage';
import type { Radiograph, RadiographView } from '../core/models/types';

const VIEW_LABELS: Record<RadiographView, string> = {
  PA_standing: 'PA de pie',
  LAT_standing: 'Lateral de pie',
  PA_supine: 'PA en decúbito',
  BEND_left: 'Bending izquierdo',
  BEND_right: 'Bending derecho',
  FULCRUM: 'Fulcrum',
  TRACTION: 'Tracción',
  HAND: 'Mano (madurez)',
  PELVIS: 'Pelvis',
};

function isDicomFile(file: File): boolean {
  return file.name.toLowerCase().endsWith('.dcm') || file.type === 'application/dicom';
}

function newRadiographId(): string {
  return crypto.randomUUID();
}

export function RadiographSwitcher(): JSX.Element | null {
  const radiograph = useAppStore((s) => s.radiograph);
  const otherRadiographs = useAppStore((s) => s.otherRadiographs);
  const addRadiographToStudy = useAppStore((s) => s.addRadiographToStudy);
  const switchActiveRadiograph = useAppStore((s) => s.switchActiveRadiograph);

  const inputRef = useRef<HTMLInputElement>(null);
  const [newView, setNewView] = useState<RadiographView>('BEND_left');
  const [error, setError] = useState<string | null>(null);

  if (!radiograph) return null;

  async function handleFile(file: File): Promise<void> {
    setError(null);
    try {
      if (isDicomFile(file)) {
        const loaded = await loadDicomFile(file, { preserveIdentifiers: false });
        const view = loaded.viewHint ?? newView;
        const added: Radiograph = { id: newRadiographId(), view, annotations: { vertebrae: [] } };
        addRadiographToStudy(loaded.image, added, loaded.calibration ?? undefined);
      } else {
        const image = await loadRasterImage(file);
        const added: Radiograph = { id: newRadiographId(), view: newView, annotations: { vertebrae: [] } };
        addRadiographToStudy(image, added);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar el archivo.');
    }
  }

  const entries: { label: string; active: boolean; index: number | null; hasImage: boolean }[] = [
    { label: VIEW_LABELS[radiograph.view], active: true, index: null, hasImage: true },
    ...otherRadiographs.map((e, index) => ({
      label: VIEW_LABELS[e.radiograph.view],
      active: false,
      index,
      hasImage: e.image !== undefined,
    })),
  ];

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 12 }}>
      <span style={{ color: '#8a8f98' }}>Estudio:</span>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
        {entries.map((entry, i) => (
          <button
            key={i}
            type="button"
            disabled={entry.active || !entry.hasImage}
            onClick={() => entry.index !== null && switchActiveRadiograph(entry.index)}
            title={entry.hasImage ? undefined : 'Sin imagen cargada (importada desde JSON): vuelve a cargar el archivo original para poder activarla.'}
            style={{
              background: entry.active ? '#2b6cb0' : undefined,
              color: entry.active ? '#fff' : entry.hasImage ? undefined : '#5a5d64',
            }}
          >
            {entry.label}
            {!entry.hasImage && ' (sin imagen)'}
          </button>
        ))}
      </div>

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
      <label style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#c7cad1' }}>
        Añadir vista
        <select value={newView} onChange={(e) => setNewView(e.target.value as RadiographView)}>
          {Object.entries(VIEW_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <button type="button" onClick={() => inputRef.current?.click()}>
        + Radiografía
      </button>
      {error && <span style={{ color: '#f87171' }}>{error}</span>}
    </div>
  );
}
