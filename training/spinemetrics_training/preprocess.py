"""Preprocesado de imagen. SPEC.md §8 Etapa 2: "Normalización de
intensidad, CLAHE para realzar bordes corticales, detección de la ROI de
la columna, remuestreo a la resolución de entrada del modelo. Conservar la
transformación afín: todas las mediciones se calculan en el espacio de la
imagen original, nunca en el remuestreado."

`detect_spine_roi` es un heurístico de referencia (varianza de columna),
**no** el detector de ROI final del pipeline — ese exigiría su propio
modelo entrenado, fuera del alcance de este andamiaje (el usuario pidió
sólo preparar el entrenamiento, no la inferencia en `src/pipeline/`).
Está aquí para que el resto del preprocesado (recorte + remuestreo con
transformación afín) se pueda ejercitar y probar de extremo a extremo.
"""
from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np

from spinemetrics_training.schema import Point

Roi = tuple[int, int, int, int]  # (x0, y0, x1, y1), semiabierto: [x0,x1) × [y0,y1)


@dataclass(frozen=True)
class AffineTransform:
    """Mapea puntos del espacio ORIGINAL al espacio REMUESTREADO:
    `resampled = original * scale + offset` (por eje, sin rotación — el
    pipeline de SpineMetrics nunca rota la imagen, sólo recorta y
    escala)."""

    scale_x: float
    scale_y: float
    offset_x: float = 0.0
    offset_y: float = 0.0

    @staticmethod
    def identity() -> "AffineTransform":
        return AffineTransform(1.0, 1.0, 0.0, 0.0)

    def apply(self, point: Point) -> Point:
        """Original → remuestreado."""
        return Point(point.x * self.scale_x + self.offset_x, point.y * self.scale_y + self.offset_y)

    def apply_inverse(self, point: Point) -> Point:
        """Remuestreado → original. SPEC.md §13.7: "landmarks detectados en
        el espacio remuestreado y devueltos al original conservan la
        posición dentro de 0.5 px."""
        return Point((point.x - self.offset_x) / self.scale_x, (point.y - self.offset_y) / self.scale_y)

    def compose(self, other: "AffineTransform") -> "AffineTransform":
        """Transformación equivalente a aplicar primero `self` y luego
        `other`: `other.apply(self.apply(point))` para cualquier `point`."""
        return AffineTransform(
            scale_x=self.scale_x * other.scale_x,
            scale_y=self.scale_y * other.scale_y,
            offset_x=self.offset_x * other.scale_x + other.offset_x,
            offset_y=self.offset_y * other.scale_y + other.offset_y,
        )


def normalize_intensity(image: np.ndarray, low_percentile: float = 1.0, high_percentile: float = 99.0) -> np.ndarray:
    """Normaliza a `float32` en `[0, 1]` recortando por percentiles (robusto
    a valores atípicos de saturación/aire, frecuentes en radiografía)."""
    image = image.astype(np.float32)
    low, high = (float(v) for v in np.percentile(image, [low_percentile, high_percentile]))
    if high <= low:
        return np.zeros_like(image, dtype=np.float32)
    normalized = (image - low) / (high - low)
    return np.clip(normalized, 0.0, 1.0).astype(np.float32)


def apply_clahe(image_uint8: np.ndarray, clip_limit: float = 2.0, tile_grid_size: tuple[int, int] = (8, 8)) -> np.ndarray:
    """CLAHE (contrast-limited adaptive histogram equalization) para
    realzar bordes corticales (SPEC.md §8 Etapa 2). Espera `uint8`."""
    clahe = cv2.createCLAHE(clipLimit=clip_limit, tileGridSize=tile_grid_size)
    return clahe.apply(image_uint8)


def detect_spine_roi(image: np.ndarray, min_width_fraction: float = 0.3, margin_fraction: float = 0.15) -> Roi:
    """Heurístico de referencia: conserva la banda de columnas con mayor
    varianza de intensidad (donde se concentra el contraste cortical de la
    columna en una PA/lateral centrada), con un margen. Conserva siempre
    toda la altura — recortar craneal/caudal exige saber dónde empieza y
    termina la columna, que sí depende de un modelo real."""
    height, width = image.shape[:2]
    column_variance = image.astype(np.float32).var(axis=0)
    threshold = column_variance.max() * 0.2
    active_columns = np.where(column_variance >= threshold)[0]
    if len(active_columns) == 0:
        return (0, 0, width, height)

    x0, x1 = int(active_columns[0]), int(active_columns[-1]) + 1
    margin = int((x1 - x0) * margin_fraction)
    x0 = max(0, x0 - margin)
    x1 = min(width, x1 + margin)

    min_width = int(width * min_width_fraction)
    if x1 - x0 < min_width:
        center = (x0 + x1) // 2
        x0 = max(0, center - min_width // 2)
        x1 = min(width, x0 + min_width)

    return (x0, 0, x1, height)


def resample_with_affine(image: np.ndarray, roi: Roi, target_size: tuple[int, int]) -> tuple[np.ndarray, AffineTransform]:
    """Recorta a `roi` y remuestrea a `target_size = (ancho, alto)`,
    devolviendo también la `AffineTransform` que mapea el espacio original
    al remuestreado — SPEC.md §8 Etapa 2, "conservar la transformación
    afín"."""
    x0, y0, x1, y1 = roi
    cropped = image[y0:y1, x0:x1]
    cropped_height, cropped_width = cropped.shape[:2]
    if cropped_height == 0 or cropped_width == 0:
        raise ValueError(f"ROI vacía: {roi!r} sobre una imagen de forma {image.shape!r}.")

    target_width, target_height = target_size
    scale_x = target_width / cropped_width
    scale_y = target_height / cropped_height
    resized = cv2.resize(cropped, (target_width, target_height), interpolation=cv2.INTER_LINEAR)

    crop_transform = AffineTransform(1.0, 1.0, offset_x=-x0, offset_y=-y0)
    resize_transform = AffineTransform(scale_x, scale_y)
    return resized, crop_transform.compose(resize_transform)


def resample_mask_with_roi(mask_channels: np.ndarray, roi: Roi, target_size: tuple[int, int]) -> np.ndarray:
    """Aplica el mismo recorte + remuestreo que `resample_with_affine` a una
    máscara multicanal `(C, H, W)`, para que quede alineada píxel a píxel
    con la imagen remuestreada correspondiente. Usa interpolación por
    vecino más cercano (no lineal): una máscara binaria no debe adquirir
    valores fraccionarios por el remuestreo."""
    x0, y0, x1, y1 = roi
    num_channels = mask_channels.shape[0]
    target_width, target_height = target_size
    out = np.zeros((num_channels, target_height, target_width), dtype=np.float32)
    for channel in range(num_channels):
        cropped = mask_channels[channel, y0:y1, x0:x1]
        out[channel] = cv2.resize(cropped, (target_width, target_height), interpolation=cv2.INTER_NEAREST)
    return out
