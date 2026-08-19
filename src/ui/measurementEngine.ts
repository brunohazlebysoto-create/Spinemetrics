/**
 * Puente entre un `Radiograph` anotado y el motor puro de `core/measurements`
 * y `core/classification`. SPEC.md §10.2: "Al moverlo se recalculan
 * líneas, ángulos, balances y clasificación en tiempo real." Es la ÚNICA
 * función que produce un `MeasurementSet` completo (mediciones +
 * clasificaciones) en toda la aplicación — `store.ts` (edición manual) y
 * `pipeline/runPipeline.ts` (Etapa 7 automática) llaman a esta misma
 * función, nunca reimplementan la orquestación: es la única forma de
 * garantizar, no sólo prometer, que ambas rutas pasan por el mismo motor.
 *
 * Puro y sin DOM: no importa nada de `ui/Viewer` ni de Zustand, así que se
 * prueba igual que el resto de `core/` (SPEC.md §4 sólo prohíbe la
 * dependencia inversa, `core/` → `ui/`; esto es `ui/` → `core/`, permitido).
 */
import { measureCobb } from '../core/measurements/cobb';
import { measureApicalTranslation, measureCoronalBalance } from '../core/measurements/balance';
import { measureLumbarLordosis, measureSVA, measureT1Slope, measureTPA, measureThoracicKyphosis } from '../core/measurements/sagittal';
import { measurePelvicObliquity, measurePelvicParameters, measurePiLlMismatch } from '../core/measurements/pelvic';
import { DEFAULT_CONVENTIONS, type Conventions } from '../core/config/conventions';
import type { Calibration } from '../core/calibration/calibration';
import type { MeasurementSet, Radiograph, SpinalLevel } from '../core/models/types';
import { recomputeClassifications } from './classificationEngine';

export interface RecomputeOptions {
  calibration?: Calibration;
  conventions?: Conventions;
  /** SPEC.md §7.2 "Seguimiento": vértebras terminales heredadas del estudio
   * índice, o fijadas manualmente por el usuario con el atajo `E`. */
  forcedCobbTerminals?: { cranial: SpinalLevel; caudal: SpinalLevel };
}

/**
 * Recalcula el `MeasurementSet` completo de un `Radiograph` a partir de sus
 * anotaciones actuales. Cada medición decide por sí misma si tiene datos
 * suficientes (devuelve `unavailable` con motivo si no) — este módulo no
 * añade ninguna comprobación adicional, sólo orquesta las llamadas.
 */
export function recomputeMeasurementSet(radiograph: Radiograph, options: RecomputeOptions = {}): MeasurementSet {
  const conventions = options.conventions ?? DEFAULT_CONVENTIONS;
  const { vertebrae, pelvis } = radiograph.annotations;
  const measurements: MeasurementSet['measurements'] = {};

  const cobb = measureCobb(vertebrae, {
    conventions,
    ...(options.forcedCobbTerminals ? { forcedTerminals: options.forcedCobbTerminals } : {}),
  });
  measurements.cobb = cobb;

  measurements.thoracicKyphosis = measureThoracicKyphosis(vertebrae);
  measurements.lumbarLordosis = measureLumbarLordosis(vertebrae, conventions);
  measurements.sva = measureSVA(vertebrae, pelvis, options.calibration, conventions);
  measurements.t1Slope = measureT1Slope(vertebrae);
  measurements.tpa = measureTPA(vertebrae, pelvis);

  if (pelvis) {
    measurements.coronalBalance = measureCoronalBalance(vertebrae, pelvis, options.calibration);

    if (cobb.apexVertebra) {
      const apex = vertebrae.find((v) => v.level === cobb.apexVertebra);
      if (apex) measurements.apicalTranslation = measureApicalTranslation(apex, pelvis, options.calibration);
    }

    const pelvicParams = measurePelvicParameters(pelvis, options.calibration, conventions);
    measurements.sacralSlope = pelvicParams.sacralSlope;
    measurements.pelvicTilt = pelvicParams.pelvicTilt;
    measurements.pelvicIncidence = pelvicParams.pelvicIncidence;
    measurements.pelvicObliquity = measurePelvicObliquity(pelvis, conventions);

    if (pelvicParams.pelvicIncidence.value !== null && measurements.lumbarLordosis.value !== null) {
      measurements.piLlMismatch = measurePiLlMismatch(pelvicParams.pelvicIncidence.value, measurements.lumbarLordosis.value);
    }
  }

  const classifications = recomputeClassifications(radiograph, {
    ...(options.calibration ? { calibration: options.calibration } : {}),
    conventions,
  });

  return {
    source: 'manual',
    measurements,
    classifications,
    qc: { checks: [] },
    createdAt: new Date().toISOString(),
  };
}
