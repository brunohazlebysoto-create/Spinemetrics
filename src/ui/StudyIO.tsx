/**
 * Guardar en IndexedDB / exportar-importar JSON. SPEC.md §3, §12.
 *
 * Limitación deliberada de esta fase: el JSON reconstruye anotaciones y
 * mediciones (SPEC.md §12), no los píxeles originales de la imagen — al
 * importar un estudio hay que volver a cargar también su radiografía si se
 * quiere ver superpuesta en el visor. Guardarlo en el bundle de la imagen
 * es una decisión de almacenamiento para una fase posterior.
 */
import { useState } from 'react';
import { useAppStore } from './store';
import { saveStudy } from '../storage/db';
import { exportStudyToFile, importStudyFromFile } from '../storage/fileSystemAccess';
import { recomputeMeasurementSet } from './measurementEngine';
import type { Radiograph, Study } from '../core/models/types';

async function stableLocalId(study: Study, radiographId: string): Promise<string> {
  const seed = `${study.patientRef}|${study.date}|${radiographId}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(seed));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32);
}

export function StudyIO(): JSX.Element {
  const radiograph = useAppStore((s) => s.radiograph);
  const measurementSet = useAppStore((s) => s.measurementSet);
  const otherRadiographs = useAppStore((s) => s.otherRadiographs);
  const patientRef = useAppStore((s) => s.patientRef);
  const studyDate = useAppStore((s) => s.studyDate);
  const ageYears = useAppStore((s) => s.ageYears);
  const setPatientRef = useAppStore((s) => s.setPatientRef);
  const setStudyDate = useAppStore((s) => s.setStudyDate);
  const setAgeYears = useAppStore((s) => s.setAgeYears);
  const importStudy = useAppStore((s) => s.importStudy);
  const [status, setStatus] = useState<string | null>(null);

  /** SPEC.md §5: un `Study` puede tener varias radiografías (bending,
   * lateral, etc., ver `store.ts::otherRadiographs`). La activa ya trae su
   * `MeasurementSet` recalculado en vivo; el resto no lo tiene guardado
   * (sólo se activa el que está en el visor) — se recalcula aquí mismo con
   * `recomputeMeasurementSet`, la MISMA función que usa el store, para que
   * ninguna quede fuera del JSON exportado ni del guardado local. */
  function buildStudy(): Study | null {
    if (!radiograph || !measurementSet) return null;
    const allRadiographs: Radiograph[] = [radiograph, ...otherRadiographs.map((e) => e.radiograph)];
    const otherMeasurementSets = otherRadiographs.map((entry) =>
      recomputeMeasurementSet(entry.radiograph, {
        ...(entry.calibration ? { calibration: entry.calibration } : {}),
        otherStudyRadiographs: allRadiographs.filter((r) => r !== entry.radiograph),
      }),
    );
    return {
      patientRef: patientRef || 'sin-seudónimo',
      date: studyDate,
      ageYears,
      radiographs: allRadiographs,
      measurementSets: [measurementSet, ...otherMeasurementSets],
    };
  }

  async function handleSave(): Promise<void> {
    const study = buildStudy();
    if (!study) return;
    const localId = await stableLocalId(study, radiograph!.id);
    await saveStudy({ ...study, localId });
    setStatus('Guardado localmente.');
  }

  async function handleExport(): Promise<void> {
    const study = buildStudy();
    if (!study) return;
    await exportStudyToFile(study);
    setStatus('Exportado.');
  }

  async function handleImport(): Promise<void> {
    const study = await importStudyFromFile();
    if (!study) return;
    setPatientRef(study.patientRef);
    setStudyDate(study.date);
    setAgeYears(study.ageYears);
    if (study.radiographs.length > 0) importStudy(study.radiographs);
    setStatus(
      study.radiographs.length > 1
        ? `Importado (${study.radiographs.length} radiografías). Vuelve a cargar la imagen original de cada una si quieres verlas en el visor.`
        : 'Importado. Vuelve a cargar la imagen original si quieres verla en el visor.',
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
      <label style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#c7cad1' }}>
        Seudónimo
        <input
          type="text"
          value={patientRef}
          onChange={(e) => setPatientRef(e.target.value)}
          placeholder="SM-…"
          style={{ width: 100 }}
        />
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#c7cad1' }}>
        Fecha
        <input type="date" value={studyDate} onChange={(e) => setStudyDate(e.target.value)} />
      </label>
      <label style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#c7cad1' }}>
        Edad
        <input
          type="number"
          min={0}
          max={120}
          value={ageYears}
          onChange={(e) => setAgeYears(Number(e.target.value))}
          style={{ width: 48 }}
        />
      </label>
      <button type="button" onClick={() => void handleSave()} disabled={!radiograph}>
        Guardar
      </button>
      <button type="button" onClick={() => void handleExport()} disabled={!radiograph}>
        Exportar JSON
      </button>
      <button type="button" onClick={() => void handleImport()}>
        Importar JSON
      </button>
      {status && <span style={{ color: '#8a8f98' }}>{status}</span>}
    </div>
  );
}
