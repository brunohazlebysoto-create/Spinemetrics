"""`torch.utils.data.Dataset` que junta `schema.py` (lectura del export de
la app), `preprocess.py` (Etapa 2) y `masks.py` (etiquetas) en pares
(imagen, máscara) listos para entrenar `model.VertebraSegmentationUNet`.

SPEC.md §12: cada muestra proviene de un estudio exportado por la app
(`src/storage/jsonExport.ts`) emparejado con la imagen original que el
usuario cargó — ver `schema.discover_dataset`.
"""
from __future__ import annotations

from pathlib import Path

import cv2
import numpy as np
import pydicom
import torch
from torch.utils.data import Dataset

from spinemetrics_training.masks import build_level_channel_masks
from spinemetrics_training.preprocess import apply_clahe, detect_spine_roi, normalize_intensity, resample_mask_with_roi, resample_with_affine
from spinemetrics_training.schema import SPINAL_LEVELS, SamplePaths, discover_dataset, load_study_export, trustworthy_vertebrae


def load_image(path: str | Path) -> np.ndarray:
    """Carga una imagen en escala de grises como `float32` 2D. Para DICOM,
    aplica `RescaleSlope`/`RescaleIntercept` y corrige `MONOCHROME1` —
    mismo tratamiento que `src/imaging/loadDicom.ts` en la aplicación, para
    que el modelo entrene sobre exactamente los valores de píxel que verá
    en inferencia."""
    path = Path(path)
    if path.suffix.lower() == ".dcm":
        dataset = pydicom.dcmread(path)
        pixels = dataset.pixel_array.astype(np.float32)
        slope = float(getattr(dataset, "RescaleSlope", 1))
        intercept = float(getattr(dataset, "RescaleIntercept", 0))
        pixels = pixels * slope + intercept
        if str(getattr(dataset, "PhotometricInterpretation", "")) == "MONOCHROME1":
            pixels = pixels.max() - pixels
        return pixels

    image = cv2.imread(str(path), cv2.IMREAD_GRAYSCALE)
    if image is None:
        raise ValueError(f"No se pudo leer la imagen: {path}")
    return image.astype(np.float32)


class VertebraSegmentationDataset(Dataset):
    """Cada muestra es `(imagen, máscara)`:
    - `imagen`: tensor `(1, H, W)` float32 en `[0, 1]`.
    - `máscara`: tensor `(len(SPINAL_LEVELS), H, W)` float32 en `{0, 1}`.

    `H, W = target_size[1], target_size[0]` tras el preprocesado de la
    Etapa 2 (recorte de ROI + remuestreo).
    """

    def __init__(self, samples: list[SamplePaths], target_size: tuple[int, int] = (512, 1024)) -> None:
        self.samples = samples
        self.target_size = target_size

    @classmethod
    def from_directory(cls, directory: str | Path, target_size: tuple[int, int] = (512, 1024)) -> "VertebraSegmentationDataset":
        return cls(discover_dataset(directory), target_size=target_size)

    def __len__(self) -> int:
        return len(self.samples)

    def __getitem__(self, index: int) -> tuple[torch.Tensor, torch.Tensor]:
        paths = self.samples[index]
        image = load_image(paths.image_path)
        study = load_study_export(paths.json_path)

        if len(study.radiographs) != 1:
            raise ValueError(
                f"{paths.json_path}: se esperaba exactamente 1 radiografía por estudio exportado "
                f"(la aplicación, en su fase actual, exporta un único `Radiograph` activo por `Study`), "
                f"había {len(study.radiographs)}."
            )
        radiograph = study.radiographs[0]
        source = study.measurement_sources[0] if study.measurement_sources else "auto"
        vertebrae = trustworthy_vertebrae(radiograph, source)

        normalized = normalize_intensity(image)
        image_u8 = (normalized * 255).astype(np.uint8)
        enhanced = apply_clahe(image_u8)
        roi = detect_spine_roi(enhanced)
        resampled_image, _transform = resample_with_affine(enhanced, roi, self.target_size)

        raw_masks = build_level_channel_masks(vertebrae, shape=image.shape[:2])
        resampled_masks = resample_mask_with_roi(raw_masks, roi, self.target_size)

        image_tensor = torch.from_numpy(resampled_image.astype(np.float32) / 255.0).unsqueeze(0)
        mask_tensor = torch.from_numpy(resampled_masks)
        return image_tensor, mask_tensor
