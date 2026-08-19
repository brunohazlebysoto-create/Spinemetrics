/**
 * Clasificación de Lenke (AIS). SPEC.md §9.1 — clasificador principal.
 * `docs/OPEN_QUESTIONS.md` #5, #6, #7, #8, #9, #10, #11, #12, #13, #43, #44.
 *
 * Recibe valores ya medidos (números), no anotaciones crudas: ensamblar esos
 * valores desde las radiografías correctas (bipedestación + bendings +
 * lateral) es responsabilidad de quien orquesta la clasificación
 * (`src/pipeline/` o la UI), no de este módulo — igual que
 * `measurePiLlMismatch` en `core/measurements/pelvic.ts` recibe PI y LL ya
 * medidos en vez de anotaciones.
 */
import { DEFAULT_CONVENTIONS, type Conventions } from '../config/conventions';
import { CLINICAL } from '../constants';
import { assessCurveStructurality } from '../measurements/flexibility';
import type { ClassificationResult, RadiographView, TraceStep } from '../models/types';
import type { CurveRegion } from './curveRegions';
import type { LumbarModifier, LumbarModifierResult } from './lumbarModifier';

export type LenkeCurveType = 1 | 2 | 3 | 4 | 5 | 6;
export type LenkeSagittalModifier = '-' | 'N' | '+';

export interface LenkeRegionInput {
  /** Cobb en bipedestación para esta región, o `null` si no hay curva
   * detectada en esta región. */
  standingCobbDeg: number | null;
  /** Cobb de la MISMA curva (mismas vértebras terminales) sobre la
   * radiografía de flexibilidad, o `null` si no se midió. */
  bendingCobbDeg: number | null;
  /** Cifosis del segmento correspondiente (§9.1 Paso 3: T2–T5 para PT,
   * T10–L2 para MT/TL_L — `docs/OPEN_QUESTIONS.md` #13), o `null`. */
  sagittalKyphosisDeg: number | null;
}

export interface LenkeClassificationInput {
  view: RadiographView;
  regions: Record<CurveRegion, LenkeRegionInput>;
  /** `docs/OPEN_QUESTIONS.md` #7 ★★: true si el Cobb de flexibilidad usado
   * proviene de fulcrum o tracción en vez de bending supino. */
  nonStandardFlexibilityFilm: boolean;
  /** SPEC.md §9.1 Paso 6: cifosis T5–T12. */
  sagittalT5T12Deg: number | null;
  /** Resultado ya calculado por `lumbarModifier.ts` (geometría CSVL vs.
   * ápex lumbar). Se sobrescribe a 'C' para los tipos 5 y 6 (por
   * definición, SPEC.md §9.1 Paso 5). */
  lumbarModifier: LumbarModifierResult;
}

export interface LenkeCurveDetail {
  region: CurveRegion;
  standingCobbDeg: number | null;
  isMajor: boolean;
  structural: boolean | null;
}

export interface LenkeClassificationResult extends ClassificationResult {
  curveType: LenkeCurveType | null;
  majorRegion: CurveRegion | null;
  lumbarModifier: LumbarModifier | null;
  sagittalModifier: LenkeSagittalModifier | null;
  borderlineBC: boolean;
  /** `docs/OPEN_QUESTIONS.md` #10: TL/L mayor que MT mostrar pero por menos
   * de `type6MinDifferenceDeg` → se clasifica como tipo 3, no 6. */
  type3vs6Borderline: boolean;
  nonStandardFlexibilityFilm: boolean;
  curves: LenkeCurveDetail[];
}

function structuralKyphosisThreshold(region: CurveRegion): number {
  return region === 'PT' ? CLINICAL.STRUCTURAL_KYPHOSIS_PT_DEG : CLINICAL.STRUCTURAL_KYPHOSIS_MT_TL_DEG;
}

interface RegionAssessment {
  structural: boolean | null;
  trace: TraceStep[];
  unmetInputs: string[];
}

/**
 * SPEC.md §9.1 Paso 3: una curva menor es estructural si **cualquiera** de
 * los dos criterios (coronal por bending, sagital por cifosis) lo indica —
 * es un OR, no ambos a la vez. Si un criterio falta pero el otro decide, se
 * calcula igualmente y se anota el hueco (SPEC.md §9: "sin bloqueos... nota
 * discreta"); sólo si **ambos** faltan queda indeterminada.
 */
function assessRegionStructurality(
  region: CurveRegion,
  input: LenkeRegionInput,
  isMajor: boolean,
  conventions: Conventions,
): RegionAssessment {
  if (isMajor) {
    return {
      structural: true,
      trace: [{ step: `estructuralidad ${region}`, detail: 'Curva mayor: estructural por definición (SPEC.md §9.1 Paso 2).' }],
      unmetInputs: [],
    };
  }

  const trace: TraceStep[] = [];
  const unmetInputs: string[] = [];

  let coronal: boolean | null = null;
  if (input.bendingCobbDeg !== null) {
    const assessment = assessCurveStructurality(input.bendingCobbDeg, conventions);
    coronal = assessment.structural;
    trace.push(...assessment.trace);
  } else {
    unmetInputs.push(`bendingCobb:${region}`);
  }

  let sagittal: boolean | null = null;
  if (input.sagittalKyphosisDeg !== null) {
    const threshold = structuralKyphosisThreshold(region);
    sagittal = conventions.lenke.structuralThresholdsInclusive
      ? input.sagittalKyphosisDeg >= threshold
      : input.sagittalKyphosisDeg > threshold;
    trace.push({
      step: `estructuralidad ${region} (sagital)`,
      detail: `Cifosis ${input.sagittalKyphosisDeg.toFixed(1)}° ${sagittal ? '≥' : '<'} ${threshold}° → ${sagittal ? 'estructural' : 'no estructural'} (docs/OPEN_QUESTIONS.md #6, #13).`,
      value: input.sagittalKyphosisDeg,
    });
  } else {
    unmetInputs.push(`sagittalKyphosis:${region}`);
  }

  if (coronal === null && sagittal === null) {
    return { structural: null, trace, unmetInputs };
  }

  const structural = coronal === true || sagittal === true;
  trace.push({
    step: `estructuralidad ${region}`,
    detail: `${structural ? 'Estructural' : 'No estructural'} (criterio coronal OR sagital; SPEC.md §9.1 Paso 3).`,
  });
  return { structural, trace, unmetInputs };
}

interface MajorSelection {
  majorRegion: CurveRegion | null;
  type3vs6Borderline: boolean;
  trace: TraceStep[];
  unmetInputs: string[];
}

/**
 * SPEC.md §9.1 Paso 2 ("curva mayor = la de mayor Cobb") con la excepción
 * de `docs/OPEN_QUESTIONS.md` #10: entre MT y TL_L, si TL_L es mayor pero
 * por menos de `type6MinDifferenceDeg`, se conserva MT como mayor (tipo 3
 * en vez de 6) para evitar que el tipo cambie por ruido de medición.
 */
function selectMajorRegion(
  regions: Record<CurveRegion, LenkeRegionInput>,
  conventions: Conventions,
): MajorSelection {
  const trace: TraceStep[] = [];
  const present = (Object.keys(regions) as CurveRegion[]).filter((r) => regions[r].standingCobbDeg !== null);

  if (present.length === 0) {
    return {
      majorRegion: null,
      type3vs6Borderline: false,
      trace: [{ step: 'curva mayor', detail: 'Ninguna región con Cobb en bipedestación: no hay curva mayor que determinar.' }],
      unmetInputs: ['standingCobb'],
    };
  }

  let major = present[0]!;
  for (const region of present.slice(1)) {
    if (regions[region].standingCobbDeg! > regions[major].standingCobbDeg!) major = region;
  }
  trace.push({
    step: 'curva mayor (por Cobb)',
    detail: `${major}: ${regions[major].standingCobbDeg!.toFixed(1)}° es el mayor Cobb entre las regiones presentes.`,
  });

  let type3vs6Borderline = false;
  const mt = regions.MT.standingCobbDeg;
  const tll = regions.TL_L.standingCobbDeg;
  if (major === 'TL_L' && mt !== null && tll !== null) {
    const diff = tll - mt;
    if (diff < conventions.lenke.type6MinDifferenceDeg) {
      type3vs6Borderline = true;
      major = 'MT';
      trace.push({
        step: 'tipo 3 vs 6 (docs/OPEN_QUESTIONS.md #10)',
        detail:
          `TL_L (${tll.toFixed(1)}°) > MT (${mt.toFixed(1)}°) pero por menos de ` +
          `${conventions.lenke.type6MinDifferenceDeg}°: se conserva MT como mayor (tipo 3, no 6).`,
      });
    }
  }

  if (major === 'PT') {
    return {
      majorRegion: null,
      type3vs6Borderline: false,
      trace: [
        ...trace,
        {
          step: 'curva mayor atípica',
          detail: 'La región PT tiene el mayor Cobb; ninguno de los 6 tipos de Lenke define una curva mayor en PT.',
        },
      ],
      unmetInputs: ['majorCurveNotThoracicOrLumbar'],
    };
  }

  return { majorRegion: major, type3vs6Borderline, trace, unmetInputs: [] };
}

const CURVE_TYPE_DESCRIPTIONS: Record<LenkeCurveType, string> = {
  1: 'Torácica principal',
  2: 'Doble torácica',
  3: 'Doble mayor',
  4: 'Triple mayor',
  5: 'Toracolumbar/lumbar',
  6: 'TL/L – torácica principal',
};

/** SPEC.md §9.1 Paso 4: tabla de tipos. `pt`/`mt`/`tl` son `true` cuando esa
 * región es estructural (para PT) o mayor-o-estructural (para MT/TL_L); una
 * región ausente cuenta como no estructural. */
function matchCurveType(
  majorRegion: CurveRegion,
  ptStructural: boolean,
  mtStructural: boolean,
  tlStructural: boolean,
): LenkeCurveType | null {
  if (majorRegion === 'MT') {
    if (!ptStructural && !tlStructural) return 1;
    if (ptStructural && !tlStructural) return 2;
    if (!ptStructural && tlStructural) return 3;
    if (ptStructural && tlStructural) return 4;
  }
  if (majorRegion === 'TL_L') {
    if (!ptStructural && !mtStructural) return 5;
    if (!ptStructural && mtStructural) return 6;
    if (ptStructural && mtStructural) return 4; // SPEC.md §9.1 nota #11: TL_L también puede ser la mayor del tipo 4.
    // ptStructural && !mtStructural con TL_L mayor: patrón no cubierto por
    // ninguno de los 6 tipos publicados (nunca fabricar un tipo).
  }
  return null;
}

/** SPEC.md §9.1 Paso 6: modificador sagital T5–T12. `docs/OPEN_QUESTIONS.md`
 * #12 ★: N cubre [10,40] cerrado por defecto. */
function determineSagittalModifier(
  sagittalT5T12Deg: number | null,
  conventions: Conventions,
): { modifier: LenkeSagittalModifier | null; trace: TraceStep[] } {
  if (sagittalT5T12Deg === null) {
    return { modifier: null, trace: [{ step: 'modificador sagital', detail: 'Sin cifosis T5–T12: no se puede determinar.' }] };
  }
  const { hypo, hyper } = CLINICAL.LENKE_SAGITTAL;
  const inclusive = conventions.lenke.sagittalModifierNInclusiveBounds;
  let modifier: LenkeSagittalModifier;
  if (sagittalT5T12Deg < hypo || (!inclusive && sagittalT5T12Deg === hypo)) modifier = '-';
  else if (sagittalT5T12Deg > hyper || (!inclusive && sagittalT5T12Deg === hyper)) modifier = '+';
  else modifier = 'N';
  return {
    modifier,
    trace: [
      {
        step: 'modificador sagital T5–T12',
        detail: `${sagittalT5T12Deg.toFixed(1)}° → '${modifier}' (docs/OPEN_QUESTIONS.md #12, N = [${hypo},${hyper}] cerrado).`,
        value: sagittalT5T12Deg,
      },
    ],
  };
}

/**
 * SPEC.md §9.1. Salida `Lenke <tipo><modificador lumbar> <modificador
 * sagital>`, p. ej. `Lenke 1B N`.
 */
export function classifyLenke(
  input: LenkeClassificationInput,
  conventions: Conventions = DEFAULT_CONVENTIONS,
): LenkeClassificationResult {
  const trace: TraceStep[] = [];
  const unmetInputs: string[] = [];

  // docs/OPEN_QUESTIONS.md #5: bloquear si la proyección no es de pie.
  if (conventions.cobb.requireStandingForClassification && input.view !== 'PA_standing') {
    return {
      result: 'No clasificable: la clasificación de Lenke exige radiografía en bipedestación (PA_standing).',
      trace: [
        { step: 'proyección', detail: `Proyección recibida: '${input.view}' (docs/OPEN_QUESTIONS.md #5).` },
      ],
      unmetInputs: ['view'],
      curveType: null,
      majorRegion: null,
      lumbarModifier: null,
      sagittalModifier: null,
      borderlineBC: false,
      type3vs6Borderline: false,
      nonStandardFlexibilityFilm: input.nonStandardFlexibilityFilm,
      curves: [],
    };
  }

  const majorSelection = selectMajorRegion(input.regions, conventions);
  trace.push(...majorSelection.trace);
  unmetInputs.push(...majorSelection.unmetInputs);

  const curves: LenkeCurveDetail[] = [];
  const structuralByRegion: Partial<Record<CurveRegion, boolean | null>> = {};
  for (const region of ['PT', 'MT', 'TL_L'] as CurveRegion[]) {
    const regionInput = input.regions[region];
    if (regionInput.standingCobbDeg === null) {
      curves.push({ region, standingCobbDeg: null, isMajor: false, structural: null });
      continue;
    }
    const isMajor = region === majorSelection.majorRegion;
    const assessment = assessRegionStructurality(region, regionInput, isMajor, conventions);
    trace.push(...assessment.trace);
    unmetInputs.push(...assessment.unmetInputs);
    structuralByRegion[region] = assessment.structural;
    curves.push({ region, standingCobbDeg: regionInput.standingCobbDeg, isMajor, structural: assessment.structural });
  }

  const sagittalResult = determineSagittalModifier(input.sagittalT5T12Deg, conventions);
  trace.push(...sagittalResult.trace);
  if (sagittalResult.modifier === null) unmetInputs.push('sagittalT5T12');

  let curveType: LenkeCurveType | null = null;
  if (majorSelection.majorRegion) {
    const ptS = structuralByRegion.PT;
    const mtS = structuralByRegion.MT;
    const tlS = structuralByRegion.TL_L;
    if (ptS === null || mtS === null || tlS === null) {
      trace.push({
        step: 'tipo de curva',
        detail: 'No se puede determinar el tipo: falta la estructuralidad de al menos una región (coronal y sagital ambos ausentes).',
      });
    } else {
      curveType = matchCurveType(majorSelection.majorRegion, ptS ?? false, mtS ?? false, tlS ?? false);
      if (curveType === null) {
        unmetInputs.push('curveTypePattern');
        trace.push({ step: 'tipo de curva', detail: 'La combinación de estructuralidad no coincide con ninguno de los 6 tipos publicados.' });
      } else {
        trace.push({ step: 'tipo de curva', detail: `Lenke tipo ${curveType} (${CURVE_TYPE_DESCRIPTIONS[curveType]}).` });
      }
    }
  }

  // SPEC.md §9.1 Paso 5: "Los tipos 5 y 6 son por definición C."
  let lumbarModifier: LumbarModifier | null = input.lumbarModifier.modifier;
  let borderlineBC = input.lumbarModifier.borderlineBC;
  if (curveType === 5 || curveType === 6) {
    if (lumbarModifier !== 'C') {
      trace.push({
        step: 'modificador lumbar (override)',
        detail: `Tipo ${curveType}: modificador lumbar forzado a C por definición (SPEC.md §9.1 Paso 5), geometría había dado '${lumbarModifier ?? 'n/d'}'.`,
      });
    }
    lumbarModifier = 'C';
    borderlineBC = false;
  } else if (lumbarModifier === null) {
    unmetInputs.push('lumbarModifier');
  }

  if (input.nonStandardFlexibilityFilm) {
    trace.push({
      step: 'radiografía de flexibilidad no estándar',
      detail: 'docs/OPEN_QUESTIONS.md #7 ★★: Cobb de flexibilidad calculado con fulcrum/tracción, no bending supino. Mostrar en rojo en el informe.',
    });
  }

  const resultParts: string[] = [];
  if (curveType !== null) resultParts.push(`Lenke ${curveType}${lumbarModifier ?? '?'}`);
  else resultParts.push('Lenke: tipo no determinable con los datos disponibles');
  if (sagittalResult.modifier !== null) resultParts.push(sagittalResult.modifier);

  return {
    result: resultParts.join(' '),
    trace,
    ...(unmetInputs.length > 0 ? { unmetInputs } : {}),
    curveType,
    majorRegion: majorSelection.majorRegion,
    lumbarModifier,
    sagittalModifier: sagittalResult.modifier,
    borderlineBC,
    type3vs6Borderline: majorSelection.type3vs6Borderline,
    nonStandardFlexibilityFilm: input.nonStandardFlexibilityFilm,
    curves,
  };
}
