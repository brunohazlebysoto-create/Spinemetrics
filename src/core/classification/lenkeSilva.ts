/**
 * Lenke-Silva (degenerativa del adulto). SPEC.md §9.9. "Seis niveles
 * crecientes de tratamiento... Árbol de decisión guiado con casillas, **no
 * cálculo automático**."
 *
 * A diferencia de todos los demás clasificadores de `core/classification`,
 * esta función NUNCA deriva el nivel I–VI a partir de la lista de
 * comprobación: SPEC.md lo prohíbe explícitamente. Sólo registra qué
 * criterios están marcados y el nivel que el clínico elige tras revisarlos,
 * para trazabilidad — el mismo patrón que Nash-Moe en
 * `core/measurements/rotation.ts` (nunca se convierte a un valor derivado).
 */
import type { ClassificationResult, TraceStep } from '../models/types';

export type LenkeSilvaLevel = 'I' | 'II' | 'III' | 'IV' | 'V' | 'VI';

/** SPEC.md §9.9: los seis criterios que informan la decisión (no un cálculo
 * de umbral automatizado): "osteofitos anteriores, subluxación >2 mm,
 * magnitud de la curva (~30°/45°), cifosis lumbar, desbalance global y
 * corrección <30 % en bending." */
export interface LenkeSilvaChecklist {
  anteriorOsteophytes: boolean;
  subluxationOver2mm: boolean;
  curveMagnitudeAbove30Or45Deg: boolean;
  lumbarKyphosis: boolean;
  globalImbalance: boolean;
  bendingCorrectionBelow30Percent: boolean;
}

export interface LenkeSilvaInput {
  checklist: LenkeSilvaChecklist;
  /** Nivel elegido por el clínico tras revisar `checklist`. `null` si aún
   * no se ha decidido. */
  clinicianSelectedLevel: LenkeSilvaLevel | null;
}

export interface LenkeSilvaResult extends ClassificationResult {
  level: LenkeSilvaLevel | null;
  checklist: LenkeSilvaChecklist;
}

/**
 * SPEC.md §9.9 sólo nombra explícitamente los dos extremos ("I
 * descompresión sola → VI osteotomías"); los niveles intermedios (II–V) no
 * tienen una descripción publicada en SPEC.md, así que no se fabrica una
 * aquí — quedan como nivel ordinal sin nombre clínico inventado.
 */
const LEVEL_NAMES: Record<LenkeSilvaLevel, string> = {
  I: 'Descompresión sola',
  II: 'Nivel II',
  III: 'Nivel III',
  IV: 'Nivel IV',
  V: 'Nivel V',
  VI: 'Osteotomías',
};

const CHECKLIST_LABELS: Record<keyof LenkeSilvaChecklist, string> = {
  anteriorOsteophytes: 'Osteofitos anteriores',
  subluxationOver2mm: 'Subluxación >2 mm',
  curveMagnitudeAbove30Or45Deg: 'Magnitud de la curva ~30°/45°',
  lumbarKyphosis: 'Cifosis lumbar',
  globalImbalance: 'Desbalance global',
  bendingCorrectionBelow30Percent: 'Corrección <30 % en bending',
};

export function evaluateLenkeSilva(input: LenkeSilvaInput): LenkeSilvaResult {
  const trace: TraceStep[] = [
    {
      step: 'árbol guiado',
      detail: 'SPEC.md §9.9: árbol de decisión guiado con casillas, no cálculo automático. El nivel lo elige el clínico.',
    },
  ];
  const unmetInputs: string[] = [];

  for (const key of Object.keys(CHECKLIST_LABELS) as (keyof LenkeSilvaChecklist)[]) {
    trace.push({ step: CHECKLIST_LABELS[key], detail: input.checklist[key] ? 'marcado' : 'no marcado' });
  }

  if (input.clinicianSelectedLevel === null) {
    unmetInputs.push('clinicianSelectedLevel');
    return {
      result: 'Lenke-Silva: pendiente de selección del clínico (no se calcula automáticamente).',
      trace,
      unmetInputs,
      level: null,
      checklist: input.checklist,
    };
  }

  trace.push({
    step: 'nivel seleccionado',
    detail: `${input.clinicianSelectedLevel}: ${LEVEL_NAMES[input.clinicianSelectedLevel]} (elegido por el clínico).`,
  });

  return {
    result: `Lenke-Silva ${input.clinicianSelectedLevel} — ${LEVEL_NAMES[input.clinicianSelectedLevel]}`,
    trace,
    level: input.clinicianSelectedLevel,
    checklist: input.checklist,
  };
}
