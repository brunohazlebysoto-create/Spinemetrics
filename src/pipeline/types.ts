/**
 * Tipos compartidos del pipeline automático. SPEC.md §8. `pipeline/` puede
 * depender de `core/` (motor de medición y clasificación) pero nunca al
 * revés (SPEC.md §4, regla de arquitectura no negociable): todo lo de aquí
 * termina alimentando exactamente el mismo `VertebraAnnotation`/
 * `PelvicAnnotation` que produce la anotación manual, sin ninguna ruta de
 * cálculo alternativa.
 */

/** Imagen en escala de grises, fila por fila, sin ninguna dependencia de
 * `ImageBitmap`/canvas — así los algoritmos del pipeline se pueden probar
 * en Node sin DOM (`vitest.config.ts` usa `environment: 'node'`). El puente
 * desde `imaging/types.ts` (`ImageSource`) vive en `pipeline/imageAdapter.ts`,
 * que sí necesita el navegador y por tanto no se prueba unitariamente aquí. */
export interface GrayscaleImage {
  width: number;
  height: number;
  /** Longitud `width * height`, fila por fila (row-major), rango de
   * intensidad arbitrario (no normalizado). */
  data: Float32Array;
}

/** Región de la columna dentro de la imagen completa, semiabierta en ambos
 * ejes: `[x0, x1) × [y0, y1)`. Misma convención que `training/preprocess.py`
 * (`Roi = tuple[int, int, int, int]`). */
export interface SpineRoi {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * Transformación afín, sin rotación, del espacio ORIGINAL al REMUESTREADO:
 * `resampled = original * scale + offset` por eje. SPEC.md §8 Etapa 2:
 * "conservar la transformación afín: todas las mediciones se calculan en el
 * espacio de la imagen original, nunca en el remuestreado." Misma
 * construcción que `training/preprocess.py::AffineTransform`, para que el
 * comportamiento en Python (entrenamiento) y TypeScript (inferencia) se
 * pueda auditar en paralelo.
 */
export interface AffineTransform2D {
  scaleX: number;
  scaleY: number;
  offsetX: number;
  offsetY: number;
}

export function identityTransform(): AffineTransform2D {
  return { scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 };
}

export function applyAffine(point: { x: number; y: number }, t: AffineTransform2D): { x: number; y: number } {
  return { x: point.x * t.scaleX + t.offsetX, y: point.y * t.scaleY + t.offsetY };
}

/** Inversa de `applyAffine`: remuestreado → original. SPEC.md §13.7:
 * "landmarks detectados en el espacio remuestreado y devueltos al original
 * conservan la posición dentro de 0.5 px." */
export function applyAffineInverse(point: { x: number; y: number }, t: AffineTransform2D): { x: number; y: number } {
  return { x: (point.x - t.offsetX) / t.scaleX, y: (point.y - t.offsetY) / t.scaleY };
}

export function composeAffine(first: AffineTransform2D, second: AffineTransform2D): AffineTransform2D {
  return {
    scaleX: first.scaleX * second.scaleX,
    scaleY: first.scaleY * second.scaleY,
    offsetX: first.offsetX * second.scaleX + second.offsetX,
    offsetY: first.offsetY * second.scaleY + second.offsetY,
  };
}

/**
 * Confianza honesta de una detección heurística. SPEC.md §8.1: "Confianza
 * de segmentación de una vértebra <0.7 → marcarla no fiable." Sin modelo
 * entrenado (ver `training/README.md`), esta confianza se deriva de
 * indicadores geométricos reales del propio heurístico (regularidad del
 * patrón de bandas, calidad del ajuste del contorno) — **nunca** una
 * constante fija que finja precisión. Ver `pipeline/README.md`.
 */
export interface DetectionConfidence {
  value: number;
  /** Por qué se asignó este valor — visible en la traza de decisión. */
  reason: string;
}
