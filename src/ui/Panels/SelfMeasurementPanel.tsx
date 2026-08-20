/**
 * Tabla de tres columnas de "Medir yo también" (SPEC.md §10.5): "propia /
 * automática / diferencia". Se muestra en cuanto hay un trazado propio
 * calculable, esté o no activo el modo — así se puede seguir revisando la
 * comparación después de terminar.
 */
import { useAppStore } from '../store';
import { computeSelfMeasurementComparison } from '../selfMeasurementComparison';
import { UNIT_SUFFIX } from './formatMeasurement';

function formatSigned(value: number, unit: string): string {
  const rounded = Math.round(value * 10) / 10;
  const sign = rounded > 0 ? '+' : '';
  return `${sign}${rounded}${unit}`;
}

export function SelfMeasurementPanel(): JSX.Element | null {
  const selfMeasurement = useAppStore((s) => s.selfMeasurement);
  const measurementSet = useAppStore((s) => s.measurementSet);
  const selfMeasurementUnblinded = useAppStore((s) => s.selfMeasurementUnblinded);

  if (!selfMeasurement?.measurementSet || !measurementSet) return null;

  const rows = computeSelfMeasurementComparison(selfMeasurement.measurementSet, measurementSet);

  return (
    <div style={{ padding: 16 }}>
      <h3 style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#8a8f98', margin: '0 0 4px' }}>
        Propia vs. automática (SPEC.md §10.5)
      </h3>
      {selfMeasurementUnblinded && (
        <p style={{ margin: '0 0 8px', fontSize: 12, color: '#fbbf24' }}>
          Se consultó el automático antes de terminar: este caso queda excluido de la estadística agregada del panel de
          Investigación (docs/OPEN_QUESTIONS.md #39), aunque la comparación de abajo se muestra igual.
        </p>
      )}
      {rows.length === 0 ? (
        <p style={{ margin: 0, fontSize: 12, color: '#8a8f98' }}>
          Ninguna medición coincide todavía entre tu trazado y el automático.
        </p>
      ) : (
        <table style={{ width: '100%', fontSize: 12, color: '#c7cad1', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ color: '#8a8f98', textAlign: 'left' }}>
              <th style={{ fontWeight: 'normal', padding: '2px 4px 2px 0' }}>Parámetro</th>
              <th style={{ fontWeight: 'normal', padding: '2px 4px', textAlign: 'right' }}>Propia</th>
              <th style={{ fontWeight: 'normal', padding: '2px 4px', textAlign: 'right' }}>Automática</th>
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
                    {Math.round(row.ownValue * 10) / 10}
                    {suffix}
                  </td>
                  <td style={{ padding: '3px 4px', textAlign: 'right' }}>
                    {Math.round(row.automaticValue * 10) / 10}
                    {suffix}
                  </td>
                  <td style={{ padding: '3px 0 3px 4px', textAlign: 'right' }}>{formatSigned(row.differenceValue, suffix)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
