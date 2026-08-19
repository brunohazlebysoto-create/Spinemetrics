/**
 * PUMC (Peking Union Medical College). SPEC.md §9.3. Por número de ápices:
 * I (única), II (doble), III (triple). `docs/OPEN_QUESTIONS.md` #26 (bordes
 * de 10° en IIb/IIc/IId, borderline 8–12°) y sección I punto 1 (subtipos y
 * cortes exactos pendientes de verificar en fuente primaria).
 */
import { DEFAULT_CONVENTIONS, type Conventions } from '../config/conventions';
import type { ClassificationResult, RadiographView, SpinalLevel, TraceStep } from '../models/types';
import { isSpinalLevelBetween } from '../models/spinalLevelOrder';
import { classifyCurveRegion } from './curveRegions';

export type PumcMainType = 'I' | 'II' | 'III';
export type PumcSubtype = 'Ia' | 'Ib' | 'Ic' | 'IIa' | 'IIb' | 'IIc' | 'IId' | null;

export interface PumcCurveInput {
  apexLevel: SpinalLevel;
  cobbDeg: number;
}

export interface PumcClassificationInput {
  view: RadiographView;
  /** Una entrada por curva estructural detectada (SPEC.md §9.3 clasifica
   * "por número de ápices"). */
  curves: PumcCurveInput[];
}

export interface PumcClassificationResult extends ClassificationResult {
  mainType: PumcMainType | null;
  subtype: PumcSubtype;
  /** `docs/OPEN_QUESTIONS.md` #26: true si la diferencia torácica−TL/L de
   * un tipo II está entre 8° y 12° (peor concordancia entre observadores). */
  pumcBorderline: boolean;
}

type PumcRegion = 'thoracic' | 'thoracolumbar' | 'lumbar' | null;

/**
 * Región PUMC de un ápice. Reutiliza los rangos PT/MT de Lenke (T3–T11)
 * como "torácica"; toracolumbar/lumbar es una subdivisión propia de PUMC
 * (T12–L1 vs. L2–L4) sin respaldo numérico exacto en la bibliografía citada
 * — ver sección I punto 1 de `docs/OPEN_QUESTIONS.md` (subtipos y cortes
 * exactos de PUMC pendientes de verificar en fuente primaria).
 */
function pumcRegion(apexLevel: SpinalLevel): PumcRegion {
  const lenkeRegion = classifyCurveRegion(apexLevel);
  if (lenkeRegion === 'PT' || lenkeRegion === 'MT') return 'thoracic';
  if (isSpinalLevelBetween(apexLevel, 'T12', 'L1')) return 'thoracolumbar';
  if (isSpinalLevelBetween(apexLevel, 'L2', 'L4')) return 'lumbar';
  return null;
}

function combinedTlLCobb(curve: PumcCurveInput): boolean {
  const region = pumcRegion(curve.apexLevel);
  return region === 'thoracolumbar' || region === 'lumbar';
}

export function classifyPUMC(
  input: PumcClassificationInput,
  conventions: Conventions = DEFAULT_CONVENTIONS,
): PumcClassificationResult {
  const trace: TraceStep[] = [];

  if (conventions.cobb.requireStandingForClassification && input.view !== 'PA_standing') {
    return {
      result: 'No clasificable: PUMC exige radiografía en bipedestación (PA_standing).',
      trace: [{ step: 'proyección', detail: `Proyección recibida: '${input.view}'.` }],
      unmetInputs: ['view'],
      mainType: null,
      subtype: null,
      pumcBorderline: false,
    };
  }

  const n = input.curves.length;
  trace.push({ step: 'número de ápices', detail: `${n} curva(s) estructural(es) detectada(s).` });

  if (n === 0) {
    return {
      result: 'No clasificable: sin curvas estructurales detectadas.',
      trace,
      unmetInputs: ['curves'],
      mainType: null,
      subtype: null,
      pumcBorderline: false,
    };
  }

  if (n === 1) {
    const region = pumcRegion(input.curves[0]!.apexLevel);
    const subtype: PumcSubtype = region === 'thoracic' ? 'Ia' : region === 'thoracolumbar' ? 'Ib' : region === 'lumbar' ? 'Ic' : null;
    trace.push({
      step: 'tipo I (única)',
      detail: `Ápex en ${input.curves[0]!.apexLevel} → región '${region ?? 'no reconocida'}'.`,
    });
    return {
      result: subtype ? `PUMC ${subtype}` : 'PUMC I (subtipo indeterminado: ápex fuera de los rangos reconocidos)',
      trace,
      ...(subtype ? {} : { unmetInputs: ['pumcSubtypeApexOutOfRange'] }),
      mainType: 'I',
      subtype,
      pumcBorderline: false,
    };
  }

  if (n === 2) {
    const [a, b] = input.curves as [PumcCurveInput, PumcCurveInput];
    const regionA = pumcRegion(a.apexLevel);
    const regionB = pumcRegion(b.apexLevel);

    if (regionA === 'thoracic' && regionB === 'thoracic') {
      trace.push({ step: 'tipo IIa', detail: 'Dos ápices torácicos: doble torácica.' });
      return { result: 'PUMC IIa', trace, mainType: 'II', subtype: 'IIa', pumcBorderline: false };
    }

    const thoracicCurve = regionA === 'thoracic' ? a : regionB === 'thoracic' ? b : null;
    const tlCurve = combinedTlLCobb(a) ? a : combinedTlLCobb(b) ? b : null;
    if (!thoracicCurve || !tlCurve || thoracicCurve === tlCurve) {
      trace.push({ step: 'tipo II sin subtipo', detail: 'Ninguna de las dos curvas es reconociblemente torácica y toracolumbar/lumbar a la vez.' });
      return {
        result: 'PUMC II (subtipo indeterminado: regiones de ápice atípicas)',
        trace,
        unmetInputs: ['pumcSubtypeApexOutOfRange'],
        mainType: 'II',
        subtype: null,
        pumcBorderline: false,
      };
    }

    const diff = thoracicCurve.cobbDeg - tlCurve.cobbDeg;
    const pumcBorderline = Math.abs(diff) >= 8 && Math.abs(diff) <= 12;
    trace.push({
      step: 'tipo II, torácica vs TL/L',
      detail: `Torácica ${thoracicCurve.cobbDeg.toFixed(1)}° − TL/L ${tlCurve.cobbDeg.toFixed(1)}° = ${diff.toFixed(1)}° (docs/OPEN_QUESTIONS.md #26).`,
      value: diff,
    });
    let subtype: PumcSubtype;
    if (diff >= 10) subtype = 'IIb';
    else if (diff <= -10) subtype = 'IId';
    else subtype = 'IIc';

    return {
      result: `PUMC ${subtype}${pumcBorderline ? ' (borderline)' : ''}`,
      trace,
      mainType: 'II',
      subtype,
      pumcBorderline,
    };
  }

  // n >= 3: SPEC.md §9.3 sólo nombra "IIIa, IIIb" sin definir el criterio de
  // corte entre ambos — no fabricar una distinción no publicada (ver
  // docs/OPEN_QUESTIONS.md, sección I, punto 1).
  trace.push({
    step: 'tipo III (triple)',
    detail: `${n} ápices. SPEC.md §9.3 no define el criterio IIIa vs IIIb (docs/OPEN_QUESTIONS.md, sección I, punto 1): no se distingue.`,
  });
  return {
    result: 'PUMC III (subtipo IIIa/IIIb no diferenciado: criterio no publicado en SPEC.md)',
    trace,
    unmetInputs: ['pumcSubtypeIIIaVsIIIb'],
    mainType: 'III',
    subtype: null,
    pumcBorderline: false,
  };
}
