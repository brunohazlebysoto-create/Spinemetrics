/**
 * Carga de DICOM (`.dcm`, incluida serie multiframe). SPEC.md §2.1, §3
 * ("Visor DICOM: `@cornerstonejs/core` + `@cornerstonejs/dicom-image-loader`
 * (window/level, VOI LUT, pixel spacing)"), §6 (calibración), §11
 * (anonimización), §8 Etapa 0.
 *
 * Dos vías deliberadamente separadas sobre el mismo archivo:
 * - `dicom-parser` (directo, sin pasar por Cornerstone) para leer los tags
 *   crudos que alimentan la anonimización (§11) y la calibración (§6) —
 *   así el comportamiento de calibración es exactamente el probado en
 *   `core/calibration/calibration.test.ts`, no una resolución interna
 *   opaca de la librería de visualización.
 * - `@cornerstonejs/core` + `@cornerstonejs/dicom-image-loader` para
 *   decodificar los píxeles (soporta las sintaxis de transferencia
 *   comprimidas sin reimplementar códecs).
 *
 * La clasificación real de la proyección (PA/lateral/bending...) con
 * control de confianza es la Etapa 1 del pipeline automático (SPEC.md §8,
 * Fase 3). Aquí sólo hay una pista heurística de bajo riesgo para
 * preseleccionar un valor por defecto editable por el usuario.
 */
import * as dicomParser from 'dicom-parser';
import { imageLoader, init as coreInit } from '@cornerstonejs/core';
import type { IImage } from '@cornerstonejs/core/types';
import cornerstoneDICOMImageLoader from '@cornerstonejs/dicom-image-loader';
import { calibrationFromDicom, type Calibration, type DicomCalibrationInput } from '../core/calibration/calibration';
import { anonymizeDicomDataset, type AnonymizationOptions, type AnonymizationResult } from './anonymize';
import type { RadiographView } from '../core/models/types';
import type { DicomImageSource } from './types';

let initialized = false;

/** Inicializa Cornerstone3D y su cargador DICOM una única vez por sesión.
 * Ambos son puramente locales: no hay ninguna URL remota configurada. */
function ensureCornerstoneInitialized(): void {
  if (initialized) return;
  coreInit();
  const hardwareConcurrency = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : undefined;
  cornerstoneDICOMImageLoader.init({ maxWebWorkers: Math.max(1, (hardwareConcurrency ?? 2) - 1) });
  initialized = true;
}

function readPixelSpacingPair(dataSet: dicomParser.DataSet, tag: string): [number, number] | undefined {
  const row = dataSet.floatString(tag, 0);
  const col = dataSet.floatString(tag, 1);
  if (row === undefined || col === undefined) return undefined;
  return [row, col];
}

/** SPEC.md §6. Lee los tags DICOM crudos y delega toda la lógica de
 * decisión en `core/calibration/calibration.ts` (Fase 1, ya probada). */
export function extractCalibration(dataSet: dicomParser.DataSet): Calibration | null {
  const input: DicomCalibrationInput = {};

  const pixelSpacing = readPixelSpacingPair(dataSet, 'x00280030');
  if (pixelSpacing) input.pixelSpacing = pixelSpacing;

  const imagerPixelSpacing = readPixelSpacingPair(dataSet, 'x00181164');
  if (imagerPixelSpacing) input.imagerPixelSpacing = imagerPixelSpacing;

  const distanceSourceToDetector = dataSet.floatString('x00181110', 0);
  if (distanceSourceToDetector !== undefined) input.distanceSourceToDetector = distanceSourceToDetector;

  const distanceSourceToPatient = dataSet.floatString('x00181111', 0);
  if (distanceSourceToPatient !== undefined) input.distanceSourceToPatient = distanceSourceToPatient;

  return calibrationFromDicom(input);
}

/**
 * Pista heurística de proyección a partir de `ViewPosition`/
 * `SeriesDescription`, **no** la clasificación automática real (SPEC.md §8
 * Etapa 1, Fase 3, con control de confianza <0.9). Sólo sirve para
 * preseleccionar un valor que el usuario puede cambiar sin coste — nunca
 * bloquea ni se muestra como si fuera fiable.
 */
export function guessRadiographView(dataSet: dicomParser.DataSet): RadiographView | null {
  const viewPosition = dataSet.string('x00185101')?.toUpperCase() ?? '';
  const seriesDescription = dataSet.string('x0008103e')?.toUpperCase() ?? '';
  const text = `${viewPosition} ${seriesDescription}`.trim();
  if (!text) return null;

  // 'LL'/'RL' son los códigos DICOM estándar de ViewPosition para lateral
  // izquierda/derecha (PS3.16 CID 4014); 'LAT'/'LATERAL' aparecen sobre
  // todo en SeriesDescription en texto libre.
  if (/\b(LAT(ERAL)?|LL|RL)\b/.test(text)) return 'LAT_standing';
  if (/BEND.*(LEFT|IZQ)|LEFT.*BEND/.test(text)) return 'BEND_left';
  if (/BEND.*(RIGHT|DER)|RIGHT.*BEND/.test(text)) return 'BEND_right';
  if (/FULCRUM/.test(text)) return 'FULCRUM';
  if (/TRACTION|TRACCION/.test(text)) return 'TRACTION';
  if (/\b(PA|AP)\b/.test(text)) return 'PA_standing';
  return null;
}

/** SPEC.md §5: "TRUE si `NumberOfFrames` > 1." Sólo informativo en la
 * Fase 2 (sin selector de fotograma en el visor todavía). */
export function isMultiframe(dataSet: dicomParser.DataSet): boolean {
  const frames = dataSet.intString('x00280008');
  return frames !== undefined && frames > 1;
}

export function applyRescale(pixelData: ArrayLike<number>, slope: number, intercept: number): Float32Array {
  const out = new Float32Array(pixelData.length);
  for (let i = 0; i < pixelData.length; i++) out[i] = pixelData[i]! * slope + intercept;
  return out;
}

export interface MinMax {
  min: number;
  max: number;
}

export function computeMinMax(pixelData: Float32Array): MinMax {
  let min = Infinity;
  let max = -Infinity;
  for (const value of pixelData) {
    if (value < min) min = value;
    if (value > max) max = value;
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: 0 };
  return { min, max };
}

function firstOf(value: number | number[] | undefined): number | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Construye la fuente de imagen DICOM a partir del `IImage` ya decodificado
 * por Cornerstone. Separado de `loadDicomFile` para poder probarlo sin el
 * pipeline asíncrono completo. */
export function buildDicomImageSource(image: IImage): DicomImageSource {
  const pixelData = applyRescale(image.getPixelData(), image.slope ?? 1, image.intercept ?? 0);
  const { min, max } = computeMinMax(pixelData);

  const windowCenter = firstOf(image.windowCenter) ?? (min + max) / 2;
  const windowWidth = firstOf(image.windowWidth) ?? Math.max(1, max - min);

  return {
    kind: 'dicom',
    width: image.columns,
    height: image.rows,
    pixelData,
    defaultWindowCenter: windowCenter,
    defaultWindowWidth: windowWidth,
    monochrome1: image.photometricInterpretation === 'MONOCHROME1',
  };
}

export interface LoadedDicom {
  image: DicomImageSource;
  calibration: Calibration | null;
  anonymization: AnonymizationResult;
  viewHint: RadiographView | null;
  multiframe: boolean;
}

/** SPEC.md §2.1: "Cargar DICOM (`.dcm`, incluida serie multiframe)." */
export async function loadDicomFile(file: File, anonymizationOptions: AnonymizationOptions = {}): Promise<LoadedDicom> {
  const buffer = await file.arrayBuffer();
  const dataSet = dicomParser.parseDicom(new Uint8Array(buffer));

  // SPEC.md §8 Etapa 0: la anonimización ocurre antes de cualquier otro
  // procesamiento — se hace aquí, antes de tocar Cornerstone.
  const anonymization = await anonymizeDicomDataset(dataSet, anonymizationOptions);
  const calibration = extractCalibration(dataSet);
  const viewHint = guessRadiographView(dataSet);
  const multiframe = isMultiframe(dataSet);

  ensureCornerstoneInitialized();
  const imageId = cornerstoneDICOMImageLoader.wadouri.fileManager.add(file);
  const cornerstoneImage = await imageLoader.loadImage(imageId);
  const image = buildDicomImageSource(cornerstoneImage);

  return { image, calibration, anonymization, viewHint, multiframe };
}
