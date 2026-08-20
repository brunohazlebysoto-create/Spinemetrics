/**
 * Puente entre las radiografías de un `Study` y `core/classification`.
 * SPEC.md §9: "Cada clasificador... Si falta un dato, no adivinar: devolver
 * `unmetInputs`... La clasificación se muestra igualmente cuando es
 * calculable, con una nota discreta sobre lo que falta." Mismo patrón que
 * `measurementEngine.ts`: puro, sin DOM/Zustand, sólo orquesta.
 *
 * A diferencia de las mediciones (§7, siempre sobre UNA radiografía), la
 * clasificación (§9) es un concepto de `Study`: Lenke necesita el Cobb en
 * bending, SRS-Schwab necesita PA + lateral. Por eso esta función recibe
 * TODAS las radiografías del estudio, no sólo la que esté activa en el
 * visor — busca la `PA_standing` para las curvas coronales, la
 * `LAT_standing` para los parámetros sagitales/pélvicos y los `BEND_left`/
 * `BEND_right` para la estructuralidad de Lenke, cada uno donde exista.
 * Si el estudio sólo tiene una radiografía, el comportamiento es idéntico
 * al de antes: lo que falta queda como `unmetInputs`, nunca fabricado.
 */
import { detectAllCobbCurves, measureCobb } from '../core/measurements/cobb';
import { measureKyphosisSegment, measureLumbarLordosis, measureMaxKyphosis, measureThoracicKyphosis } from '../core/measurements/sagittal';
import { measurePelvicParameters } from '../core/measurements/pelvic';
import { DEFAULT_CONVENTIONS, type Conventions } from '../core/config/conventions';
import type { Calibration } from '../core/calibration/calibration';
import type { ClassificationResult, PelvicAnnotation, Radiograph, ScoliosisEtiology, SpinalLevel, VertebraAnnotation } from '../core/models/types';
import { assignCurvesToRegions, type CurveRegion } from '../core/classification/curveRegions';
import { determineLumbarModifier } from '../core/classification/lumbarModifier';
import { classifyLenke, type LenkeClassificationInput, type LenkeRegionInput } from '../core/classification/lenke';
import { classifyKingMoe } from '../core/classification/kingMoe';
import { classifyPUMC, type PumcCurveInput } from '../core/classification/pumc';
import { classifySrsSchwab } from '../core/classification/srsSchwab';
import { classifyRoussouly } from '../core/classification/roussouly';
import { classifyCEOS, type CeosProgressionInput } from '../core/classification/ceos';
import { classifyCongenital, type FormationFailure, type SegmentationFailure } from '../core/classification/congenital';
import { classifyNeuromuscular, type NeuromuscularEtiologyClass } from '../core/classification/neuromuscular';
import { evaluateLenkeSilva, type LenkeSilvaChecklist, type LenkeSilvaLevel } from '../core/classification/lenkeSilva';

/**
 * Entradas que SPEC.md §9 exige recibir del clínico porque no se pueden
 * derivar de landmarks (hallazgos morfológicos, etiología, contexto
 * funcional): C-EOS (§9.5), Winter/McMaster congénita (§9.6), Lonstein-
 * Akbarnia neuromuscular (§9.7) y el árbol guiado de Lenke-Silva (§9.9, que
 * SPEC.md prohíbe calcular automáticamente). Cada clasificador sólo se
 * añade a `classifications` cuando el clínico ha hecho una elección
 * explícita que lo activa (`etiology`, `lenkeSilvaEnabled`) — nunca aparece
 * por un valor por defecto (p. ej. `ageYears` sin fijar).
 */
export interface ManualClassificationInputs {
  etiology: ScoliosisEtiology | null;
  ceosProgression: CeosProgressionInput | null;
  congenitalFormationFailure: FormationFailure | null;
  congenitalSegmentationFailure: SegmentationFailure | null;
  neuromuscularEtiologyClass: NeuromuscularEtiologyClass | null;
  neuromuscularTrunkBalanced: boolean | null;
  neuromuscularPelvicObliquitySignificant: boolean | null;
  neuromuscularDoubleBalancedCurve: boolean | null;
  neuromuscularGmfcs: 1 | 2 | 3 | 4 | 5 | null;
  lenkeSilvaEnabled: boolean;
  lenkeSilvaChecklist: LenkeSilvaChecklist;
  lenkeSilvaClinicianLevel: LenkeSilvaLevel | null;
}

export const DEFAULT_MANUAL_CLASSIFICATION_INPUTS: ManualClassificationInputs = {
  etiology: null,
  ceosProgression: null,
  congenitalFormationFailure: null,
  congenitalSegmentationFailure: null,
  neuromuscularEtiologyClass: null,
  neuromuscularTrunkBalanced: null,
  neuromuscularPelvicObliquitySignificant: null,
  neuromuscularDoubleBalancedCurve: null,
  neuromuscularGmfcs: null,
  lenkeSilvaEnabled: false,
  lenkeSilvaChecklist: {
    anteriorOsteophytes: false,
    subluxationOver2mm: false,
    curveMagnitudeAbove30Or45Deg: false,
    lumbarKyphosis: false,
    globalImbalance: false,
    bendingCorrectionBelow30Percent: false,
  },
  lenkeSilvaClinicianLevel: null,
};

export interface ClassificationOptions {
  calibration?: Calibration;
  conventions?: Conventions;
  /** SPEC.md §9.5: C-EOS sólo aplica por debajo de 10 años. */
  ageYears?: number;
  manual?: ManualClassificationInputs;
}

function findByView(radiographs: Radiograph[], view: Radiograph['view']): Radiograph | undefined {
  return radiographs.find((r) => r.view === view);
}

/**
 * Recalcula las clasificaciones computables a partir de TODAS las
 * radiografías de un mismo estudio. `radiographs` debe incluir la
 * radiografía activa junto con el resto (`store.ts` las ensambla). Sólo
 * incluye claves para las que hay al menos un dato de partida (una curva
 * coronal detectada en la PA) — nunca añade una entrada "vacía" que
 * sugiera que se intentó calcular sin ningún insumo.
 */
export function recomputeClassifications(radiographs: Radiograph[], options: ClassificationOptions = {}): Record<string, ClassificationResult> {
  const conventions = options.conventions ?? DEFAULT_CONVENTIONS;
  const classifications: Record<string, ClassificationResult> = {};

  const paStanding = findByView(radiographs, 'PA_standing');
  if (!paStanding) return classifications;
  const { vertebrae, pelvis } = paStanding.annotations;

  const latStanding = findByView(radiographs, 'LAT_standing');
  const bendLeft = findByView(radiographs, 'BEND_left');
  const bendRight = findByView(radiographs, 'BEND_right');
  const nonStandardFlexibilityFilm = !bendLeft && !bendRight && (!!findByView(radiographs, 'FULCRUM') || !!findByView(radiographs, 'TRACTION'));
  const fulcrumOrTraction = findByView(radiographs, 'FULCRUM') ?? findByView(radiographs, 'TRACTION');

  const { curves } = detectAllCobbCurves(vertebrae, conventions);

  // Los clasificadores de curva coronal (§9.1–9.4, §9.8) no tienen ningún
  // insumo de partida sin al menos una curva detectada en la PA — se omiten
  // por completo en vez de añadir una entrada vacía. Los clasificadores de
  // entrada manual (más abajo) son independientes de esto: la etiología
  // congénita o neuromuscular de un paciente no depende de que haya una
  // curva coronal medible todavía.
  if (curves.length > 0) {
    const regionAssignment = assignCurvesToRegions(curves);

    // --- Lenke -----------------------------------------------------------
    const lenkeRegions: Record<CurveRegion, LenkeRegionInput> = {
      PT: buildLenkeRegionInput('PT', regionAssignment.regions.PT, latStanding, bendLeft, bendRight, fulcrumOrTraction, conventions),
      MT: buildLenkeRegionInput('MT', regionAssignment.regions.MT, latStanding, bendLeft, bendRight, fulcrumOrTraction, conventions),
      TL_L: buildLenkeRegionInput('TL_L', regionAssignment.regions.TL_L, latStanding, bendLeft, bendRight, fulcrumOrTraction, conventions),
    };
    const tlLApex = regionAssignment.regions.TL_L?.apexVertebra ?? null;
    const lumbarModifier = determineLumbarModifier(tlLApex, pelvis, options.calibration, conventions);
    const sagittalT5T12 = latStanding ? measureThoracicKyphosis(latStanding.annotations.vertebrae).value : null;

    const lenkeInput: LenkeClassificationInput = {
      view: paStanding.view,
      regions: lenkeRegions,
      nonStandardFlexibilityFilm,
      sagittalT5T12Deg: sagittalT5T12,
      lumbarModifier,
    };
    classifications.lenke = classifyLenke(lenkeInput, conventions);

    // --- King-Moe ----------------------------------------------------------
    classifications.kingMoe = classifyKingMoe(
      {
        view: paStanding.view,
        thoracicCobbDeg: regionAssignment.regions.MT?.angle ?? regionAssignment.regions.PT?.angle ?? null,
        lumbarCobbDeg: regionAssignment.regions.TL_L?.angle ?? null,
        doubleThoracic: null,
        thoracicMoreRigidManual: null,
        longThoracicCurveManual: null,
      },
      conventions,
    );

    // --- PUMC ----------------------------------------------------------------
    const pumcCurves: PumcCurveInput[] = curves
      .filter((c) => c.apexVertebra !== null)
      .map((c) => ({ apexLevel: c.apexVertebra!.level, cobbDeg: c.angle }));
    classifications.pumc = classifyPUMC({ view: paStanding.view, curves: pumcCurves }, conventions);

    // --- SRS-Schwab (adulto) -------------------------------------------------
    const srsCurves = pumcCurves; // mismo formato: {apexLevel, cobbDeg}.
    const sagittalPelvic = computeSagittalPelvicParameters(latStanding, options.calibration, conventions);
    classifications.srsSchwab = classifySrsSchwab({
      curves: srsCurves,
      piLlMismatchDeg: sagittalPelvic.piLlMismatchDeg,
      svaMm: null,
      ptDeg: sagittalPelvic.ptDeg,
    });

    // --- Roussouly (orientativo) ---------------------------------------------
    if (sagittalPelvic.sacralSlopeDeg !== null || sagittalPelvic.pelvicIncidenceDeg !== null) {
      classifications.roussouly = classifyRoussouly({
        sacralSlopeDeg: sagittalPelvic.sacralSlopeDeg,
        pelvicIncidenceDeg: sagittalPelvic.pelvicIncidenceDeg,
        hyperlordotic: null,
        anteverted: null,
      });
    }
  }

  applyManualClassifications(classifications, { curves, latStanding, conventions, ageYears: options.ageYears, manual: options.manual });

  return classifications;
}

/**
 * SPEC.md §9.5–§9.7, §9.9: los cuatro clasificadores que dependen de un
 * hallazgo clínico que el modelo de landmarks no captura (etiología,
 * morfología vertebral, contexto funcional, árbol guiado). Cada uno sólo se
 * añade cuando el clínico hizo una elección explícita que lo activa — nunca
 * por un valor por defecto sin fijar (`docs/OPEN_QUESTIONS.md`: mismo
 * criterio que el resto del motor, "nunca fabricar").
 */
function applyManualClassifications(
  classifications: Record<string, ClassificationResult>,
  ctx: {
    curves: ReturnType<typeof detectAllCobbCurves>['curves'];
    latStanding: Radiograph | undefined;
    conventions: Conventions;
    ageYears: number | undefined;
    manual: ManualClassificationInputs | undefined;
  },
): void {
  const { curves, latStanding, ageYears, manual } = ctx;
  if (!manual) return;

  // --- C-EOS (inicio precoz, <10 años) ------------------------------------
  if (manual.etiology !== null && ageYears !== undefined && ageYears < 10) {
    const majorCobbDeg = curves.length > 0 ? Math.max(...curves.map((c) => c.angle)) : null;
    const maxKyphosisDeg = latStanding ? measureMaxKyphosis(latStanding.annotations.vertebrae).value : null;
    classifications.ceos = classifyCEOS({
      ageYears,
      etiology: manual.etiology,
      majorCobbDeg,
      maxKyphosisDeg,
      progression: manual.ceosProgression,
    });
  }

  // --- Congénita — Winter/McMaster ----------------------------------------
  if (manual.etiology === 'congenital') {
    classifications.congenital = classifyCongenital({
      formationFailure: manual.congenitalFormationFailure,
      segmentationFailure: manual.congenitalSegmentationFailure,
    });
  }

  // --- Neuromuscular — Lonstein-Akbarnia -----------------------------------
  if (manual.etiology === 'neuromuscular') {
    classifications.neuromuscular = classifyNeuromuscular({
      etiologyClass: manual.neuromuscularEtiologyClass,
      trunkBalanced: manual.neuromuscularTrunkBalanced,
      pelvicObliquitySignificant: manual.neuromuscularPelvicObliquitySignificant,
      doubleBalancedCurve: manual.neuromuscularDoubleBalancedCurve,
      gmfcs: manual.neuromuscularGmfcs,
    });
  }

  // --- Lenke-Silva (degenerativa del adulto) -------------------------------
  // SPEC.md §9.9: árbol guiado con casillas, nunca calculado a partir de
  // `etiology` — su propio interruptor explícito activa la sección, porque
  // es una población distinta (adulto degenerativo) de la que cubre
  // `ScoliosisEtiology`.
  if (manual.lenkeSilvaEnabled) {
    classifications.lenkeSilva = evaluateLenkeSilva({
      checklist: manual.lenkeSilvaChecklist,
      clinicianSelectedLevel: manual.lenkeSilvaClinicianLevel,
    });
  }
}

interface SagittalPelvicParameters {
  sacralSlopeDeg: number | null;
  pelvicIncidenceDeg: number | null;
  ptDeg: number | null;
  piLlMismatchDeg: number | null;
}

/** SS/PI/PT/PI-LL sólo tienen sentido clínico medidos sobre la lateral de
 * pie con su propia pelvis anotada — nunca se calculan sobre la PA. */
function computeSagittalPelvicParameters(
  latStanding: Radiograph | undefined,
  calibration: Calibration | undefined,
  conventions: Conventions,
): SagittalPelvicParameters {
  const empty: SagittalPelvicParameters = { sacralSlopeDeg: null, pelvicIncidenceDeg: null, ptDeg: null, piLlMismatchDeg: null };
  if (!latStanding?.annotations.pelvis) return empty;

  const pelvicParams = measurePelvicParameters(latStanding.annotations.pelvis, calibration, conventions);
  let piLlMismatchDeg: number | null = null;
  if (pelvicParams.pelvicIncidence.value !== null) {
    const ll = measureLumbarLordosis(latStanding.annotations.vertebrae, conventions).value;
    if (ll !== null) piLlMismatchDeg = pelvicParams.pelvicIncidence.value - ll;
  }
  return {
    sacralSlopeDeg: pelvicParams.sacralSlope.value,
    pelvicIncidenceDeg: pelvicParams.pelvicIncidence.value,
    ptDeg: pelvicParams.pelvicTilt.value,
    piLlMismatchDeg,
  };
}

/**
 * `docs/OPEN_QUESTIONS.md` #46: con las dos radiografías de bending
 * disponibles, se usa el valor más corregido (menor) — criterio
 * conservador: exige más corrección real para declarar la curva no
 * estructural. Con una sola, se usa esa.
 */
function measureBendingCobbForTerminals(
  terminals: { cranial: SpinalLevel; caudal: SpinalLevel },
  bendLeft: Radiograph | undefined,
  bendRight: Radiograph | undefined,
  conventions: Conventions,
): number | null {
  const fromFilm = (film: Radiograph | undefined): number | null => {
    if (!film) return null;
    return measureCobb(film.annotations.vertebrae, { conventions, forcedTerminals: terminals }).value;
  };
  const left = fromFilm(bendLeft);
  const right = fromFilm(bendRight);
  if (left !== null && right !== null) return Math.min(left, right);
  return left ?? right;
}

function buildLenkeRegionInput(
  region: CurveRegion,
  curve: ReturnType<typeof assignCurvesToRegions>['regions'][CurveRegion],
  latStanding: Radiograph | undefined,
  bendLeft: Radiograph | undefined,
  bendRight: Radiograph | undefined,
  fulcrumOrTraction: Radiograph | undefined,
  conventions: Conventions,
): LenkeRegionInput {
  if (!curve) return { standingCobbDeg: null, bendingCobbDeg: null, sagittalKyphosisDeg: null };

  const terminals = { cranial: curve.cranialVertebra.level, caudal: curve.caudalVertebra.level };
  const bendingCobbDeg =
    measureBendingCobbForTerminals(terminals, bendLeft, bendRight, conventions) ??
    // docs/OPEN_QUESTIONS.md #7 ★★: sin bending supino, se acepta fulcrum/
    // tracción igualmente (marcado nonStandardFlexibilityFilm más arriba),
    // nunca se deja de calcular sólo porque la película no es la estándar.
    (fulcrumOrTraction ? measureCobb(fulcrumOrTraction.annotations.vertebrae, { conventions, forcedTerminals: terminals }).value : null);

  // SPEC.md §9.1 Paso 3 / docs/OPEN_QUESTIONS.md #13: T2–T5 para PT,
  // T10–L2 para MT/TL_L. Sólo tiene sentido clínico sobre una lateral.
  const sagittalKyphosisDeg = latStanding
    ? (region === 'PT'
        ? measureKyphosisSegment(latStanding.annotations.vertebrae, 'T2', 'T5')
        : measureKyphosisSegment(latStanding.annotations.vertebrae, 'T10', 'L2')
      ).value
    : null;

  return { standingCobbDeg: curve.angle, bendingCobbDeg, sagittalKyphosisDeg };
}

// Reexportado únicamente para que otros módulos (p. ej. pruebas) puedan
// construir anotaciones de prueba sin duplicar el tipo.
export type { VertebraAnnotation, PelvicAnnotation };
