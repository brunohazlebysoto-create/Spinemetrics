/**
 * Panel de detección automática. SPEC.md §8: se dispara al importar sin que
 * el usuario haga nada (Etapas 0–3, 5, 8 corren solas, ver
 * `store.ts::runAutoDetection`); la Etapa 4 (a qué nivel corresponde cada
 * banda candidata) exige una única confirmación porque no hay segmentación
 * sacra real que ancle el recuento automáticamente (`training/README.md`:
 * sólo el andamiaje de entrenamiento existe, no un modelo). Ese es el único
 * clic que este pipeline heurístico, sin modelo entrenado, no puede evitar
 * sin fabricar un dato.
 */
import { useState } from 'react';
import { useAppStore } from '../store';
import type { SpinalLevel } from '../../core/models/types';

const ALL_LEVELS: SpinalLevel[] = [
  'C7',
  'T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10', 'T11', 'T12',
  'L1', 'L2', 'L3', 'L4', 'L5',
  'S1',
];

function qcColor(status: 'ok' | 'warning' | 'unavailable'): string {
  if (status === 'ok') return '#4ade80';
  if (status === 'warning') return '#fbbf24';
  return '#8a8f98';
}

export function AutoDetectionPanel(): JSX.Element | null {
  const autoDetection = useAppStore((s) => s.autoDetection);
  const autoDetectionLoading = useAppStore((s) => s.autoDetectionLoading);
  const applyAutoDetectionAnchor = useAppStore((s) => s.applyAutoDetectionAnchor);
  const radiograph = useAppStore((s) => s.radiograph);
  const [bandIndex, setBandIndex] = useState(0);
  const [level, setLevel] = useState<SpinalLevel>('T1');

  if (!autoDetection) {
    // SPEC.md §8: corre en un Web Worker, así que hay un hueco real entre
    // importar y tener resultado — mostrarlo en vez de un panel vacío.
    if (autoDetectionLoading) {
      return (
        <div style={{ padding: 16, borderBottom: '1px solid #26282e', fontSize: 12, color: '#8a8f98' }}>
          Detectando vértebras candidatas…
        </div>
      );
    }
    return null;
  }

  const alreadyApplied = (radiograph?.annotations.vertebrae.length ?? 0) > 0 && !autoDetection.levelLabeling.uncertain;

  return (
    <div style={{ padding: 16, borderBottom: '1px solid #26282e', fontSize: 12 }}>
      <h3 style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#8a8f98', margin: '0 0 8px' }}>
        Detección automática
      </h3>

      <p style={{ margin: '0 0 6px', color: '#8a8f98' }}>
        Proyección: {autoDetection.viewClassification.view ?? 'sin determinar'} (confianza{' '}
        {(autoDetection.viewClassification.confidence * 100).toFixed(0)}%)
      </p>

      <p style={{ margin: '0 0 6px', color: '#c7cad1' }}>
        {autoDetection.detectedBands.length} vértebra(s) candidata(s) detectada(s). Heurístico sin modelo entrenado
        (ver <code>training/README.md</code>): confianza máxima deliberadamente acotada, no equivalente a una
        segmentación real.
      </p>

      <details style={{ marginBottom: 8 }}>
        <summary style={{ cursor: 'pointer', color: '#8a8f98' }}>Control de calidad (SPEC.md §8.1)</summary>
        <ul style={{ margin: '4px 0 0', paddingLeft: 16 }}>
          {autoDetection.femoralHeads.femoralHeads === null ? null : (
            <li style={{ color: qcColor('ok') }}>Cabezas femorales detectadas (confianza {(autoDetection.femoralHeads.confidence.value * 100).toFixed(0)}%)</li>
          )}
        </ul>
      </details>

      {!alreadyApplied && autoDetection.detectedBands.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
          <p style={{ margin: 0, color: '#fbbf24' }}>
            SPEC.md §8 Etapa 4: sin segmentación sacra real, no se puede saber a qué nivel corresponde cada banda.
            Confirma uno para habilitar el cálculo automático:
          </p>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <label>
              Banda{' '}
              <select value={bandIndex} onChange={(e) => setBandIndex(Number(e.target.value))}>
                {autoDetection.detectedBands.map((band, i) => (
                  <option key={i} value={i}>
                    #{i} (fila {Math.round(band.rowCenter)}, confianza {(band.confidence.value * 100).toFixed(0)}%)
                  </option>
                ))}
              </select>
            </label>
            <label>
              es{' '}
              <select value={level} onChange={(e) => setLevel(e.target.value as SpinalLevel)}>
                {ALL_LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" disabled={autoDetectionLoading} onClick={() => void applyAutoDetectionAnchor(bandIndex, level)}>
              {autoDetectionLoading ? 'Calculando…' : 'Confirmar y calcular'}
            </button>
          </div>
        </div>
      )}

      {alreadyApplied && <p style={{ margin: 0, color: '#4ade80' }}>Niveles confirmados: mediciones automáticas calculadas abajo.</p>}
    </div>
  );
}
