/**
 * Etapa 7 — Orquestación del pipeline automático. SPEC.md §8: "Los
 * landmarks pasan al motor de §7 y §9, sin ruta de código alternativa."
 *
 * Reutiliza `ui/measurementEngine.ts::recomputeMeasurementSet` — la MISMA
 * función que usa la anotación manual (Fase 2) — en vez de reimplementar
 * las llamadas a `core/measurements`: es la única forma de **garantizar**
 * (no sólo prometer por convención) que ambas rutas ejecutan exactamente el
 * mismo código. Ese módulo es puro y no depende de React/DOM/Zustand (ver
 * su propio docstring), así que es seguro llamarlo aquí, incluida su
 * futura ejecución dentro de un Web Worker.
 *
 * Etapas 0–2 (ingesta/anonimización, clasificación de proyección,
 * preprocesado) y Etapa 8 (QC) están completas y ejecutan sobre imágenes
 * reales. La Etapa 3 (segmentación vertebral) usa el heurístico de
 * `vertebraDetector.ts` — sin modelo entrenado, ver `training/README.md` —
 * y la Etapa 4 (etiquetado de niveles) exige un ancla que este pipeline no
 * puede producir por sí mismo (no hay segmentación sacra real): sin ella,
 * `runAutomaticPipeline` devuelve las bandas candidatas y el QC, pero
 * `measurementSet` queda `null` — nunca se inventa a qué nivel corresponde
 * cada banda para forzar un resultado.
 */
import type { Calibration } from '../core/calibration/calibration';
import { DEFAULT_CONVENTIONS, type Conventions } from '../core/config/conventions';
import type { MeasurementSet, Radiograph, RadiographView, VertebraAnnotation } from '../core/models/types';
import { recomputeMeasurementSet } from '../ui/measurementEngine';
import type { ImageSource } from '../imaging/types';
import { toGrayscaleImage } from './imageAdapter';
import { detectFemoralHeads, type FemoralHeadDetectionResult } from './pelvicDetector';
import { labelVertebraLevels, type LevelAnchor, type LevelLabelingResult } from './levelLabeling';
import { applyClahe, detectSpineRoi, normalizeIntensity, resampleWithAffine } from './preprocess';
import { buildPipelineQualityControlReport } from './qualityControl';
import type { AffineTransform2D, SpineRoi } from './types';
import { bandToOriginalSpaceRectangle, detectVertebraBands, type VertebraBandCandidate } from './vertebraDetector';
import { classifyView, type ViewClassification } from './viewClassification';

export interface PipelineOptions {
  calibration?: Calibration;
  conventions?: Conventions;
  /** Etapa 4: sin esto, no se puede construir ningún `VertebraAnnotation`
   * (su `level` no es opcional en el modelo de datos, SPEC.md §5) y
   * `measurementSet` queda `null`. */
  levelAnchor?: LevelAnchor | null;
  targetResampleWidth?: number;
  targetResampleHeight?: number;
  minRowSpacing?: number;
  femoralHeadRadius?: { min: number; max: number };
  expectedBodyCount?: number | null;
}

export interface PipelineResult {
  viewClassification: ViewClassification;
  roi: SpineRoi;
  transform: AffineTransform2D;
  detectedBands: VertebraBandCandidate[];
  levelLabeling: LevelLabelingResult;
  femoralHeads: FemoralHeadDetectionResult;
  /** `null` si no hay proyección PA de pie confirmada, o si `levelAnchor`
   * no se proporcionó (Etapa 4 sin ancla) — nunca un resultado fabricado. */
  radiograph: Radiograph | null;
  measurementSet: MeasurementSet | null;
}

const DEFAULT_TARGET_WIDTH = 512;
const DEFAULT_TARGET_HEIGHT = 1024;
const DEFAULT_MIN_ROW_SPACING_FRACTION = 0.04; // ~4% de la altura remuestreada entre centros de cuerpos vecinos.
const DEFAULT_FEMORAL_HEAD_RADIUS_FRACTION = { min: 0.02, max: 0.08 }; // proporción del ancho remuestreado.

function newRadiographId(): string {
  return typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `auto-${Date.now()}-${Math.random()}`;
}

/**
 * Ejecuta las Etapas 0–8 del pipeline automático sobre una imagen ya
 * cargada (Etapa 0 — anonimización e ingesta — ocurre antes, en
 * `imaging/loadDicom.ts`, tal como exige SPEC.md §8 Etapa 0).
 */
export function runAutomaticPipeline(source: ImageSource, viewHint: RadiographView | null, options: PipelineOptions = {}): PipelineResult {
  const conventions = options.conventions ?? DEFAULT_CONVENTIONS;
  const viewClassification = classifyView(viewHint);

  const grayscale = toGrayscaleImage(source);
  const normalized = normalizeIntensity(grayscale);
  const enhanced = applyClahe(normalized);
  const roi = detectSpineRoi(enhanced);

  const targetWidth = options.targetResampleWidth ?? DEFAULT_TARGET_WIDTH;
  const targetHeight = options.targetResampleHeight ?? DEFAULT_TARGET_HEIGHT;
  const { image: resampled, transform } = resampleWithAffine(enhanced, roi, targetWidth, targetHeight);

  const minRowSpacing = options.minRowSpacing ?? Math.round(targetHeight * DEFAULT_MIN_ROW_SPACING_FRACTION);
  const detectedBands = detectVertebraBands(
    resampled,
    { x0: 0, y0: 0, x1: targetWidth, y1: targetHeight },
    { minRowSpacing, view: viewClassification.view },
  );

  const femoralHeadRadius = options.femoralHeadRadius ?? {
    min: Math.round(targetWidth * DEFAULT_FEMORAL_HEAD_RADIUS_FRACTION.min),
    max: Math.round(targetWidth * DEFAULT_FEMORAL_HEAD_RADIUS_FRACTION.max),
  };
  const femoralHeads = detectFemoralHeads(resampled, { minRadius: femoralHeadRadius.min, maxRadius: femoralHeadRadius.max });

  const levelLabeling = labelVertebraLevels(detectedBands, options.levelAnchor ?? null);

  const qc = buildPipelineQualityControlReport({
    bands: detectedBands,
    femoralHeadsDetected: femoralHeads.femoralHeads !== null,
    expectedBodyCount: options.expectedBodyCount ?? null,
  });

  // SPEC.md §8 Etapa 1: proyección con confianza <0.9 exige confirmación —
  // nunca se calcula sobre una proyección no verificada. SPEC.md §8 Etapa 4:
  // sin ancla, no hay niveles, no hay `VertebraAnnotation[]`, no hay cálculo.
  if (viewClassification.view === null || levelLabeling.uncertain) {
    return { viewClassification, roi, transform, detectedBands, levelLabeling, femoralHeads, radiograph: null, measurementSet: null };
  }

  const vertebrae: VertebraAnnotation[] = [];
  for (const { band, level } of levelLabeling.labeled) {
    if (level === null) continue; // no debería ocurrir con uncertain=false, pero nunca se asume.
    const rect = bandToOriginalSpaceRectangle(band, transform);
    vertebrae.push({
      level,
      superiorEndplate: rect.superiorEndplate,
      inferiorEndplate: rect.inferiorEndplate,
      confidence: band.confidence.value,
    });
  }

  // `PelvicAnnotation.s1Endplate` NO es opcional en el modelo de datos
  // (SPEC.md §5): representa que hay landmarks suficientes para calcular
  // SS/PT/PI, no sólo "alguna" pelvis. El platillo de S1 exige segmentación
  // sacra real, que no existe sin modelo entrenado — así que, por más que
  // las cabezas femorales se hayan detectado con buena confianza (ver
  // `femoralHeads` en el resultado, disponible igualmente para overlay o
  // uso futuro), **nunca se construye un `PelvicAnnotation`** a partir de
  // sólo esas dos cabezas: sería fabricar el punto que falta con una
  // aproximación geométrica no verificada, exactamente lo que SPEC.md §8.1
  // prohíbe ("prohibido rellenar un hueco con un valor estimado").
  const radiograph: Radiograph = {
    id: newRadiographId(),
    view: viewClassification.view,
    annotations: { vertebrae },
  };

  const measurementSet = recomputeMeasurementSet(radiograph, {
    conventions,
    ...(options.calibration ? { calibration: options.calibration } : {}),
  });
  measurementSet.source = 'auto';
  measurementSet.modelVersion = 'heuristic-bands-v1';
  measurementSet.qc = qc;

  return { viewClassification, roi, transform, detectedBands, levelLabeling, femoralHeads, radiograph, measurementSet };
}
