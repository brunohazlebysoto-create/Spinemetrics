"""Exporta un checkpoint entrenado (`train.train()`) a ONNX para que la
aplicación lo consuma con ONNX Runtime Web (SPEC.md §3, §12: "Registrar
`modelVersion` en cada `MeasurementSet` automático para que las métricas de
rendimiento sean siempre atribuibles a una versión concreta").

Uso:
    python -m spinemetrics_training.export_onnx \\
        --checkpoint ./runs/exp1/best.pt --output ./runs/exp1/model.onnx

Junto al `.onnx` escribe un sidecar `<output>.metadata.json` con el
`modelVersion` (hash del checkpoint) y demás metadatos de trazabilidad. Ese
`modelVersion` es lo que la aplicación debería copiar en
`MeasurementSet.modelVersion` (`src/core/models/types.ts`) al usar este
modelo para inferencia automática.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

import onnx
import torch

from spinemetrics_training.model import VertebraSegmentationUNet
from spinemetrics_training.schema import SPINAL_LEVELS


def compute_model_version(checkpoint_path: str | Path) -> str:
    """Hash SHA-256 del contenido del checkpoint, truncado a 12 caracteres
    hexadecimales — identificador corto y estable para trazabilidad
    (SPEC.md §12), no un número de versión semántico."""
    digest = hashlib.sha256(Path(checkpoint_path).read_bytes()).hexdigest()
    return digest[:12]


@dataclass
class ExportResult:
    onnx_path: Path
    metadata_path: Path
    model_version: str


def export_to_onnx(
    checkpoint_path: str | Path,
    output_path: str | Path,
    input_size: tuple[int, int] = (512, 1024),
    opset: int = 17,
) -> ExportResult:
    """Carga un checkpoint de `VertebraSegmentationUNet` y lo exporta a
    ONNX con ejes dinámicos de lote/alto/ancho (la app puede pasar
    imágenes de distintos tamaños tras el preprocesado de Etapa 2).

    `input_size = (width, height)`, sólo usado para trazar el grafo — los
    ejes espaciales quedan marcados como dinámicos en el modelo exportado.
    """
    checkpoint_path = Path(checkpoint_path)
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    checkpoint = torch.load(checkpoint_path, map_location="cpu")
    model = VertebraSegmentationUNet(
        base_channels=checkpoint["base_channels"],
        depth=checkpoint["depth"],
    )
    model.load_state_dict(checkpoint["model_state_dict"])
    model.eval()

    width, height = input_size
    dummy_input = torch.zeros(1, 1, height, width, dtype=torch.float32)

    torch.onnx.export(
        model,
        dummy_input,
        str(output_path),
        input_names=["image"],
        output_names=["level_logits"],
        dynamic_axes={
            "image": {0: "batch", 2: "height", 3: "width"},
            "level_logits": {0: "batch", 2: "height", 3: "width"},
        },
        opset_version=opset,
        # El exportador "dynamo" (por defecto desde PyTorch 2.x) requiere el
        # paquete opcional `onnxscript`, que no forma parte del andamiaje.
        # El exportador clásico basado en TorchScript soporta `dynamic_axes`
        # igual de bien para este modelo (sin control flow dependiente de
        # datos) y no añade esa dependencia.
        dynamo=False,
    )

    onnx.checker.check_model(str(output_path))

    model_version = compute_model_version(checkpoint_path)
    metadata = {
        "modelVersion": model_version,
        "exportedAt": datetime.now(timezone.utc).isoformat(),
        "spinalLevels": list(SPINAL_LEVELS),
        "inputSize": {"width": width, "height": height},
        "sourceCheckpoint": str(checkpoint_path),
        "trainedEpoch": checkpoint.get("epoch"),
        "opset": opset,
    }
    metadata_path = output_path.with_suffix(output_path.suffix + ".metadata.json")
    metadata_path.write_text(json.dumps(metadata, indent=2))

    return ExportResult(onnx_path=output_path, metadata_path=metadata_path, model_version=model_version)


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--checkpoint", type=Path, required=True, help="Ruta al checkpoint (`best.pt`) producido por train.py.")
    parser.add_argument("--output", type=Path, required=True, help="Ruta de salida del archivo .onnx.")
    parser.add_argument("--input-width", type=int, default=512)
    parser.add_argument("--input-height", type=int, default=1024)
    parser.add_argument("--opset", type=int, default=17)
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> None:
    args = parse_args(argv)
    result = export_to_onnx(
        args.checkpoint,
        args.output,
        input_size=(args.input_width, args.input_height),
        opset=args.opset,
    )
    print(f"Modelo exportado: {result.onnx_path} (modelVersion={result.model_version})")
    print(f"Metadatos: {result.metadata_path}")


if __name__ == "__main__":
    main()
