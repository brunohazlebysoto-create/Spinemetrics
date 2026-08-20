/**
 * Contexto clínico que no deriva de landmarks y no se captura ya en
 * `ManualClassificationPanel.tsx` (`Study.clinical.etiology`/`gmfcs` los
 * reutiliza `StudyIO.tsx::buildStudy` desde `manualClassificationInputs`,
 * ver su comentario — no se duplican aquí).
 *
 * `scoliometerATR`: `docs/OPEN_QUESTIONS.md` #34, "por defecto: 7° como
 * umbral de derivación (criterio original, menos falsos positivos),
 * mostrando simultáneamente que con 5° la sensibilidad es mayor.
 * Presentar ambos, no elegir en silencio." — de ahí que este panel muestre
 * las dos interpretaciones a la vez en vez de un único veredicto.
 *
 * `instrumented`: además de describir el estudio, alimenta el criterio de
 * "caso válido" del estudio de concordancia (`docs/OPEN_QUESTIONS.md` #38)
 * — `store.ts::finishSelfMeasurement` lo copia al `SelfMeasurementCase`
 * guardado en el momento de terminar la medición propia.
 */
import { useAppStore } from '../store';
import { DEFAULT_CONVENTIONS } from '../../core/config/conventions';

const labelStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, color: '#c7cad1', fontSize: 12 };
const checkboxLabelStyle: React.CSSProperties = { display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 6, color: '#c7cad1', fontSize: 12, marginTop: 8 };

const [LOW_THRESHOLD, HIGH_THRESHOLD] = DEFAULT_CONVENTIONS.maturity.scoliometerReferralThresholdsDeg;

export function ClinicalContextPanel(): JSX.Element | null {
  const radiograph = useAppStore((s) => s.radiograph);
  const clinical = useAppStore((s) => s.clinical);
  const setClinical = useAppStore((s) => s.setClinical);
  if (!radiograph) return null;

  const atr = clinical.scoliometerATR;

  return (
    <div style={{ padding: 16, borderTop: '1px solid #26282e' }}>
      <h3 style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#8a8f98', margin: '0 0 8px' }}>
        Contexto clínico (SPEC.md §5)
      </h3>

      <label style={labelStyle}>
        Ángulo de rotación de tronco (escoliómetro, °)
        <input
          type="number"
          step={0.5}
          min={0}
          value={atr ?? ''}
          onChange={(e) => setClinical({ scoliometerATR: e.target.value === '' ? undefined : Number(e.target.value) })}
          style={{ width: 80 }}
        />
      </label>
      {atr !== undefined && (
        <p style={{ margin: '4px 0 0', fontSize: 12, color: '#8a8f98' }}>
          Umbral de {HIGH_THRESHOLD}° (criterio original, menos falsos positivos): {atr >= HIGH_THRESHOLD ? 'derivar' : 'no derivar'}.
          {' '}Umbral de {LOW_THRESHOLD}° (mayor sensibilidad): {atr >= LOW_THRESHOLD ? 'derivar' : 'no derivar'}. (docs/OPEN_QUESTIONS.md #34,
          ambos criterios se muestran a la vez.)
        </p>
      )}

      <label style={checkboxLabelStyle}>
        <input type="checkbox" checked={clinical.instrumented ?? false} onChange={(e) => setClinical({ instrumented: e.target.checked })} />
        Columna instrumentada (cirugía previa)
      </label>
      {clinical.instrumented && (
        <p style={{ margin: '4px 0 0', fontSize: 12, color: '#8a8f98' }}>
          docs/OPEN_QUESTIONS.md #38: si usas "Medir yo también" con este estudio, el caso se guardará marcado como instrumentado y
          quedará excluido por defecto de la estadística agregada del panel de Investigación.
        </p>
      )}
    </div>
  );
}
