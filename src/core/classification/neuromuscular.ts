/**
 * Neuromuscular. SPEC.md §9.7. Etiología SRS (neuropática/miopática),
 * Lonstein-Akbarnia (grupos I/II) y modificador GMFCS.
 * `docs/OPEN_QUESTIONS.md` #45: "oblicuidad pélvica significativa" no tiene
 * un umbral numérico publicado en SPEC.md — se recibe como hallazgo
 * explícito, nunca derivado de un corte inventado.
 */
import type { ClassificationResult, TraceStep } from '../models/types';

export type NeuromuscularEtiologyClass =
  | 'neuropathicUpperMotorNeuron'
  | 'neuropathicLowerMotorNeuron'
  | 'myopathic';

export type LonsteinAkbarniaGroup = 'IA' | 'IB' | 'II';

const ETIOLOGY_LABELS: Record<NeuromuscularEtiologyClass, string> = {
  neuropathicUpperMotorNeuron: 'Neuropática, neurona motora superior (parálisis cerebral, degeneración espinocerebelosa, siringomielia, lesión medular)',
  neuropathicLowerMotorNeuron: 'Neuropática, neurona motora inferior (poliomielitis, atrofia muscular espinal, mielomeningocele)',
  myopathic: 'Miopática (artrogriposis, distrofias musculares, distrofia miotónica, hipotonía congénita)',
};

export interface NeuromuscularClassificationInput {
  etiologyClass: NeuromuscularEtiologyClass | null;
  /** Tronco compensado (true) o descompensado (false). Hallazgo clínico
   * explícito, no derivado de un umbral geométrico no publicado. */
  trunkBalanced: boolean | null;
  /** `docs/OPEN_QUESTIONS.md` #45: sin umbral numérico publicado. */
  pelvicObliquitySignificant: boolean | null;
  /** Sólo relevante si `trunkBalanced === true`: distingue IA (doble curva
   * balanceada) de IB (torácica mayor con lumbar fraccional pequeña). */
  doubleBalancedCurve: boolean | null;
  gmfcs: 1 | 2 | 3 | 4 | 5 | null;
}

export interface NeuromuscularClassificationResult extends ClassificationResult {
  etiologyLabel: string | null;
  lonsteinAkbarniaGroup: LonsteinAkbarniaGroup | null;
  gmfcs: 1 | 2 | 3 | 4 | 5 | null;
  /** SPEC.md §9.7: "los niveles IV–V concentran la mayor gravedad." */
  highSeverityGmfcs: boolean;
  /** SPEC.md §9.7: "indicación clave de extender la fusión a la pelvis." */
  pelvicFusionIndicated: boolean;
}

export function classifyNeuromuscular(input: NeuromuscularClassificationInput): NeuromuscularClassificationResult {
  const trace: TraceStep[] = [];
  const unmetInputs: string[] = [];

  const etiologyLabel = input.etiologyClass ? ETIOLOGY_LABELS[input.etiologyClass] : null;
  if (etiologyLabel) trace.push({ step: 'etiología SRS', detail: etiologyLabel });
  else unmetInputs.push('etiologyClass');

  let group: LonsteinAkbarniaGroup | null = null;
  if (input.trunkBalanced === true) {
    if (input.doubleBalancedCurve === true) {
      group = 'IA';
      trace.push({ step: 'grupo', detail: 'IA: tronco compensado, doble curva balanceada.' });
    } else if (input.doubleBalancedCurve === false) {
      group = 'IB';
      trace.push({ step: 'grupo', detail: 'IB: tronco compensado, torácica mayor con lumbar fraccional pequeña.' });
    } else {
      unmetInputs.push('doubleBalancedCurve');
    }
  } else if (input.trunkBalanced === false) {
    if (input.pelvicObliquitySignificant === true) {
      group = 'II';
      trace.push({ step: 'grupo', detail: 'II: tronco descompensado con oblicuidad pélvica significativa.' });
    } else {
      unmetInputs.push('pelvicObliquitySignificant');
    }
  } else {
    unmetInputs.push('trunkBalanced');
  }

  const highSeverityGmfcs = input.gmfcs === 4 || input.gmfcs === 5;
  if (input.gmfcs !== null) {
    trace.push({
      step: 'GMFCS',
      detail: `Nivel ${input.gmfcs}${highSeverityGmfcs ? ' (IV–V: mayor gravedad, SPEC.md §9.7)' : ''}.`,
    });
  } else {
    unmetInputs.push('gmfcs');
  }

  const pelvicFusionIndicated = input.pelvicObliquitySignificant === true;
  if (pelvicFusionIndicated) {
    trace.push({
      step: 'indicación de fusión pélvica',
      detail: 'Oblicuidad pélvica significativa: indicación clave de extender la fusión a la pelvis (SPEC.md §9.7).',
    });
  }

  const resultParts = [etiologyLabel ? etiologyLabel.split(',')[0]! : '?', group ?? '?'];
  if (input.gmfcs !== null) resultParts.push(`GMFCS ${input.gmfcs}`);

  return {
    result: resultParts.join(', '),
    trace,
    ...(unmetInputs.length > 0 ? { unmetInputs } : {}),
    etiologyLabel,
    lonsteinAkbarniaGroup: group,
    gmfcs: input.gmfcs,
    highSeverityGmfcs,
    pelvicFusionIndicated,
  };
}
