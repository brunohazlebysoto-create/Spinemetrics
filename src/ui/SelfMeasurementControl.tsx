/**
 * Botón discreto "Medir yo también" (SPEC.md §10.5, opcional). Cambia el
 * modo; la colocación de vértebras la sigue haciendo la misma herramienta
 * de siempre (`AddVertebraControl` + `Viewer`), que `store.ts` redirige al
 * trazado propio mientras este modo está activo.
 */
import { useAppStore } from './store';

export function SelfMeasurementControl(): JSX.Element | null {
  const radiograph = useAppStore((s) => s.radiograph);
  const selfMeasurementActive = useAppStore((s) => s.selfMeasurementActive);
  const selfMeasurement = useAppStore((s) => s.selfMeasurement);
  const startSelfMeasurement = useAppStore((s) => s.startSelfMeasurement);
  const finishSelfMeasurement = useAppStore((s) => s.finishSelfMeasurement);
  const cancelSelfMeasurement = useAppStore((s) => s.cancelSelfMeasurement);

  if (!radiograph) return null;

  if (selfMeasurementActive) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
        <span style={{ color: '#a78bfa' }}>Trazando tu propia medición — los overlays automáticos quedan ocultos.</span>
        <button type="button" onClick={() => void finishSelfMeasurement()}>
          Terminar y comparar
        </button>
        <button type="button" onClick={cancelSelfMeasurement}>
          Cancelar
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
      <button type="button" onClick={startSelfMeasurement}>
        {selfMeasurement ? 'Volver a medir' : 'Medir yo también'}
      </button>
      {selfMeasurement && (
        <button type="button" onClick={cancelSelfMeasurement}>
          Descartar comparación
        </button>
      )}
    </div>
  );
}
