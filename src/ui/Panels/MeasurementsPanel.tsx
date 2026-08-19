/**
 * Panel de mediciones. SPEC.md §10.1, §10.3: "Cero clics hasta el
 * resultado" — se muestra siempre que haya un `MeasurementSet`, agrupado
 * por región anatómica, sin que el usuario tenga que pedirlo.
 */
import { useAppStore } from '../store';
import { MeasurementRow } from './MeasurementRow';
import { MEASUREMENT_DISPLAY_CONFIG, MEASUREMENT_GROUPS } from './measurementDisplayConfig';
import type { CobbMeasurement } from '../../core/measurements/cobb';

export function MeasurementsPanel(): JSX.Element {
  const measurementSet = useAppStore((s) => s.measurementSet);

  if (!measurementSet) {
    return <div style={{ padding: 16, color: '#8a8f98' }}>Importa una radiografía para ver las mediciones.</div>;
  }

  const cobb = measurementSet.measurements.cobb as CobbMeasurement | undefined;

  return (
    <div style={{ padding: 16, overflowY: 'auto', height: '100%' }}>
      {cobb && cobb.status !== 'unavailable' && (
        <div style={{ marginBottom: 12, fontSize: 12, color: '#8a8f98' }}>
          {cobb.cranialVertebra}–{cobb.caudalVertebra}
          {cobb.apexVertebra && ` · ápex ${cobb.apexVertebra}`}
          {cobb.convexity && ` · convexidad ${cobb.convexity === 'right' ? 'derecha' : 'izquierda'}`}
        </div>
      )}

      {MEASUREMENT_GROUPS.map((group) => {
        const rows = MEASUREMENT_DISPLAY_CONFIG.filter((c) => c.group === group && measurementSet.measurements[c.key]);
        if (rows.length === 0) return null;
        return (
          <section key={group} style={{ marginBottom: 16 }}>
            <h3 style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#8a8f98', margin: '0 0 4px' }}>
              {group}
            </h3>
            {rows.map((c) => (
              <MeasurementRow key={c.key} label={c.label} measurement={measurementSet.measurements[c.key]!} />
            ))}
          </section>
        );
      })}
    </div>
  );
}
