/**
 * Fuente de imagen ya decodificada, lista para dibujar en el visor.
 * `ui/Viewer` sólo conoce esta interfaz, nunca los detalles de DICOM ni de
 * los formatos ráster — eso vive en `imaging/loadRasterImage.ts` y
 * `imaging/loadDicom.ts`.
 */

export interface RasterImageSource {
  kind: 'raster';
  bitmap: ImageBitmap;
  width: number;
  height: number;
}

/**
 * Imagen DICOM: se conservan los valores de píxel crudos (tras
 * `RescaleSlope`/`RescaleIntercept`) para poder aplicar window/level en
 * vivo en el visor (SPEC.md §10.2), en vez de hornear un window/level fijo
 * en un bitmap ya renderizado.
 */
export interface DicomImageSource {
  kind: 'dicom';
  width: number;
  height: number;
  pixelData: Float32Array;
  defaultWindowCenter: number;
  defaultWindowWidth: number;
  /** DICOM `PhotometricInterpretation` MONOCHROME1: los valores altos se
   * muestran oscuros por defecto; el visor debe invertir la rampa. */
  monochrome1: boolean;
}

export type ImageSource = RasterImageSource | DicomImageSource;
