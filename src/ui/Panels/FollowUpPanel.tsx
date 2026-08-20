/**
 * Seguimiento seriado. SPEC.md §10.4: "Comparación con el estudio previo
 * del mismo paciente: tabla de deltas y gráfico de evolución del Cobb con
 * la banda de ±5° sombreada. Vértebras terminales heredadas del estudio
 * índice automáticamente."
 *
 * `store.ts::selectIndexStudy` ya hereda las terminales del Cobb
 * (`docs/OPEN_QUESTIONS.md` #2) — este panel sólo elige el estudio índice y
 * muestra el resultado; no recalcula nada por sí mismo.
 */
import { useState } from 'react';
import { useAppStore } from '../store';
import { buildCobbSeries, computeFollowUpDeltas, paStandingMeasurementSet, type CobbSeriesPoint } from '../followUp';
import { UNIT_SUFFIX } from './formatMeasurement';

function formatDelta(value: number, unit: string): string {
  const rounded = Math.round(value * 10) / 10;
  const sign = rounded > 0 ? '+' : '';
  return `${sign}${rounded}${unit}`;
}

function DeltaTable({ indexDate, currentDate }: { indexDate: string; currentDate: string }): JSX.Element | null {
  const getPaStandingMeasurementSet = useAppStore((s) => s.getPaStandingMeasurementSet);
  const priorStudies = useAppStore((s) => s.priorStudies);
  const selectedIndexStudyId = useAppStore((s) => s.selectedIndexStudyId);

  const indexStudy = priorStudies.find((s) => s.localId === selectedIndexStudyId);
  const indexSet = indexStudy ? paStandingMeasurementSet(indexStudy) : null;
  const currentSet = getPaStandingMeasurementSet();
  if (!indexSet || !currentSet) {
    return (
      <p style={{ margin: '8px 0 0', fontSize: 12, color: '#8a8f98' }}>
        El estudio índice o el actual no tienen un Cobb calculable en la PA de pie: no hay nada que comparar todavía.
      </p>
    );
  }

  const rows = computeFollowUpDeltas(indexSet, currentSet);
  if (rows.length === 0) {
    return <p style={{ margin: '8px 0 0', fontSize: 12, color: '#8a8f98' }}>Ninguna medición coincide entre ambos estudios.</p>;
  }

  return (
    <table style={{ width: '100%', marginTop: 8, fontSize: 12, color: '#c7cad1', borderCollapse: 'collapse' }}>
      <thead>
        <tr style={{ color: '#8a8f98', textAlign: 'left' }}>
          <th style={{ fontWeight: 'normal', padding: '2px 4px 2px 0' }}>Parámetro</th>
          <th style={{ fontWeight: 'normal', padding: '2px 4px', textAlign: 'right' }}>{indexDate}</th>
          <th style={{ fontWeight: 'normal', padding: '2px 4px', textAlign: 'right' }}>{currentDate}</th>
          <th style={{ fontWeight: 'normal', padding: '2px 0 2px 4px', textAlign: 'right' }}>Δ</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const suffix = UNIT_SUFFIX[row.unit];
          return (
            <tr key={row.key} style={{ borderTop: '1px solid #26282e' }}>
              <td style={{ padding: '3px 4px 3px 0' }}>{row.label}</td>
              <td style={{ padding: '3px 4px', textAlign: 'right' }}>
                {Math.round(row.previousValue * 10) / 10}
                {suffix}
              </td>
              <td style={{ padding: '3px 4px', textAlign: 'right' }}>
                {Math.round(row.currentValue * 10) / 10}
                {suffix}
              </td>
              <td
                style={{
                  padding: '3px 0 3px 4px',
                  textAlign: 'right',
                  color: row.isProgression === true ? '#fbbf24' : undefined,
                  fontWeight: row.isProgression === true ? 'bold' : undefined,
                }}
              >
                {formatDelta(row.deltaValue, suffix)}
                {row.isProgression === true && ' ⚠'}
              </td>
            </tr>
          );
        })}
      </tbody>
      <caption style={{ captionSide: 'bottom', textAlign: 'left', marginTop: 6, fontSize: 11, color: '#8a8f98', fontWeight: 'normal' }}>
        ⚠ progresión de Cobb: cambio &gt;5° (docs/OPEN_QUESTIONS.md #4) — un cambio de ≤5° queda dentro del error de medición.
      </caption>
    </table>
  );
}

const CHART_WIDTH = 300;
const CHART_HEIGHT = 150;
const PAD_LEFT = 28;
const PAD_RIGHT = 8;
const PAD_TOP = 16;
const PAD_BOTTOM = 20;
const COBB_MARGIN_DEG = 5; // docs/OPEN_QUESTIONS.md #4.

function CobbEvolutionChart({ series }: { series: CobbSeriesPoint[] }): JSX.Element | null {
  if (series.length === 0) return null;

  const plotWidth = CHART_WIDTH - PAD_LEFT - PAD_RIGHT;
  const plotHeight = CHART_HEIGHT - PAD_TOP - PAD_BOTTOM;
  const values = series.map((p) => p.cobbDeg);
  const minVal = Math.min(...values) - COBB_MARGIN_DEG - 2;
  const maxVal = Math.max(...values) + COBB_MARGIN_DEG + 2;
  const range = maxVal - minVal || 1;

  const xFor = (i: number): number => PAD_LEFT + (series.length > 1 ? (i / (series.length - 1)) * plotWidth : plotWidth / 2);
  const yFor = (v: number): number => PAD_TOP + plotHeight - ((v - minVal) / range) * plotHeight;

  const bandUpper = series.map((p, i) => `${xFor(i)},${yFor(p.cobbDeg + COBB_MARGIN_DEG)}`);
  const bandLower = series
    .map((p, i) => `${xFor(i)},${yFor(p.cobbDeg - COBB_MARGIN_DEG)}`)
    .reverse();
  const bandPoints = [...bandUpper, ...bandLower].join(' ');
  const linePoints = series.map((p, i) => `${xFor(i)},${yFor(p.cobbDeg)}`).join(' ');

  return (
    <svg width={CHART_WIDTH} height={CHART_HEIGHT} role="img" aria-label="Evolución del ángulo de Cobb">
      <polygon points={bandPoints} fill="#fbbf24" opacity={0.15} />
      <polyline points={linePoints} fill="none" stroke="#4ade80" strokeWidth={1.5} />
      {series.map((p, i) => (
        <g key={p.date + i}>
          <circle cx={xFor(i)} cy={yFor(p.cobbDeg)} r={3} fill="#4ade80" />
          <text x={xFor(i)} y={yFor(p.cobbDeg) - 7} fontSize={10} fill="#c7cad1" textAnchor="middle">
            {Math.round(p.cobbDeg)}°
          </text>
          <text x={xFor(i)} y={CHART_HEIGHT - 4} fontSize={9} fill="#8a8f98" textAnchor="middle">
            {p.date}
          </text>
        </g>
      ))}
    </svg>
  );
}

export function FollowUpPanel(): JSX.Element | null {
  const radiograph = useAppStore((s) => s.radiograph);
  const patientRef = useAppStore((s) => s.patientRef);
  const studyDate = useAppStore((s) => s.studyDate);
  const priorStudies = useAppStore((s) => s.priorStudies);
  const selectedIndexStudyId = useAppStore((s) => s.selectedIndexStudyId);
  const loadPriorStudies = useAppStore((s) => s.loadPriorStudies);
  const selectIndexStudy = useAppStore((s) => s.selectIndexStudy);
  const getPaStandingMeasurementSet = useAppStore((s) => s.getPaStandingMeasurementSet);
  const [searching, setSearching] = useState(false);

  if (!radiograph) return null;

  async function handleSearch(): Promise<void> {
    setSearching(true);
    await loadPriorStudies();
    setSearching(false);
  }

  const indexStudy = priorStudies.find((s) => s.localId === selectedIndexStudyId);
  const currentSet = getPaStandingMeasurementSet();
  const currentCobbDeg = currentSet?.measurements.cobb?.value ?? null;

  const historicalSeries = buildCobbSeries(priorStudies);
  const series = [
    ...historicalSeries,
    ...(currentCobbDeg !== null ? [{ date: studyDate, cobbDeg: currentCobbDeg }] : []),
  ].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div style={{ padding: 16 }}>
      <h3 style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#8a8f98', margin: '0 0 4px' }}>
        Seguimiento seriado (SPEC.md §10.4)
      </h3>
      <p style={{ margin: '0 0 8px', fontSize: 12, color: '#8a8f98' }}>
        Compara con un estudio previo guardado del mismo seudónimo. Elegir un estudio índice hereda sus vértebras
        terminales del Cobb (regla obligatoria, docs/OPEN_QUESTIONS.md #2).
      </p>

      <button type="button" onClick={() => void handleSearch()} disabled={!patientRef || searching}>
        {searching ? 'Buscando…' : 'Buscar estudios previos'}
      </button>

      {priorStudies.length === 0 ? (
        <p style={{ margin: '8px 0 0', fontSize: 12, color: '#8a8f98' }}>
          {patientRef ? 'Sin estudios previos guardados con este seudónimo.' : 'Escribe un seudónimo para buscar estudios previos.'}
        </p>
      ) : (
        <label style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 8, fontSize: 12, color: '#c7cad1' }}>
          Estudio índice
          <select
            style={{ width: '100%' }}
            value={selectedIndexStudyId ?? ''}
            onChange={(e) => selectIndexStudy(e.target.value === '' ? null : e.target.value)}
          >
            <option value="">— sin comparar —</option>
            {priorStudies.map((s) => (
              <option key={s.localId} value={s.localId}>
                {s.date}
              </option>
            ))}
          </select>
        </label>
      )}

      {indexStudy && <DeltaTable indexDate={indexStudy.date} currentDate={studyDate} />}

      {series.length > 1 && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 12, color: '#8a8f98', marginBottom: 4 }}>Evolución del Cobb (banda ±5°)</div>
          <CobbEvolutionChart series={series} />
        </div>
      )}
    </div>
  );
}
