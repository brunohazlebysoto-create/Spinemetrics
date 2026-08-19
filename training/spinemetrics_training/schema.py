"""Lectura del formato de exportación de estudios de la aplicación.

Espejo en Python de `src/core/models/types.ts` (modelo de datos, SPEC.md
§5) y `src/storage/jsonExport.ts` (envoltorio de exportación, SPEC.md §12).
Cuando cambien esos archivos TypeScript, este módulo debe actualizarse en
el mismo cambio — es la única fuente de verdad del formato en el lado de
entrenamiento.

SPEC.md §12: "Exportar los landmarks corregidos por el usuario
(`edited: true`) y las mediciones manuales en formato de dataset." El JSON
de exportación de un estudio (`src/storage/jsonExport.ts`) NO incluye los
píxeles de la imagen original —sólo anotaciones y mediciones—, así que un
dataset de entrenamiento se construye emparejando cada export `.json` con
el archivo de imagen original que el usuario cargó en la aplicación. Ver
`discover_dataset`.
"""
from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path

# Orden craneal→caudal. Espejo de `src/ui/spinalLevelOrder.ts`. El índice de
# un nivel en esta lista es el canal que le corresponde en las máscaras
# multicanal de `masks.py` y en la salida del modelo (`model.py`).
SPINAL_LEVELS: tuple[str, ...] = (
    "C7",
    "T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8", "T9", "T10", "T11", "T12",
    "L1", "L2", "L3", "L4", "L5",
    "S1",
)

STUDY_EXPORT_FORMAT_VERSION = 1  # Espejo de STUDY_EXPORT_FORMAT_VERSION en jsonExport.ts.

IMAGE_EXTENSIONS: tuple[str, ...] = (".dcm", ".png", ".jpg", ".jpeg", ".tif", ".tiff")


@dataclass(frozen=True)
class Point:
    x: float
    y: float


def _parse_point(d: dict) -> Point:
    return Point(x=float(d["x"]), y=float(d["y"]))


def _parse_point_pair(d: list) -> tuple[Point, Point]:
    if len(d) != 2:
        raise ValueError(f"Se esperaban exactamente 2 puntos, se recibieron {len(d)}.")
    return (_parse_point(d[0]), _parse_point(d[1]))


@dataclass(frozen=True)
class VertebraAnnotation:
    """Espejo de `VertebraAnnotation` en `src/core/models/types.ts`."""

    level: str
    superior_endplate: tuple[Point, Point]
    inferior_endplate: tuple[Point, Point]
    lateral_borders: tuple[Point, Point] | None = None
    pedicles: dict[str, Point] | None = None  # {"left": Point, "right": Point}
    centroid: Point | None = None
    posterior_superior_corner: Point | None = None
    confidence: float | None = None
    edited: bool = False


def _parse_vertebra(d: dict) -> VertebraAnnotation:
    pedicles = None
    if d.get("pedicles"):
        pedicles = {"left": _parse_point(d["pedicles"]["left"]), "right": _parse_point(d["pedicles"]["right"])}
    return VertebraAnnotation(
        level=d["level"],
        superior_endplate=_parse_point_pair(d["superiorEndplate"]),
        inferior_endplate=_parse_point_pair(d["inferiorEndplate"]),
        lateral_borders=_parse_point_pair(d["lateralBorders"]) if d.get("lateralBorders") else None,
        pedicles=pedicles,
        centroid=_parse_point(d["centroid"]) if d.get("centroid") else None,
        posterior_superior_corner=(
            _parse_point(d["posteriorSuperiorCorner"]) if d.get("posteriorSuperiorCorner") else None
        ),
        confidence=float(d["confidence"]) if d.get("confidence") is not None else None,
        edited=bool(d.get("edited", False)),
    )


@dataclass(frozen=True)
class Radiograph:
    """Subconjunto de `Radiograph` (SPEC.md §5) relevante para entrenar el
    segmentador vertebral: pelvis y costillas quedan fuera de este alcance
    (Etapa 3 del pipeline, no Etapas 5/9)."""

    id: str
    view: str
    vertebrae: tuple[VertebraAnnotation, ...] = field(default_factory=tuple)


def _parse_radiograph(d: dict) -> Radiograph:
    vertebrae = tuple(_parse_vertebra(v) for v in d["annotations"]["vertebrae"])
    return Radiograph(id=d["id"], view=d["view"], vertebrae=vertebrae)


@dataclass(frozen=True)
class Study:
    patient_ref: str
    date: str
    age_years: float
    radiographs: tuple[Radiograph, ...]
    # Fuente de cada `MeasurementSet`, alineada por posición con `radiographs`
    # (SPEC.md §5: cada `Radiograph` de un `Study` tiene su propio
    # `MeasurementSet`). Determina qué vértebras son fiables como etiqueta de
    # entrenamiento — ver `trustworthy_vertebrae`.
    measurement_sources: tuple[str, ...]


def parse_study(d: dict) -> Study:
    return Study(
        patient_ref=d["patientRef"],
        date=d["date"],
        age_years=float(d["ageYears"]),
        radiographs=tuple(_parse_radiograph(r) for r in d["radiographs"]),
        measurement_sources=tuple(ms["source"] for ms in d["measurementSets"]),
    )


def load_study_export(path: str | Path) -> Study:
    """Carga y valida un archivo `.json` exportado por la aplicación
    (`src/storage/jsonExport.ts`, botón "Exportar JSON")."""
    data = json.loads(Path(path).read_text())
    if not isinstance(data, dict) or "study" not in data:
        raise ValueError(f"{path}: no contiene un estudio de SpineMetrics válido.")
    if data.get("formatVersion") != STUDY_EXPORT_FORMAT_VERSION:
        raise ValueError(f"{path}: versión de formato no soportada: {data.get('formatVersion')!r}.")
    return parse_study(data["study"])


def trustworthy_vertebrae(radiograph: Radiograph, measurement_source: str) -> list[VertebraAnnotation]:
    """SPEC.md §12 / §1: sólo landmarks manuales o corregidos a mano son
    etiquetas de entrenamiento fiables.

    - `source == 'manual'`: toda la radiografía se anotó a mano (caso único
      posible mientras no exista pipeline automático, Fase 2) → todas sus
      vértebras son fiables.
    - `source == 'auto-edited'`: hubo detección automática y el usuario
      corrigió algunos landmarks → sólo las vértebras con `edited: true` son
      fiables; el resto son salida del modelo sin verificar y no deben
      retroalimentar su propio entrenamiento.
    - `source == 'auto'`: nada se verificó a mano → ninguna vértebra es
      fiable como etiqueta.
    """
    if measurement_source == "manual":
        return list(radiograph.vertebrae)
    if measurement_source == "auto-edited":
        return [v for v in radiograph.vertebrae if v.edited]
    return []


@dataclass(frozen=True)
class SamplePaths:
    json_path: Path
    image_path: Path


def discover_dataset(directory: str | Path) -> list[SamplePaths]:
    """Empareja cada exportación `.json` con su imagen original por nombre
    de archivo compartido (mismo *stem*): `estudio_001.json` +
    `estudio_001.dcm` (o `.png`/`.jpg`/`.jpeg`/`.tif`/`.tiff`).

    Lanza `FileNotFoundError` con un mensaje explícito si a un `.json` le
    falta su imagen — SPEC.md §17.9: nunca adivinar, nunca seguir en
    silencio con un dato ausente.
    """
    directory = Path(directory)
    samples: list[SamplePaths] = []
    for json_path in sorted(directory.glob("*.json")):
        image_path = next(
            (directory / f"{json_path.stem}{ext}" for ext in IMAGE_EXTENSIONS if (directory / f"{json_path.stem}{ext}").exists()),
            None,
        )
        if image_path is None:
            expected = ", ".join(f"{json_path.stem}{ext}" for ext in IMAGE_EXTENSIONS)
            raise FileNotFoundError(f"No se encontró la imagen original de {json_path.name}. Se esperaba una de: {expected}.")
        samples.append(SamplePaths(json_path=json_path, image_path=image_path))
    return samples
