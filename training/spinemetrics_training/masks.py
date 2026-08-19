"""Rasteriza anotaciones de vértebras a máscaras de entrenamiento.

SPEC.md §8 Etapa 3: "Usar segmentación de instancias, no regresión directa
de landmarks [...]. De cada máscara se extraen las 4 esquinas mediante el
rectángulo de área mínima [...]." Este módulo construye el lado de las
etiquetas (anotación → máscara); `corners.py` hace el camino inverso
(máscara → esquinas), que es lo que ejecuta el modelo en inferencia.

Cada nivel vertebral posible (`schema.SPINAL_LEVELS`) tiene su propio canal
de máscara binaria: es una forma sencilla y determinista de resolver la
"segmentación de instancias" sin necesitar post-procesado de separación de
instancias (p. ej. watershed) — el nivel de una vértebra IS su identidad de
instancia. Esto también resuelve gran parte de la Etapa 4 (etiquetado de
niveles) directamente en el propio modelo, en vez de como un paso separado
de conteo desde S1.
"""
from __future__ import annotations

import cv2
import numpy as np

from spinemetrics_training.schema import SPINAL_LEVELS, VertebraAnnotation

LEVEL_TO_CHANNEL: dict[str, int] = {level: i for i, level in enumerate(SPINAL_LEVELS)}


def vertebra_polygon(vertebra: VertebraAnnotation) -> np.ndarray:
    """Los 4 puntos de la vértebra en orden de perímetro simple (no
    cruzado): superior-izq → superior-der → inferior-der → inferior-izq."""
    sup_left, sup_right = vertebra.superior_endplate
    inf_left, inf_right = vertebra.inferior_endplate
    points = [sup_left, sup_right, inf_right, inf_left]
    return np.array([[p.x, p.y] for p in points], dtype=np.float32)


def rasterize_vertebra(vertebra: VertebraAnnotation, shape: tuple[int, int]) -> np.ndarray:
    """Máscara booleana `(height, width)` del cuadrilátero de `vertebra`."""
    height, width = shape
    mask = np.zeros((height, width), dtype=np.uint8)
    polygon = np.round(vertebra_polygon(vertebra)).astype(np.int32)
    cv2.fillPoly(mask, [polygon], color=1)
    return mask.astype(bool)


def build_level_channel_masks(vertebrae: list[VertebraAnnotation], shape: tuple[int, int]) -> np.ndarray:
    """Máscara multicanal `(len(SPINAL_LEVELS), height, width)`, float32 en
    {0, 1}. El canal `i` es la máscara binaria del nivel `SPINAL_LEVELS[i]`.

    Lanza `ValueError` ante un nivel no reconocido en vez de ignorarlo en
    silencio (SPEC.md §17.9).
    """
    height, width = shape
    channels = np.zeros((len(SPINAL_LEVELS), height, width), dtype=np.float32)
    for vertebra in vertebrae:
        channel_index = LEVEL_TO_CHANNEL.get(vertebra.level)
        if channel_index is None:
            raise ValueError(f"Nivel vertebral no reconocido: {vertebra.level!r}.")
        mask = rasterize_vertebra(vertebra, shape)
        channels[channel_index] = np.logical_or(channels[channel_index] > 0, mask).astype(np.float32)
    return channels
