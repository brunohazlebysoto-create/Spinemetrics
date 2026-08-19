/**
 * Etapa 8 — Control de calidad automático. SPEC.md §8.1. Produce un
 * `QualityControlReport` (mismo tipo que consume `MeasurementSet.qc`,
 * `core/models/types.ts`) a partir de las salidas crudas de las Etapas 3–5
 * de este pipeline — las comprobaciones que ya viven dentro de
 * `core/measurements` (confianza <0.7 excluida de terminales en
 * `cobb.ts`, `PI ≠ PT+SS` en `pelvic.ts`, calibración ausente en
 * `calibration.ts`) no se duplican aquí: esto sólo cubre lo específico de
 * la detección automática que SPEC.md §8.1 exige y que no tiene ya un lugar
 * natural en `core/`.
 */
import type { QualityControlCheck, QualityControlReport } from '../core/models/types';
import type { VertebraBandCandidate } from './vertebraDetector';

const RELIABLE_CONFIDENCE_THRESHOLD = 0.7;
const HEIGHT_DEVIATION_FRACTION = 0.4;

/** "Vértebras no ordenadas monotónicamente → abortar el etiquetado de
 * niveles." Comprueba que `rowCenter` crece estrictamente banda a banda
 * (craneal→caudal en el espacio de imagen). */
export function checkMonotonicOrder(bands: VertebraBandCandidate[]): QualityControlCheck {
  for (let i = 1; i < bands.length; i++) {
    if (bands[i]!.rowCenter <= bands[i - 1]!.rowCenter) {
      return {
        name: 'ordenMonotonico',
        status: 'unavailable',
        detail: `Banda ${i} (fila ${bands[i]!.rowCenter}) no está por debajo de la banda ${i - 1} (fila ${bands[i - 1]!.rowCenter}): etiquetado de niveles abortado (SPEC.md §8.1).`,
      };
    }
  }
  return { name: 'ordenMonotonico', status: 'ok' };
}

/** "Confianza de segmentación de una vértebra <0.7 → marcarla no fiable."
 * Resumen agregado — la exclusión real ya la aplica
 * `core/measurements/cobb.ts` sobre `VertebraAnnotation.confidence`. */
export function checkConfidenceThreshold(bands: VertebraBandCandidate[]): QualityControlCheck {
  const unreliable = bands.filter((b) => b.confidence.value < RELIABLE_CONFIDENCE_THRESHOLD).length;
  if (unreliable === 0) return { name: 'confianzaSegmentacion', status: 'ok' };
  return {
    name: 'confianzaSegmentacion',
    status: unreliable === bands.length ? 'unavailable' : 'warning',
    detail: `${unreliable}/${bands.length} vértebra(s) con confianza <0.7: excluidas de la selección de terminales (SPEC.md §8.1).`,
  };
}

/** "Altura vertebral fuera de ±40 % de la mediana de sus vecinas → marcar
 * posible colapso o mala segmentación." "Vecinas" = las dos bandas
 * adyacentes (craneal y caudal) cuando existen. */
export function checkVertebralHeightConsistency(bands: VertebraBandCandidate[]): QualityControlCheck {
  if (bands.length < 3) return { name: 'alturaVertebral', status: 'ok', detail: 'Menos de 3 bandas: sin vecinas suficientes para comparar.' };

  const heights = bands.map((b) => b.rowBottom - b.rowTop);
  const flagged: number[] = [];
  for (let i = 0; i < bands.length; i++) {
    const neighborHeights = [heights[i - 1], heights[i + 1]].filter((h): h is number => h !== undefined);
    if (neighborHeights.length === 0) continue;
    const median = medianOf(neighborHeights);
    if (median === 0) continue;
    const deviation = Math.abs(heights[i]! - median) / median;
    if (deviation > HEIGHT_DEVIATION_FRACTION) flagged.push(i);
  }

  if (flagged.length === 0) return { name: 'alturaVertebral', status: 'ok' };
  return {
    name: 'alturaVertebral',
    status: 'warning',
    detail: `Banda(s) en índice ${flagged.join(', ')} con altura fuera de ±${HEIGHT_DEVIATION_FRACTION * 100}% de la mediana de sus vecinas: posible colapso o mala segmentación (SPEC.md §8.1).`,
  };
}

function medianOf(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

/** "Número de cuerpos ≠ el esperado → `levelLabelingUncertain`, pedir
 * confirmación." `expectedCount` es opcional: sólo se puede comparar contra
 * un recuento anatómico esperado si se conoce por otra vía (p. ej. el rango
 * de niveles visibles en el encuadre). */
export function checkExpectedBodyCount(detectedCount: number, expectedCount: number | null): QualityControlCheck {
  if (expectedCount === null) {
    return { name: 'numeroCuerpos', status: 'ok', detail: 'Sin recuento esperado de referencia: no se puede contrastar.' };
  }
  if (detectedCount === expectedCount) return { name: 'numeroCuerpos', status: 'ok' };
  return {
    name: 'numeroCuerpos',
    status: 'warning',
    detail: `${detectedCount} cuerpo(s) detectado(s), se esperaban ${expectedCount}: levelLabelingUncertain, pedir confirmación (SPEC.md §8.1).`,
  };
}

/** "S1 o cabezas femorales fuera del campo → SVA, PI, PT, SS y TPA en gris
 * con el motivo." Aquí sólo se comprueba lo que este pipeline puede saber:
 * si la detección de cabezas femorales produjo resultado. La ausencia de
 * S1 es SIEMPRE cierta en este pipeline (sin segmentación sacra — ver
 * `pelvicDetector.ts`), así que ese gris ya lo garantiza
 * `core/measurements/sagittal.ts`/`pelvic.ts` al no recibir el dato. */
export function checkFemoralHeadsInField(femoralHeadsDetected: boolean): QualityControlCheck {
  if (femoralHeadsDetected) return { name: 'camposPelvicos', status: 'ok' };
  return {
    name: 'camposPelvicos',
    status: 'unavailable',
    detail: 'Cabezas femorales no detectadas (fuera de campo o sin bordes suficientes): SVA, PI, PT, SS y TPA en gris (SPEC.md §8.1).',
  };
}

export interface PipelineQcInputs {
  bands: VertebraBandCandidate[];
  femoralHeadsDetected: boolean;
  expectedBodyCount?: number | null;
}

export function buildPipelineQualityControlReport(input: PipelineQcInputs): QualityControlReport {
  const checks: QualityControlCheck[] = [
    checkMonotonicOrder(input.bands),
    checkConfidenceThreshold(input.bands),
    checkVertebralHeightConsistency(input.bands),
    checkExpectedBodyCount(input.bands.length, input.expectedBodyCount ?? null),
    checkFemoralHeadsInField(input.femoralHeadsDetected),
  ];
  return { checks };
}
