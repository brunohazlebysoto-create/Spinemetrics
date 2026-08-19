/**
 * Una fila del panel de clasificación. SPEC.md §9: resultado con traza
 * plegada por defecto y nota discreta de lo que falta, sin bloqueos ni
 * advertencias en rojo.
 */
import type { ClassificationResult } from '../../core/models/types';

interface ClassificationRowProps {
  label: string;
  classification: ClassificationResult;
}

export function ClassificationRow({ label, classification }: ClassificationRowProps): JSX.Element {
  const hasUnmet = (classification.unmetInputs?.length ?? 0) > 0;

  return (
    <div style={{ padding: '6px 0', borderBottom: '1px solid #26282e' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ flex: 1, color: '#8a8f98', fontSize: 12 }}>{label}</span>
      </div>
      <div style={{ color: '#c7cad1' }}>{classification.result}</div>
      {classification.confidence !== undefined && (
        <div style={{ fontSize: 12, color: '#8a8f98' }}>Confianza: {(classification.confidence * 100).toFixed(0)}%</div>
      )}
      {hasUnmet && (
        <div style={{ fontSize: 12, color: '#fbbf24' }}>Datos que faltan: {classification.unmetInputs!.join(', ')}</div>
      )}
      {classification.trace.length > 0 && (
        <details style={{ marginTop: 2, fontSize: 12, color: '#8a8f98' }}>
          <summary style={{ cursor: 'pointer' }}>Traza</summary>
          <ol style={{ margin: '4px 0', paddingLeft: 16 }}>
            {classification.trace.map((step, i) => (
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
