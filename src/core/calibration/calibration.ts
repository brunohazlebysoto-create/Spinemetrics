/**
 * Calibración px→mm. SPEC.md §6.
 *
 * "Los ángulos no requieren calibración; las distancias sí." Esta unidad
 * sólo se ocupa de la conversión lineal; ninguna función de ángulo de
 * `core/measurements` depende de ella.
 */
import type { CalibrationMethod, MeasurementStatus } from '../models/types';

export interface Calibration {
  pxPerMm: number;
  method: CalibrationMethod;
  /** SID/SOD cuando se pudo calcular (sólo `method === 'dicom'` vía
   * ImagerPixelSpacing). */
  magnification?: number;
  /** true si se usó ImagerPixelSpacing sin poder corregir la magnificación
   * porque faltan `DistanceSourceToDetector`/`DistanceSourceToPatient`
   * (`docs/OPEN_QUESTIONS.md` #35). Nunca se asume un factor fijo. */
  uncorrectedMagnification?: boolean;
}

export interface DicomCalibrationInput {
  /** DICOM `PixelSpacing` (0028,0030): [espaciado entre filas, espaciado
   * entre columnas], mm, medido en el plano del paciente. Prioridad sobre
   * `imagerPixelSpacing`. */
  pixelSpacing?: [number, number];
  /** DICOM `ImagerPixelSpacing` (0018,1164): espaciado en el plano del
   * detector, mm. Requiere corrección de magnificación. */
  imagerPixelSpacing?: [number, number];
  /** DICOM `DistanceSourceToDetector` (0018,1110), mm (SID). */
  distanceSourceToDetector?: number;
  /** DICOM `DistanceSourceToPatient` (0018,1111), mm (SOD). */
  distanceSourceToPatient?: number;
}

function averageSpacingMm(spacing: [number, number]): number {
  return (spacing[0] + spacing[1]) / 2;
}

/**
 * SPEC.md §6: usar `PixelSpacing`; si falta, `ImagerPixelSpacing` con
 * corrección de magnificación mediante `DistanceSourceToDetector` y
 * `DistanceSourceToPatient`. Si esos tags no están, no corregir y marcar
 * `uncorrectedMagnification`. Devuelve `null` si no hay ningún tag de
 * espaciado disponible (calibración por regla, ver `calibrationFromRuler`).
 */
export function calibrationFromDicom(input: DicomCalibrationInput): Calibration | null {
  if (input.pixelSpacing) {
    const spacingMm = averageSpacingMm(input.pixelSpacing);
    return { pxPerMm: 1 / spacingMm, method: 'dicom' };
  }

  if (input.imagerPixelSpacing) {
    const detectorSpacingMm = averageSpacingMm(input.imagerPixelSpacing);
    if (input.distanceSourceToDetector && input.distanceSourceToPatient) {
      const magnification = input.distanceSourceToDetector / input.distanceSourceToPatient;
      const patientPlaneSpacingMm = detectorSpacingMm / magnification;
      return { pxPerMm: 1 / patientPlaneSpacingMm, method: 'dicom', magnification };
    }
    return { pxPerMm: 1 / detectorSpacingMm, method: 'dicom', uncorrectedMagnification: true };
  }

  return null;
}

/**
 * SPEC.md §6: "Sin metadatos, el usuario traza una línea sobre un objeto de
 * longitud conocida e introduce el valor en mm." `pxLength` es la longitud
 * en píxeles de esa línea trazada manualmente.
 */
export function calibrationFromRuler(pxLength: number, knownLengthMm: number): Calibration {
  return { pxPerMm: pxLength / knownLengthMm, method: 'ruler' };
}

/** Variante de calibración por objeto esférico de diámetro conocido (p. ej.
 * esfera radiopaca de calibración), modelo de datos §5 (`calibration.method
 * === 'sphere'`). Misma aritmética que la regla; se distingue sólo por el
 * método registrado para trazabilidad en el informe. */
export function calibrationFromSphere(pxDiameter: number, knownDiameterMm: number): Calibration {
  return { pxPerMm: pxDiameter / knownDiameterMm, method: 'sphere' };
}

export interface DistanceConversion {
  valueMm: number | null;
  status: MeasurementStatus;
  reason?: string;
}

/**
 * Convierte una distancia en píxeles a mm usando una calibración, con el
 * semáforo de SPEC.md §8.1: sin calibración, la distancia sale en gris con
 * el motivo; con magnificación no corregida, sale en ámbar. Usada por toda
 * medición lineal de `core/measurements` (SVA, balance coronal, translación
 * apical, alturas vertebrales) para no duplicar esta lógica en cada una.
 */
export function convertPxToMm(distancePx: number, calibration: Calibration | undefined): DistanceConversion {
  if (!calibration) {
    return {
      valueMm: null,
      status: 'unavailable',
      reason: 'Sin calibración: la distancia no se puede expresar en mm.',
    };
  }
  const valueMm = distancePx / calibration.pxPerMm;
  if (calibration.uncorrectedMagnification) {
    return {
      valueMm,
      status: 'warning',
      reason:
        'Magnificación no corregida: faltan DistanceSourceToDetector/DistanceSourceToPatient en el DICOM.',
    };
  }
  return { valueMm, status: 'ok' };
}
