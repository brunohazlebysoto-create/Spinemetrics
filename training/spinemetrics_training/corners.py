"""Extrae las 4 esquinas de una vértebra a partir de su máscara predicha.

SPEC.md §8 Etapa 3: "De cada máscara se extraen las 4 esquinas mediante el
rectángulo de área mínima, refinando cada esquina con el gradiente local."
Es el camino inverso de `masks.rasterize_vertebra`: en entrenamiento se usa
para verificar que el proceso es reversible sobre las propias etiquetas; en
inferencia (Fase 3, pendiente) sería el post-procesado de la salida del
modelo.
"""
from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np

from spinemetrics_training.schema import Point


@dataclass(frozen=True)
class VertebraCorners:
    """Mismo orden que `superiorEndplate`/`inferiorEndplate` en
    `src/core/models/types.ts`: izquierda, derecha."""

    superior_left: Point
    superior_right: Point
    inferior_left: Point
    inferior_right: Point


def order_corners(box: np.ndarray) -> VertebraCorners:
    """Ordena 4 puntos de un rectángulo (en cualquier orden de entrada,
    como los que devuelve `cv2.boxPoints`) asumiendo craneal = y menor."""
    points = sorted(box.tolist(), key=lambda p: p[1])
    top_two = sorted(points[:2], key=lambda p: p[0])
    bottom_two = sorted(points[2:], key=lambda p: p[0])
    (sup_left_x, sup_left_y), (sup_right_x, sup_right_y) = top_two
    (inf_left_x, inf_left_y), (inf_right_x, inf_right_y) = bottom_two
    return VertebraCorners(
        superior_left=Point(sup_left_x, sup_left_y),
        superior_right=Point(sup_right_x, sup_right_y),
        inferior_left=Point(inf_left_x, inf_left_y),
        inferior_right=Point(inf_right_x, inf_right_y),
    )


def min_area_rect_corners(mask: np.ndarray) -> VertebraCorners | None:
    """`None` si `mask` no contiene ningún contorno con área."""
    mask_u8 = mask.astype(np.uint8)
    contours, _ = cv2.findContours(mask_u8, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return None
    largest = max(contours, key=cv2.contourArea)
    if cv2.contourArea(largest) == 0:
        return None
    rect = cv2.minAreaRect(largest)
    box = cv2.boxPoints(rect)
    return order_corners(box)


def gradient_magnitude(image: np.ndarray) -> np.ndarray:
    gx = cv2.Sobel(image.astype(np.float32), cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(image.astype(np.float32), cv2.CV_32F, 0, 1, ksize=3)
    return np.hypot(gx, gy)


def refine_corner(point: Point, gradient: np.ndarray, window: int = 5) -> Point:
    """Ajusta `point` al píxel de máximo gradiente dentro de una ventana
    `(2·window+1)²` a su alrededor. Si la ventana cae fuera de la imagen,
    devuelve `point` sin modificar."""
    height, width = gradient.shape
    cx, cy = int(round(point.x)), int(round(point.y))
    x0, x1 = max(0, cx - window), min(width, cx + window + 1)
    y0, y1 = max(0, cy - window), min(height, cy + window + 1)
    if x1 <= x0 or y1 <= y0:
        return point
    patch = gradient[y0:y1, x0:x1]
    local_y, local_x = np.unravel_index(np.argmax(patch), patch.shape)
    return Point(float(x0 + local_x), float(y0 + local_y))


def extract_vertebra_corners(mask: np.ndarray, image: np.ndarray | None = None, refine_window: int = 5) -> VertebraCorners | None:
    """Esquinas del rectángulo de área mínima de `mask`, refinadas por
    gradiente local si se aporta `image` (misma forma que `mask`, espacio
    de imagen remuestreado). Sin `image`, devuelve las esquinas del
    rectángulo sin refinar."""
    corners = min_area_rect_corners(mask)
    if corners is None or image is None:
        return corners
    grad = gradient_magnitude(image)
    return VertebraCorners(
        superior_left=refine_corner(corners.superior_left, grad, refine_window),
        superior_right=refine_corner(corners.superior_right, grad, refine_window),
        inferior_left=refine_corner(corners.inferior_left, grad, refine_window),
        inferior_right=refine_corner(corners.inferior_right, grad, refine_window),
    )
