/**
 * Barra de herramientas del visor. SPEC.md §10.1 ("cero clics hasta el
 * resultado": todo lo demás es opcional, sólo importar es obligatorio),
 * §10.2 (herramientas del visor, capas conmutables).
 */
import { useAppStore } from './store';
import { ImportControl } from './ImportControl';
import { AddVertebraControl } from './AddVertebraControl';
import { WindowLevelControl } from './WindowLevelControl';
import { StudyIO } from './StudyIO';
import type { RadiographView } from '../core/models/types';

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

function ToolbarButton({ active, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }): JSX.Element {
  return (
    <button
      type="button"
      {...props}
      style={{
        background: active ? '#2b6cb0' : undefined,
        color: active ? '#fff' : undefined,
      }}
    />
  );
}

export function Toolbar(): JSX.Element {
  const radiograph = useAppStore((s) => s.radiograph);
  const activeTool = useAppStore((s) => s.activeTool);
  const setActiveTool = useAppStore((s) => s.setActiveTool);
  const setRadiographView = useAppStore((s) => s.setRadiographView);
  const layerVisibility = useAppStore((s) => s.layerVisibility);
  const toggleLayer = useAppStore((s) => s.toggleLayer);
  const overlaysVisible = useAppStore((s) => s.overlaysVisible);
  const toggleOverlays = useAppStore((s) => s.toggleOverlays);
  const history = useAppStore((s) => s.history);
  const undo = useAppStore((s) => s.undo);
  const toggleHelp = useAppStore((s) => s.toggleHelp);

  return (
    <div
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 16,
        padding: '8px 16px',
        borderBottom: '1px solid #26282e',
        background: '#17181c',
      }}
    >
      <strong style={{ color: '#e8e8ea' }}>SpineMetrics</strong>
      <ImportControl />

      {radiograph && (
        <>
          <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4, color: '#c7cad1' }}>
            Proyección
            <select value={radiograph.view} onChange={(e) => setRadiographView(e.target.value as RadiographView)}>
              {Object.entries(VIEW_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <div style={{ display: 'flex', gap: 4 }}>
            <ToolbarButton active={activeTool === 'select'} onClick={() => setActiveTool('select')}>
              Seleccionar
            </ToolbarButton>
            <ToolbarButton active={activeTool === 'ruler'} onClick={() => setActiveTool('ruler')}>
              Regla de calibración
            </ToolbarButton>
          </div>

          <AddVertebraControl />

          <div style={{ display: 'flex', gap: 4, fontSize: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#c7cad1' }}>
              <input type="checkbox" checked={overlaysVisible} onChange={toggleOverlays} />
              Overlays
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#c7cad1' }}>
              <input type="checkbox" checked={layerVisibility.landmarks} onChange={() => toggleLayer('landmarks')} />
              Landmarks
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#c7cad1' }}>
              <input type="checkbox" checked={layerVisibility.derivedLines} onChange={() => toggleLayer('derivedLines')} />
              Líneas
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 4, color: '#c7cad1' }}>
              <input type="checkbox" checked={layerVisibility.labels} onChange={() => toggleLayer('labels')} />
              Etiquetas
            </label>
          </div>

          <WindowLevelControl />

          <button type="button" onClick={undo} disabled={history.length === 0}>
            Deshacer
          </button>
          <button type="button" onClick={toggleHelp}>
            ?
          </button>
        </>
      )}

      <div style={{ marginLeft: 'auto' }}>
        <StudyIO />
      </div>
    </div>
  );
}
