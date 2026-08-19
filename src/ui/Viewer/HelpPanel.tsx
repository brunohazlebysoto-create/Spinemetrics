/** Panel de ayuda ("`?`"). SPEC.md §10.2. */
import { useAppStore } from '../store';

const SHORTCUTS: Array<[string, string]> = [
  ['E', 'Ciclar vértebra terminal craneal del Cobb'],
  ['Shift + E', 'Ciclar vértebra terminal caudal del Cobb'],
  ['R', 'Recalcular desde cero (descarta terminales forzadas)'],
  ['Espacio', 'Ocultar / mostrar overlays'],
  ['Flechas', 'Mover el landmark seleccionado 1 px'],
  ['Shift + flechas', 'Mover el landmark seleccionado 0.1 px'],
  ['Ctrl/Cmd + Z', 'Deshacer (ilimitado)'],
  ['?', 'Mostrar / ocultar esta ayuda'],
];

export function HelpPanel(): JSX.Element {
  const toggleHelp = useAppStore((s) => s.toggleHelp);

  return (
    <div
      role="dialog"
      aria-label="Atajos de teclado"
      style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(10, 11, 13, 0.85)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 20,
      }}
      onClick={toggleHelp}
    >
      <div
        style={{ background: '#1c1e22', borderRadius: 8, padding: 24, minWidth: 320, boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 style={{ marginTop: 0 }}>Atajos de teclado</h2>
        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
          <tbody>
            {SHORTCUTS.map(([key, description]) => (
              <tr key={key}>
                <td style={{ padding: '4px 12px 4px 0', whiteSpace: 'nowrap', fontFamily: 'monospace', color: '#4fd1ff' }}>{key}</td>
                <td style={{ padding: '4px 0' }}>{description}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <button type="button" onClick={toggleHelp} style={{ marginTop: 16 }}>
          Cerrar
        </button>
      </div>
    </div>
  );
}
