/**
 * Una fila del panel de mediciones. SPEC.md §10.3: valor con margen,
 * semáforo, motivo en gris, traza plegada por defecto, indicador de caso
 * límite discreto.
 */
import { formatMeasurementValue, semaphoreColor, SEMAPHORE_HEX } from './formatMeasurement';
import type { MeasurementResult } from '../../core/models/types';

interface MeasurementRowProps {
  label: string;
  measurement: MeasurementResult;
}

export function MeasurementRow({ label, measurement }: MeasurementRowProps): JSX.Element {
  const color = SEMAPHORE_HEX[semaphoreColor(measurement)];
  const hasWarnings = (measurement.warnings?.length ?? 0) > 0;

  return (
    <div style={{ padding: '6px 0', borderBottom: '1px solid #26282e' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span aria-hidden style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
        <span style={{ flex: 1, color: '#c7cad1' }}>{label}</span>
        <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{formatMeasurementValue(measurement)}</span>
        {hasWarnings && (
          <span title={measurement.warnings!.join(', ')} aria-label="Caso límite" style={{ color: SEMAPHORE_HEX.amber }}>
            ⚠
          </span>
        )}
      </div>
      {measurement.status !== 'ok' && measurement.reason && (
        <div style={{ fontSize: 12, color: '#8a8f98', marginLeft: 16 }}>{measurement.reason}</div>
      )}
      {measurement.trace.length > 0 && (
        <details style={{ marginLeft: 16, fontSize: 12, color: '#8a8f98' }}>
          <summary style={{ cursor: 'pointer' }}>Traza</summary>
          <ol style={{ margin: '4px 0', paddingLeft: 16 }}>
            {measurement.trace.map((step, i) => (
              <li key={i}>
                <strong>{step.step}:</strong> {step.detail}
                {step.value !== undefined && ` (${Math.round(step.value * 100) / 100})`}
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}
