/**
 * Roussouly. SPEC.md §9.8. `docs/OPEN_QUESTIONS.md` #19 ★: cortes de SS
 * (35°, 45°) y definición del subtipo 3-AP no están fijados de forma
 * uniforme en la literatura — sección I punto 2. **Marcar siempre como
 * orientativo, no como dato duro** (regla explícita de SPEC.md §9.8).
 */
import type { ClassificationResult, TraceStep } from '../models/types';

export type RoussoulyType = 1 | 2 | 3 | 4 | '3-AP';

const ORIENTATIVE_NOTE =
  'Resultado orientativo: los cortes numéricos de Roussouly no están fijados de forma uniforme en la ' +
  'literatura (SPEC.md §9.8, docs/OPEN_QUESTIONS.md #19).';

export interface RoussoulyClassificationInput {
  sacralSlopeDeg: number | null;
  pelvicIncidenceDeg: number | null;
  /**
   * Distingue el tipo 1 (lordosis corta e hiperlordótica) del tipo 2
   * (espalda plana) cuando SS <35° — SPEC.md no publica un umbral numérico
   * de lordosis lumbar para esta distinción (sección I punto 2), así que es
   * un hallazgo explícito, no un corte inventado. `null` si no se evaluó.
   */
  hyperlordotic: boolean | null;
  /**
   * Pelvis antevertida (subtipo 3-AP). SPEC.md/`docs/OPEN_QUESTIONS.md` #19
   * describen "PI baja con SS alta" sin cifras exactas — hallazgo
   * explícito, no un corte inventado.
   */
  anteverted: boolean | null;
}

export interface RoussoulyClassificationResult extends ClassificationResult {
  type: RoussoulyType | null;
}

export function classifyRoussouly(input: RoussoulyClassificationInput): RoussoulyClassificationResult {
  const trace: TraceStep[] = [{ step: 'nota', detail: ORIENTATIVE_NOTE }];
  const unmetInputs: string[] = [];

  if (input.sacralSlopeDeg === null) {
    return {
      result: 'No clasificable: sin sacral slope (SS).',
      trace,
      unmetInputs: ['sacralSlope'],
      type: null,
    };
  }

  if (input.anteverted === true) {
    trace.push({ step: 'tipo 3-AP', detail: 'Pelvis antevertida (docs/OPEN_QUESTIONS.md #19): 3-AP.' });
    return { result: 'Roussouly 3-AP (orientativo)', trace, type: '3-AP' };
  }
  if (input.anteverted === null && input.pelvicIncidenceDeg !== null) {
    unmetInputs.push('anteverted');
  }

  const ss = input.sacralSlopeDeg;
  trace.push({ step: 'sacral slope', detail: `${ss.toFixed(1)}°.`, value: ss });

  let type: RoussoulyType;
  if (ss < 35) {
    if (input.hyperlordotic === null) {
      unmetInputs.push('hyperlordotic');
      return {
        result: 'No clasificable entre tipo 1 y 2: SS <35° exige distinguir lordosis hiper/plana (docs/OPEN_QUESTIONS.md #19).',
        trace,
        unmetInputs,
        type: null,
      };
    }
    type = input.hyperlordotic ? 1 : 2;
    trace.push({ step: 'tipo 1 vs 2', detail: `SS <35°, ${input.hyperlordotic ? 'lordosis corta e hiperlordótica' : 'espalda plana'} → tipo ${type}.` });
  } else if (ss <= 45) {
    type = 3;
    trace.push({ step: 'tipo 3', detail: 'SS 35–45°.' });
  } else {
    type = 4;
    trace.push({ step: 'tipo 4', detail: 'SS >45°.' });
  }

  return {
    result: `Roussouly ${type} (orientativo)`,
    trace,
    ...(unmetInputs.length > 0 ? { unmetInputs } : {}),
    type,
  };
}
