/**
 * Madurez esquelética (SPEC.md §7.11): Risser 0–5 con su sistema
 * obligatorio, Sanders (SSMS) 1–8 y cartílago trirradiado. `Study.maturity`
 * ya existía en el modelo de datos pero no tenía ninguna interfaz que lo
 * rellenara — este panel es esa interfaz, con el mismo patrón de "parche
 * parcial + recálculo en vivo" que `ManualClassificationPanel.tsx`
 * (`store.ts::setMaturity`), salvo que aquí no hay nada que recalcular:
 * son campos descriptivos que sólo alimentan el informe exportado (§12).
 *
 * `docs/OPEN_QUESTIONS.md` #32, "decisión firme": el campo Risser no puede
 * guardarse sin especificar el sistema (americano/francés) — el `<select>`
 * de Risser está deshabilitado hasta que se elige un sistema, en vez de
 * dejar guardar un valor ambiguo y confiar en que el usuario recuerde
 * fijarlo después.
 */
import { useAppStore } from '../store';
import type { RisserSystem } from '../../core/models/types';

const labelStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, color: '#c7cad1', fontSize: 12 };
const selectStyle: React.CSSProperties = { width: '100%', maxWidth: '100%' };
const rowStyle: React.CSSProperties = { display: 'flex', gap: 8 };

const RISSER_SYSTEM_LABELS: Record<RisserSystem, string> = { US: 'Americano', FR: 'Francés' };

function TriState({
  value,
  onChange,
  trueLabel,
  falseLabel,
}: {
  value: boolean | null | undefined;
  onChange: (value: boolean | undefined) => void;
  trueLabel: string;
  falseLabel: string;
}): JSX.Element {
  return (
    <select
      style={selectStyle}
      value={value === undefined || value === null ? '' : String(value)}
      onChange={(e) => onChange(e.target.value === '' ? undefined : e.target.value === 'true')}
    >
      <option value="">— sin evaluar —</option>
      <option value="true">{trueLabel}</option>
      <option value="false">{falseLabel}</option>
    </select>
  );
}

export function MaturityPanel(): JSX.Element | null {
  const radiograph = useAppStore((s) => s.radiograph);
  const maturity = useAppStore((s) => s.maturity);
  const setMaturity = useAppStore((s) => s.setMaturity);
  if (!radiograph) return null;

  return (
    <div style={{ padding: 16, borderTop: '1px solid #26282e' }}>
      <h3 style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#8a8f98', margin: '0 0 4px' }}>
        Madurez esquelética (SPEC.md §7.11)
      </h3>
      <p style={{ margin: '0 0 8px', fontSize: 12, color: '#8a8f98' }}>
        Sanders es prioritario visualmente: es el que mejor correlaciona con la fase de aceleración de la curva. Risser y Sanders no
        son sustitutos entre sí — se registran los dos si se dispone de ellos.
      </p>

      <label style={{ ...labelStyle, marginBottom: 6 }}>
        Sanders (SSMS 1–8)
        <select
          style={selectStyle}
          value={maturity.sanders ?? ''}
          onChange={(e) => setMaturity({ sanders: e.target.value === '' ? undefined : (Number(e.target.value) as 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8) })}
        >
          <option value="">— sin evaluar —</option>
          {[1, 2, 3, 4, 5, 6, 7, 8].map((stage) => (
            <option key={stage} value={stage}>
              Estadio {stage}
            </option>
          ))}
        </select>
      </label>
      <details style={{ marginBottom: 10 }}>
        <summary style={{ cursor: 'pointer', fontSize: 12, color: '#8a8f98' }}>Guía visual (referencia general)</summary>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: '#c7cad1' }}>
          Escala de 8 estadios sobre la osificación epifisaria de la mano, de menos maduro (1, sin densidad osificada visible) a más
          maduro (8, fisis cerrada). Los criterios exactos de cada estadio deben verificarse en la fuente primaria (Sanders et al.
          2008, ver <code>docs/REFERENCES.md</code>) antes de un uso clínico o académico — esta guía es sólo orientativa, no
          sustituye al artículo original.
        </p>
      </details>

      <div style={rowStyle}>
        <label style={{ ...labelStyle, flex: 1 }}>
          Sistema de Risser
          <select
            style={selectStyle}
            value={maturity.risserSystem ?? ''}
            onChange={(e) => {
              const risserSystem = e.target.value === '' ? undefined : (e.target.value as RisserSystem);
              // #32: sin sistema, el valor de Risser queda sin sentido —
              // se borra en vez de dejarlo "huérfano" en el estado.
              setMaturity(risserSystem === undefined ? { risserSystem: undefined, risser: undefined } : { risserSystem });
            }}
          >
            <option value="">— sin elegir —</option>
            {(Object.keys(RISSER_SYSTEM_LABELS) as RisserSystem[]).map((value) => (
              <option key={value} value={value}>
                {RISSER_SYSTEM_LABELS[value]}
              </option>
            ))}
          </select>
        </label>
        <label style={{ ...labelStyle, flex: 1 }}>
          Risser (0–5)
          <select
            style={selectStyle}
            value={maturity.risser ?? ''}
            disabled={maturity.risserSystem === undefined}
            onChange={(e) => setMaturity({ risser: e.target.value === '' ? undefined : (Number(e.target.value) as 0 | 1 | 2 | 3 | 4 | 5) })}
          >
            <option value="">— sin evaluar —</option>
            {[0, 1, 2, 3, 4, 5].map((grade) => (
              <option key={grade} value={grade}>
                {grade}
              </option>
            ))}
          </select>
        </label>
      </div>
      {maturity.risserSystem === undefined && (
        <p style={{ margin: '4px 0 10px', fontSize: 12, color: '#fbbf24' }}>
          docs/OPEN_QUESTIONS.md #32: el Risser americano y el francés no son equivalentes (el francés asigna los grados más tarde) —
          elige el sistema antes de poder registrar el grado.
        </p>
      )}

      <label style={{ ...labelStyle, marginTop: maturity.risserSystem === undefined ? 0 : 6 }}>
        Cartílago trirradiado
        <TriState
          value={maturity.triradiateOpen}
          onChange={(v) => setMaturity({ triradiateOpen: v })}
          trueLabel="Abierto"
          falseLabel="Cerrado"
        />
      </label>
    </div>
  );
}
