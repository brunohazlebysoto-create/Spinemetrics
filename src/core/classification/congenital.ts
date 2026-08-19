/**
 * Congénita — Winter/McMaster. SPEC.md §9.6. A diferencia de los demás
 * clasificadores, esto no se deriva de mediciones angulares: describe el
 * tipo de anomalía vertebral (fallo de formación / segmentación), un
 * hallazgo morfológico que el modelo de landmarks actual no captura — entra
 * como hallazgo explícito del clínico, no calculado.
 */
import type { ClassificationResult, TraceStep } from '../models/types';

export type FormationFailure =
  | { kind: 'partialWedge' }
  | { kind: 'completeHemivertebra'; subtype: 'fullySegmented' | 'semisegmented' | 'nonsegmentedOrIncarcerated'; side: 'left' | 'right' };

export type SegmentationFailure =
  | { kind: 'unilateralBar'; side: 'left' | 'right' }
  | { kind: 'bilateralBlockVertebra' };

export type CongenitalMainType = 'I' | 'II' | 'III';

export interface CongenitalClassificationInput {
  formationFailure: FormationFailure | null;
  segmentationFailure: SegmentationFailure | null;
}

export interface CongenitalClassificationResult extends ClassificationResult {
  mainType: CongenitalMainType | null;
  /** SPEC.md §9.6: "Alerta destacada obligatoria: barra unilateral no
   * segmentada con hemivértebra contralateral... patrón de progresión más
   * rápida... suele requerir artrodesis profiláctica precoz." La única
   * alerta prominente que la aplicación debe mostrar en pantalla. */
  rapidProgressionAlert: boolean;
}

const RAPID_PROGRESSION_ALERT_TEXT =
  'Barra unilateral no segmentada con hemivértebra contralateral: patrón de progresión más rápida, ' +
  'suele requerir artrodesis profiláctica precoz (SPEC.md §9.6).';

export function classifyCongenital(input: CongenitalClassificationInput): CongenitalClassificationResult {
  const trace: TraceStep[] = [];
  const unmetInputs: string[] = [];

  if (!input.formationFailure && !input.segmentationFailure) {
    return {
      result: 'No clasificable: sin hallazgo de fallo de formación ni de segmentación registrado.',
      trace,
      unmetInputs: ['formationFailure', 'segmentationFailure'],
      mainType: null,
      rapidProgressionAlert: false,
    };
  }

  let mainType: CongenitalMainType;
  if (input.formationFailure && input.segmentationFailure) {
    mainType = 'III';
    trace.push({ step: 'tipo', detail: 'III (mixto): fallo de formación y de segmentación presentes a la vez.' });
  } else if (input.formationFailure) {
    mainType = 'I';
    const detail =
      input.formationFailure.kind === 'partialWedge'
        ? 'I (fallo de formación, parcial): vértebra en cuña.'
        : `I (fallo de formación, completo): hemivértebra ${input.formationFailure.subtype}, lado ${input.formationFailure.side}.`;
    trace.push({ step: 'tipo', detail });
  } else {
    mainType = 'II';
    const detail =
      input.segmentationFailure!.kind === 'unilateralBar'
        ? `II (fallo de segmentación, unilateral): barra no segmentada, lado ${input.segmentationFailure!.side}.`
        : 'II (fallo de segmentación, bilateral): vértebra en bloque.';
    trace.push({ step: 'tipo', detail });
  }

  const rapidProgressionAlert =
    input.formationFailure?.kind === 'completeHemivertebra' &&
    input.segmentationFailure?.kind === 'unilateralBar' &&
    input.formationFailure.side !== input.segmentationFailure.side;

  if (rapidProgressionAlert) {
    trace.push({ step: 'ALERTA', detail: RAPID_PROGRESSION_ALERT_TEXT });
  }

  return {
    result: `Winter/McMaster ${mainType}${rapidProgressionAlert ? ' — ' + RAPID_PROGRESSION_ALERT_TEXT : ''}`,
    trace,
    ...(unmetInputs.length > 0 ? { unmetInputs } : {}),
    mainType,
    rapidProgressionAlert,
  };
}
