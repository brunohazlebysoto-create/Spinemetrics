"""Fixtures compartidas. Construyen a mano el mismo JSON que produciría
`src/storage/jsonExport.ts` (`serializeStudy`), para no depender de datos
reales en las pruebas."""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pytest


def make_point(x: float, y: float) -> dict:
    return {"x": x, "y": y}


def make_vertebra(level: str, x_center: float, y_center: float, half_width: float = 20, half_height: float = 15, **extra) -> dict:
    d = {
        "level": level,
        "superiorEndplate": [
            make_point(x_center - half_width, y_center - half_height),
            make_point(x_center + half_width, y_center - half_height),
        ],
        "inferiorEndplate": [
            make_point(x_center - half_width, y_center + half_height),
            make_point(x_center + half_width, y_center + half_height),
        ],
    }
    d.update(extra)
    return d


def make_study_export(
    *,
    patient_ref: str = "SM-test",
    date: str = "2026-01-15",
    age_years: float = 14,
    vertebrae: list[dict] | None = None,
    measurement_source: str = "manual",
    radiograph_id: str = "r1",
    view: str = "PA_standing",
    format_version: int = 1,
) -> dict:
    if vertebrae is None:
        vertebrae = [make_vertebra("T5", 100, 100), make_vertebra("T12", 100, 300)]
    return {
        "formatVersion": format_version,
        "exportedAt": "2026-01-15T00:00:00.000Z",
        "study": {
            "patientRef": patient_ref,
            "date": date,
            "ageYears": age_years,
            "radiographs": [
                {
                    "id": radiograph_id,
                    "view": view,
                    "annotations": {"vertebrae": vertebrae},
                }
            ],
            "measurementSets": [
                {
                    "source": measurement_source,
                    "measurements": {},
                    "classifications": {},
                    "qc": {"checks": []},
                    "createdAt": "2026-01-15T00:00:00.000Z",
                }
            ],
        },
    }


@pytest.fixture
def study_export_dict() -> dict:
    return make_study_export()


@pytest.fixture
def synthetic_image() -> np.ndarray:
    """Imagen sintética en escala de grises, 400×800 (ancho×alto)."""
    rng = np.random.default_rng(0)
    return rng.integers(0, 256, size=(800, 400), dtype=np.uint8)


@pytest.fixture
def dataset_dir(tmp_path: Path, study_export_dict: dict) -> Path:
    """Un directorio de dataset con un único par (json, png) válido."""
    import cv2

    image = np.zeros((800, 400), dtype=np.uint8)
    cv2.imwrite(str(tmp_path / "sample_001.png"), image)
    (tmp_path / "sample_001.json").write_text(json.dumps(study_export_dict))
    return tmp_path
