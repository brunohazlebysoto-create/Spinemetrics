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
import { measureKyphosisSegment, measureLumbarLordosis, measureThoracicKyphosis } from '../core/measurements/sagittal';
import { measurePelvicParameters } from '../core/measurements/pelvic';
import { DEFAULT_CONVENTIONS, type Conventions } from '../core/config/conventions';
import type { Calibration } from '../core/calibration/calibration';
import type { ClassificationResult, PelvicAnnotation, Radiograph, SpinalLevel, VertebraAnnotation } from '../core/models/types';
import { assignCurvesToRegions, type CurveRegion } from '../core/classification/curveRegions';
import { determineLumbarModifier } from '../core/classification/lumbarModifier';
import { classifyLenke, type LenkeClassificationInput, type LenkeRegionInput } from '../core/classification/lenke';
import { classifyKingMoe } from '../core/classification/kingMoe';
import { classifyPUMC, type PumcCurveInput } from '../core/classification/pumc';
import { classifySrsSchwab } from '../core/classification/srsSchwab';
import { classifyRoussouly } from '../core/classification/roussouly';

export interface ClassificationOptions {
  calibration?: Calibration;
  conventions?: Conventions;
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

  const { curves } = detectAllCobbCurves(vertebrae, conventions);
  if (curves.length === 0) return classifications;

  const latStanding = findByView(radiographs, 'LAT_standing');
  const bendLeft = findByView(radiographs, 'BEND_left');
  const bendRight = findByView(radiographs, 'BEND_right');
  const nonStandardFlexibilityFilm = !bendLeft && !bendRight && (!!findByView(radiographs, 'FULCRUM') || !!findByView(radiographs, 'TRACTION'));
  const fulcrumOrTraction = findByView(radiographs, 'FULCRUM') ?? findByView(radiographs, 'TRACTION');

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

  return classifications;
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
