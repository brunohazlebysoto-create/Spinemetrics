/**
 * Puente entre un `Radiograph` anotado y `core/classification`. SPEC.md §9:
 * "Cada clasificador... Si falta un dato, no adivinar: devolver
 * `unmetInputs`... La clasificación se muestra igualmente cuando es
 * calculable, con una nota discreta sobre lo que falta." Mismo patrón que
 * `measurementEngine.ts`: puro, sin DOM/Zustand, sólo orquesta.
 *
 * Limitación explícita y documentada (no oculta): la Fase 2 mantiene un
 * único `Radiograph` activo por estudio (ver `store.ts`), así que los
 * clasificadores que combinan varias radiografías (Lenke con bending, SRS-
 * Schwab combinando PA+lateral) sólo reciben aquí lo que la radiografía
 * ACTIVA puede aportar — nunca se inventa el resto: queda como
 * `unmetInputs` o como región/modificador `null`, igual que si faltara
 * cualquier otro dato. Combinar varias radiografías de un mismo `Study` es
 * trabajo de pulido pendiente (ver `src/pipeline/README.md`).
 */
import { detectAllCobbCurves } from '../core/measurements/cobb';
import { measureKyphosisSegment, measureLumbarLordosis, measureThoracicKyphosis } from '../core/measurements/sagittal';
import { measurePelvicParameters } from '../core/measurements/pelvic';
import { DEFAULT_CONVENTIONS, type Conventions } from '../core/config/conventions';
import type { Calibration } from '../core/calibration/calibration';
import type { ClassificationResult, Radiograph } from '../core/models/types';
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

/**
 * Recalcula las clasificaciones computables a partir de un único
 * `Radiograph`. Sólo incluye claves para las que hay al menos un dato de
 * partida (una curva coronal detectada) — nunca añade una entrada
 * "vacía" que sugiera que se intentó calcular sin ningún insumo.
 */
export function recomputeClassifications(radiograph: Radiograph, options: ClassificationOptions = {}): Record<string, ClassificationResult> {
  const conventions = options.conventions ?? DEFAULT_CONVENTIONS;
  const { vertebrae, pelvis } = radiograph.annotations;
  const classifications: Record<string, ClassificationResult> = {};

  const { curves } = detectAllCobbCurves(vertebrae, conventions);
  if (curves.length === 0) return classifications;

  const regionAssignment = assignCurvesToRegions(curves);
  const isLateral = radiograph.view === 'LAT_standing';

  // --- Lenke -----------------------------------------------------------
  const lenkeRegions: Record<CurveRegion, LenkeRegionInput> = {
    PT: buildLenkeRegionInput('PT', regionAssignment.regions.PT, isLateral, vertebrae),
    MT: buildLenkeRegionInput('MT', regionAssignment.regions.MT, isLateral, vertebrae),
    TL_L: buildLenkeRegionInput('TL_L', regionAssignment.regions.TL_L, isLateral, vertebrae),
  };
  const tlLApex = regionAssignment.regions.TL_L?.apexVertebra ?? null;
  const lumbarModifier = determineLumbarModifier(tlLApex, pelvis, options.calibration, conventions);
  const sagittalT5T12 = isLateral ? measureThoracicKyphosis(vertebrae).value : null;

  const lenkeInput: LenkeClassificationInput = {
    view: radiograph.view,
    regions: lenkeRegions,
    nonStandardFlexibilityFilm: false,
    sagittalT5T12Deg: sagittalT5T12,
    lumbarModifier,
  };
  classifications.lenke = classifyLenke(lenkeInput, conventions);

  // --- King-Moe ----------------------------------------------------------
  classifications.kingMoe = classifyKingMoe(
    {
      view: radiograph.view,
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
  classifications.pumc = classifyPUMC({ view: radiograph.view, curves: pumcCurves }, conventions);

  // --- SRS-Schwab (adulto) -------------------------------------------------
  const srsCurves = pumcCurves; // mismo formato: {apexLevel, cobbDeg}.
  let piLlMismatchDeg: number | null = null;
  let svaMm: number | null = null;
  let ptDeg: number | null = null;
  if (isLateral && pelvis) {
    const pelvicParams = measurePelvicParameters(pelvis, options.calibration, conventions);
    ptDeg = pelvicParams.pelvicTilt.value;
    if (pelvicParams.pelvicIncidence.value !== null) {
      const ll = measureLumbarLordosis(vertebrae, conventions).value;
      if (ll !== null) piLlMismatchDeg = pelvicParams.pelvicIncidence.value - ll;
    }
  }
  classifications.srsSchwab = classifySrsSchwab({ curves: srsCurves, piLlMismatchDeg, svaMm, ptDeg });

  // --- Roussouly (orientativo) ---------------------------------------------
  if (isLateral && pelvis) {
    const pelvicParams = measurePelvicParameters(pelvis, options.calibration, conventions);
    classifications.roussouly = classifyRoussouly({
      sacralSlopeDeg: pelvicParams.sacralSlope.value,
      pelvicIncidenceDeg: pelvicParams.pelvicIncidence.value,
      hyperlordotic: null,
      anteverted: null,
    });
  }

  return classifications;
}

function buildLenkeRegionInput(
  region: CurveRegion,
  curve: ReturnType<typeof assignCurvesToRegions>['regions'][CurveRegion],
  isLateral: boolean,
  vertebrae: Radiograph['annotations']['vertebrae'],
): LenkeRegionInput {
  if (!curve) return { standingCobbDeg: null, bendingCobbDeg: null, sagittalKyphosisDeg: null };

  // SPEC.md §9.1 Paso 3 / docs/OPEN_QUESTIONS.md #13: T2–T5 para PT,
  // T10–L2 para MT/TL_L. Sólo tiene sentido clínico sobre una lateral.
  const sagittalKyphosisDeg = isLateral
    ? (region === 'PT' ? measureKyphosisSegment(vertebrae, 'T2', 'T5') : measureKyphosisSegment(vertebrae, 'T10', 'L2')).value
    : null;

  return {
    standingCobbDeg: curve.angle,
    // Sin bending disponible desde una única radiografía activa (Fase 2):
    // nunca se fabrica, se deja explícitamente sin dato.
    bendingCobbDeg: null,
    sagittalKyphosisDeg,
  };
}
