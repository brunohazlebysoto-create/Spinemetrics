/**
 * Entradas manuales para los clasificadores que SPEC.md §9 no puede derivar
 * de landmarks: C-EOS (§9.5), congénita Winter/McMaster (§9.6), Lonstein-
 * Akbarnia neuromuscular (§9.7) y el árbol guiado de Lenke-Silva (§9.9). El
 * resultado ya calculado se muestra en `ClassificationPanel.tsx` — este
 * panel sólo captura los hallazgos que el clínico debe registrar; no
 * recalcula nada por sí mismo (`store.ts::setManualClassificationInputs`
 * hace lo mismo que cualquier otra edición en vivo, SPEC.md §10.2).
 * También expone la tabla estática de osteotomías (§9.10), que no es un
 * clasificador y no depende de ninguna entrada.
 */
import { useAppStore } from '../store';
import type { FormationFailure, SegmentationFailure } from '../../core/classification/congenital';
import type { NeuromuscularEtiologyClass } from '../../core/classification/neuromuscular';
import type { LenkeSilvaChecklist, LenkeSilvaLevel } from '../../core/classification/lenkeSilva';
import { APPROACH_MODIFIER_DISAMBIGUATION_NOTE, APPROACH_MODIFIER_NAMES, OSTEOTOMY_REFERENCE_TABLE } from '../../core/classification/osteotomies';
import type { ScoliosisEtiology } from '../../core/models/types';

const ETIOLOGY_LABELS: Record<ScoliosisEtiology, string> = {
  idiopathic: 'Idiopática',
  congenital: 'Congénita',
  neuromuscular: 'Neuromuscular',
  syndromic: 'Sindrómica',
};

const NEUROMUSCULAR_ETIOLOGY_LABELS: Record<NeuromuscularEtiologyClass, string> = {
  neuropathicUpperMotorNeuron: 'Neuropática, neurona motora superior (parálisis cerebral, degeneración espinocerebelosa, siringomielia, lesión medular)',
  neuropathicLowerMotorNeuron: 'Neuropática, neurona motora inferior (poliomielitis, atrofia muscular espinal, mielomeningocele)',
  myopathic: 'Miopática (artrogriposis, distrofias musculares, distrofia miotónica, hipotonía congénita)',
};

const LENKE_SILVA_CHECKLIST_LABELS: Record<keyof LenkeSilvaChecklist, string> = {
  anteriorOsteophytes: 'Osteofitos anteriores',
  subluxationOver2mm: 'Subluxación >2 mm',
  curveMagnitudeAbove30Or45Deg: 'Magnitud de la curva ~30°/45°',
  lumbarKyphosis: 'Cifosis lumbar',
  globalImbalance: 'Desbalance global',
  bendingCorrectionBelow30Percent: 'Corrección <30 % en bending',
};

const LENKE_SILVA_LEVELS: LenkeSilvaLevel[] = ['I', 'II', 'III', 'IV', 'V', 'VI'];

// Columna, no fila: algunas opciones (etiología SRS, subtipos de hemivértebra)
// tienen texto largo que desbordaría la barra lateral de 340px si el
// `<select>` quedara al lado de su etiqueta en vez de debajo.
const labelStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, color: '#c7cad1', fontSize: 12 };
const selectStyle: React.CSSProperties = { width: '100%', maxWidth: '100%' };
const sectionStyle: React.CSSProperties = { marginTop: 10, paddingTop: 10, borderTop: '1px solid #26282e' };

/** Select de tres estados (Sí/No/sin dato) para hallazgos clínicos que no
 * tienen un valor por defecto seguro (`boolean | null`, nunca `boolean`). */
function TriStateSelect({
  value,
  onChange,
  trueLabel = 'Sí',
  falseLabel = 'No',
}: {
  value: boolean | null;
  onChange: (value: boolean | null) => void;
  trueLabel?: string;
  falseLabel?: string;
}): JSX.Element {
  return (
    <select
      style={selectStyle}
      value={value === null ? '' : String(value)}
      onChange={(e) => onChange(e.target.value === '' ? null : e.target.value === 'true')}
    >
      <option value="">— sin dato —</option>
      <option value="true">{trueLabel}</option>
      <option value="false">{falseLabel}</option>
    </select>
  );
}

const checkboxLabelStyle: React.CSSProperties = { display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 6, color: '#c7cad1', fontSize: 12 };

export function ManualClassificationPanel(): JSX.Element | null {
  const radiograph = useAppStore((s) => s.radiograph);
  const ageYears = useAppStore((s) => s.ageYears);
  const manual = useAppStore((s) => s.manualClassificationInputs);
  const setManual = useAppStore((s) => s.setManualClassificationInputs);
  if (!radiograph) return null;

  return (
    <div style={{ padding: 16 }}>
      <h3 style={{ fontSize: 13, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#8a8f98', margin: '0 0 4px' }}>
        Entrada manual (SPEC.md §9)
      </h3>
      <p style={{ margin: '0 0 8px', fontSize: 12, color: '#8a8f98' }}>
        Hallazgos que el modelo de landmarks no puede derivar. Se activan aquí y se recalculan como cualquier otra edición en vivo.
      </p>

      <label style={labelStyle}>
        Etiología
        <select
          style={selectStyle}
          value={manual.etiology ?? ''}
          onChange={(e) => setManual({ etiology: e.target.value === '' ? null : (e.target.value as ScoliosisEtiology) })}
        >
          <option value="">— sin elegir —</option>
          {(Object.keys(ETIOLOGY_LABELS) as ScoliosisEtiology[]).map((value) => (
            <option key={value} value={value}>
              {ETIOLOGY_LABELS[value]}
            </option>
          ))}
        </select>
      </label>

      {manual.etiology !== null && (
        <p style={{ margin: '4px 0 0', fontSize: 12, color: '#8a8f98' }}>
          {ageYears < 10
            ? `Edad actual ${ageYears} años (<10): activa C-EOS (§9.5). Cambia el campo "Edad" de la barra superior para corregirla.`
            : `Edad actual ${ageYears} años (≥10): C-EOS (§9.5) sólo aplica por debajo de 10 años, no se calcula.`}
        </p>
      )}

      {manual.etiology === 'congenital' && <CongenitalFields formationFailure={manual.congenitalFormationFailure} segmentationFailure={manual.congenitalSegmentationFailure} onChange={setManual} />}

      {manual.etiology === 'neuromuscular' && (
        <NeuromuscularFields
          etiologyClass={manual.neuromuscularEtiologyClass}
          trunkBalanced={manual.neuromuscularTrunkBalanced}
          pelvicObliquitySignificant={manual.neuromuscularPelvicObliquitySignificant}
          doubleBalancedCurve={manual.neuromuscularDoubleBalancedCurve}
          gmfcs={manual.neuromuscularGmfcs}
          onChange={setManual}
        />
      )}

      <div style={sectionStyle}>
        <label style={checkboxLabelStyle}>
          <input type="checkbox" checked={manual.lenkeSilvaEnabled} onChange={(e) => setManual({ lenkeSilvaEnabled: e.target.checked })} />
          Escoliosis degenerativa del adulto (Lenke-Silva, SPEC.md §9.9)
        </label>
        {manual.lenkeSilvaEnabled && (
          <LenkeSilvaFields checklist={manual.lenkeSilvaChecklist} clinicianSelectedLevel={manual.lenkeSilvaClinicianLevel} onChange={setManual} />
        )}
      </div>

      <OsteotomyReference />
    </div>
  );
}

function CongenitalFields({
  formationFailure,
  segmentationFailure,
  onChange,
}: {
  formationFailure: FormationFailure | null;
  segmentationFailure: SegmentationFailure | null;
  onChange: (patch: { congenitalFormationFailure?: FormationFailure | null; congenitalSegmentationFailure?: SegmentationFailure | null }) => void;
}): JSX.Element {
  const formationKind =
    formationFailure === null ? '' : formationFailure.kind === 'partialWedge' ? 'partialWedge' : `hemivertebra:${formationFailure.subtype}`;
  const formationSide = formationFailure?.kind === 'completeHemivertebra' ? formationFailure.side : 'left';

  function handleFormationKindChange(value: string): void {
    if (value === '') return onChange({ congenitalFormationFailure: null });
    if (value === 'partialWedge') return onChange({ congenitalFormationFailure: { kind: 'partialWedge' } });
    const subtype = value.split(':')[1] as 'fullySegmented' | 'semisegmented' | 'nonsegmentedOrIncarcerated';
    onChange({ congenitalFormationFailure: { kind: 'completeHemivertebra', subtype, side: formationSide } });
  }

  const segmentationKind = segmentationFailure === null ? '' : segmentationFailure.kind === 'unilateralBar' ? 'unilateralBar' : 'bilateralBlockVertebra';
  const segmentationSide = segmentationFailure?.kind === 'unilateralBar' ? segmentationFailure.side : 'left';

  function handleSegmentationKindChange(value: string): void {
    if (value === '') return onChange({ congenitalSegmentationFailure: null });
    if (value === 'bilateralBlockVertebra') return onChange({ congenitalSegmentationFailure: { kind: 'bilateralBlockVertebra' } });
    onChange({ congenitalSegmentationFailure: { kind: 'unilateralBar', side: segmentationSide } });
  }

  return (
    <div style={sectionStyle}>
      <div style={{ fontSize: 12, color: '#8a8f98', marginBottom: 4 }}>Congénita — Winter/McMaster (SPEC.md §9.6)</div>

      <label style={labelStyle}>
        Fallo de formación
        <select style={selectStyle} value={formationKind} onChange={(e) => handleFormationKindChange(e.target.value)}>
          <option value="">— ninguno —</option>
          <option value="partialWedge">Parcial (vértebra en cuña)</option>
          <option value="hemivertebra:fullySegmented">Hemivértebra completamente segmentada</option>
          <option value="hemivertebra:semisegmented">Hemivértebra semisegmentada</option>
          <option value="hemivertebra:nonsegmentedOrIncarcerated">Hemivértebra no segmentada o incarcerada</option>
        </select>
      </label>
      {formationFailure?.kind === 'completeHemivertebra' && (
        <label style={{ ...labelStyle, marginTop: 4 }}>
          Lado
          <select
            style={selectStyle}
            value={formationFailure.side}
            onChange={(e) => onChange({ congenitalFormationFailure: { ...formationFailure, side: e.target.value as 'left' | 'right' } })}
          >
            <option value="left">Izquierdo</option>
            <option value="right">Derecho</option>
          </select>
        </label>
      )}

      <label style={{ ...labelStyle, marginTop: 8 }}>
        Fallo de segmentación
        <select style={selectStyle} value={segmentationKind} onChange={(e) => handleSegmentationKindChange(e.target.value)}>
          <option value="">— ninguno —</option>
          <option value="unilateralBar">Barra unilateral no segmentada</option>
          <option value="bilateralBlockVertebra">Vértebra en bloque (bilateral)</option>
        </select>
      </label>
      {segmentationFailure?.kind === 'unilateralBar' && (
        <label style={{ ...labelStyle, marginTop: 4 }}>
          Lado
          <select
            style={selectStyle}
            value={segmentationFailure.side}
            onChange={(e) => onChange({ congenitalSegmentationFailure: { ...segmentationFailure, side: e.target.value as 'left' | 'right' } })}
          >
            <option value="left">Izquierdo</option>
            <option value="right">Derecho</option>
          </select>
        </label>
      )}
    </div>
  );
}

function NeuromuscularFields({
  etiologyClass,
  trunkBalanced,
  pelvicObliquitySignificant,
  doubleBalancedCurve,
  gmfcs,
  onChange,
}: {
  etiologyClass: NeuromuscularEtiologyClass | null;
  trunkBalanced: boolean | null;
  pelvicObliquitySignificant: boolean | null;
  doubleBalancedCurve: boolean | null;
  gmfcs: 1 | 2 | 3 | 4 | 5 | null;
  onChange: (patch: {
    neuromuscularEtiologyClass?: NeuromuscularEtiologyClass | null;
    neuromuscularTrunkBalanced?: boolean | null;
    neuromuscularPelvicObliquitySignificant?: boolean | null;
    neuromuscularDoubleBalancedCurve?: boolean | null;
    neuromuscularGmfcs?: 1 | 2 | 3 | 4 | 5 | null;
  }) => void;
}): JSX.Element {
  return (
    <div style={sectionStyle}>
      <div style={{ fontSize: 12, color: '#8a8f98', marginBottom: 4 }}>Neuromuscular — Lonstein-Akbarnia (SPEC.md §9.7)</div>

      <label style={labelStyle}>
        Etiología SRS
        <select
          style={selectStyle}
          value={etiologyClass ?? ''}
          onChange={(e) => onChange({ neuromuscularEtiologyClass: e.target.value === '' ? null : (e.target.value as NeuromuscularEtiologyClass) })}
        >
          <option value="">— sin elegir —</option>
          {(Object.keys(NEUROMUSCULAR_ETIOLOGY_LABELS) as NeuromuscularEtiologyClass[]).map((value) => (
            <option key={value} value={value}>
              {NEUROMUSCULAR_ETIOLOGY_LABELS[value]}
            </option>
          ))}
        </select>
      </label>

      <label style={{ ...labelStyle, marginTop: 4 }}>
        Tronco compensado
        <TriStateSelect value={trunkBalanced} onChange={(v) => onChange({ neuromuscularTrunkBalanced: v })} />
      </label>

      {trunkBalanced === true && (
        <label style={{ ...labelStyle, marginTop: 4 }}>
          Doble curva balanceada
          <TriStateSelect value={doubleBalancedCurve} onChange={(v) => onChange({ neuromuscularDoubleBalancedCurve: v })} />
        </label>
      )}

      {trunkBalanced === false && (
        <label style={{ ...labelStyle, marginTop: 4 }}>
          Oblicuidad pélvica significativa
          <TriStateSelect value={pelvicObliquitySignificant} onChange={(v) => onChange({ neuromuscularPelvicObliquitySignificant: v })} />
        </label>
      )}

      <label style={{ ...labelStyle, marginTop: 4 }}>
        GMFCS
        <select
          style={selectStyle}
          value={gmfcs ?? ''}
          onChange={(e) => onChange({ neuromuscularGmfcs: e.target.value === '' ? null : (Number(e.target.value) as 1 | 2 | 3 | 4 | 5) })}
        >
          <option value="">— sin dato —</option>
          {[1, 2, 3, 4, 5].map((level) => (
            <option key={level} value={level}>
              Nivel {level}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function LenkeSilvaFields({
  checklist,
  clinicianSelectedLevel,
  onChange,
}: {
  checklist: LenkeSilvaChecklist;
  clinicianSelectedLevel: LenkeSilvaLevel | null;
  onChange: (patch: { lenkeSilvaChecklist?: LenkeSilvaChecklist; lenkeSilvaClinicianLevel?: LenkeSilvaLevel | null }) => void;
}): JSX.Element {
  return (
    <div style={{ marginTop: 8, paddingLeft: 4 }}>
      {(Object.keys(LENKE_SILVA_CHECKLIST_LABELS) as (keyof LenkeSilvaChecklist)[]).map((key) => (
        <label key={key} style={checkboxLabelStyle}>
          <input
            type="checkbox"
            checked={checklist[key]}
            onChange={(e) => onChange({ lenkeSilvaChecklist: { ...checklist, [key]: e.target.checked } })}
          />
          {LENKE_SILVA_CHECKLIST_LABELS[key]}
        </label>
      ))}

      <label style={{ ...labelStyle, marginTop: 6 }}>
        Nivel elegido por el clínico
        <select
          style={selectStyle}
          value={clinicianSelectedLevel ?? ''}
          onChange={(e) => onChange({ lenkeSilvaClinicianLevel: e.target.value === '' ? null : (e.target.value as LenkeSilvaLevel) })}
        >
          <option value="">— sin elegir —</option>
          {LENKE_SILVA_LEVELS.map((level) => (
            <option key={level} value={level}>
              {level}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function OsteotomyReference(): JSX.Element {
  return (
    <details style={sectionStyle}>
      <summary style={{ cursor: 'pointer', fontSize: 12, color: '#8a8f98' }}>Referencia: Osteotomías (Schwab-Lenke, SPEC.md §9.10)</summary>
      <table style={{ width: '100%', marginTop: 6, fontSize: 12, color: '#c7cad1', borderCollapse: 'collapse' }}>
        <tbody>
          {OSTEOTOMY_REFERENCE_TABLE.map((entry) => (
            <tr key={entry.grade} style={{ borderTop: '1px solid #26282e' }}>
              <td style={{ padding: '3px 6px 3px 0', color: '#8a8f98' }}>{entry.grade}</td>
              <td style={{ padding: '3px 0' }}>{entry.name}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginTop: 6, fontSize: 12, color: '#8a8f98' }}>
        Modificador de abordaje: {Object.entries(APPROACH_MODIFIER_NAMES).map(([code, name]) => `${code} = ${name}`).join(', ')}.
      </div>
      <div style={{ marginTop: 4, fontSize: 12, color: '#fbbf24' }}>{APPROACH_MODIFIER_DISAMBIGUATION_NOTE}</div>
    </details>
  );
}
