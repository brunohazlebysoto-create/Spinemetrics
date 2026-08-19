"""Arquitectura del segmentador vertebral.

SPEC.md §8 Etapa 3: "Usar segmentación de instancias, no regresión directa
de landmarks (U-Net/nnU-Net o Mask R-CNN): es más robusto y rinde mejor en
la literatura." U-Net: Ronneberger O, Fischer P, Brox T. "U-Net:
Convolutional Networks for Biomedical Image Segmentation." MICCAI 2015.

Un canal de salida por cada nivel vertebral posible
(`schema.SPINAL_LEVELS`) — ver `masks.py` para el porqué de esta
representación de "segmentación de instancias por canal".
"""
from __future__ import annotations

import torch
import torch.nn as nn
import torch.nn.functional as F

from spinemetrics_training.schema import SPINAL_LEVELS


class DoubleConv(nn.Module):
    """(Conv3×3 → BatchNorm → ReLU) × 2, el bloque básico del U-Net."""

    def __init__(self, in_channels: int, out_channels: int) -> None:
        super().__init__()
        self.block = nn.Sequential(
            nn.Conv2d(in_channels, out_channels, kernel_size=3, padding=1, bias=False),
            nn.BatchNorm2d(out_channels),
            nn.ReLU(inplace=True),
            nn.Conv2d(out_channels, out_channels, kernel_size=3, padding=1, bias=False),
            nn.BatchNorm2d(out_channels),
            nn.ReLU(inplace=True),
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.block(x)


class Down(nn.Module):
    """MaxPool 2× seguido de `DoubleConv`: una etapa de bajada del encoder."""

    def __init__(self, in_channels: int, out_channels: int) -> None:
        super().__init__()
        self.block = nn.Sequential(nn.MaxPool2d(2), DoubleConv(in_channels, out_channels))

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.block(x)


class Up(nn.Module):
    """Sobremuestreo 2× (deconvolución), concatenación con la conexión de
    salto correspondiente del encoder, y `DoubleConv`: una etapa de subida
    del decoder."""

    def __init__(self, in_channels: int, skip_channels: int, out_channels: int) -> None:
        super().__init__()
        self.upsample = nn.ConvTranspose2d(in_channels, in_channels // 2, kernel_size=2, stride=2)
        self.conv = DoubleConv(in_channels // 2 + skip_channels, out_channels)

    def forward(self, x: torch.Tensor, skip: torch.Tensor) -> torch.Tensor:
        x = self.upsample(x)
        # Si la entrada no es múltiplo de 2^profundidad, el tamaño espacial
        # tras sobremuestrear puede diferir en 1 px del de la conexión de
        # salto; se recorta/rellena para poder concatenar.
        diff_y = skip.shape[2] - x.shape[2]
        diff_x = skip.shape[3] - x.shape[3]
        x = F.pad(x, [diff_x // 2, diff_x - diff_x // 2, diff_y // 2, diff_y - diff_y // 2])
        return self.conv(torch.cat([skip, x], dim=1))


class VertebraSegmentationUNet(nn.Module):
    """U-Net para segmentación multicanal de vértebras.

    Entrada: `(N, in_channels, H, W)`, imagen en escala de grises ya
    preprocesada (`preprocess.py`). Salida: `(N, num_classes, H, W)`,
    logits — aplicar `sigmoid` fuera del modelo (se entrena con
    `BCEWithLogitsLoss`, numéricamente más estable). `H` y `W` deben ser
    múltiplos de `2**depth` para un resultado exacto sin relleno.
    """

    def __init__(self, in_channels: int = 1, num_classes: int = len(SPINAL_LEVELS), base_channels: int = 32, depth: int = 4) -> None:
        super().__init__()
        if depth < 1:
            raise ValueError(f"depth debe ser ≥1, se recibió {depth}.")

        self.in_conv = DoubleConv(in_channels, base_channels)

        self.down_blocks = nn.ModuleList()
        channels = base_channels
        for _ in range(depth):
            self.down_blocks.append(Down(channels, channels * 2))
            channels *= 2

        self.up_blocks = nn.ModuleList()
        for _ in range(depth):
            skip_channels = channels // 2
            self.up_blocks.append(Up(channels, skip_channels, skip_channels))
            channels //= 2

        self.out_conv = nn.Conv2d(channels, num_classes, kernel_size=1)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        skips = [self.in_conv(x)]
        for down in self.down_blocks:
            skips.append(down(skips[-1]))

        x = skips[-1]
        for i, up in enumerate(self.up_blocks):
            skip = skips[-(i + 2)]
            x = up(x, skip)

        return self.out_conv(x)
