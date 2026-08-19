"""Entrena `VertebraSegmentationUNet` sobre un dataset exportado desde la
aplicación (SPEC.md §1, "bucle de mejora": cada corrección manual de un
landmark genera un dato etiquetado).

Uso:
    python -m spinemetrics_training.train \\
        --data-dir ./dataset --output-dir ./runs/exp1 --epochs 50

`--data-dir` es un directorio de pares `estudio.json` + imagen original
(ver `schema.discover_dataset`); normalmente se construye copiando ahí las
exportaciones JSON del botón "Exportar JSON" de la aplicación junto a los
archivos de imagen que se cargaron para cada una.
"""
from __future__ import annotations

import argparse
import json
from dataclasses import dataclass
from pathlib import Path

import torch
from torch.utils.data import DataLoader, random_split

from spinemetrics_training.dataset import VertebraSegmentationDataset
from spinemetrics_training.model import VertebraSegmentationUNet


def dice_loss(logits: torch.Tensor, targets: torch.Tensor, eps: float = 1e-6) -> torch.Tensor:
    """Dice suave sobre probabilidades (no sobre máscaras binarizadas), para
    que sea derivable. Complementa la entropía cruzada: penaliza mejor el
    fuerte desequilibrio de clases (la mayoría de píxeles son fondo)."""
    probs = torch.sigmoid(logits)
    dims = (0, 2, 3)
    intersection = (probs * targets).sum(dim=dims)
    union = probs.sum(dim=dims) + targets.sum(dim=dims)
    dice = (2 * intersection + eps) / (union + eps)
    return 1 - dice.mean()


def combined_loss(logits: torch.Tensor, targets: torch.Tensor) -> torch.Tensor:
    bce = torch.nn.functional.binary_cross_entropy_with_logits(logits, targets)
    return bce + dice_loss(logits, targets)


@dataclass
class TrainConfig:
    data_dir: Path
    output_dir: Path
    epochs: int = 50
    batch_size: int = 4
    learning_rate: float = 1e-3
    val_fraction: float = 0.15
    target_width: int = 512
    target_height: int = 1024
    base_channels: int = 32
    depth: int = 4
    seed: int = 0
    device: str = "cpu"

    @property
    def target_size(self) -> tuple[int, int]:
        return (self.target_width, self.target_height)

    def to_json_dict(self) -> dict:
        d = dict(self.__dict__)
        d["data_dir"] = str(self.data_dir)
        d["output_dir"] = str(self.output_dir)
        return d


def build_dataloaders(config: TrainConfig) -> tuple[DataLoader, DataLoader | None]:
    dataset = VertebraSegmentationDataset.from_directory(config.data_dir, target_size=config.target_size)
    if len(dataset) == 0:
        raise ValueError(f"No se encontraron muestras en {config.data_dir}.")

    if len(dataset) == 1:
        # Con una sola muestra no hay validación posible; se entrena igual
        # (útil sobre todo para pruebas de humo del pipeline).
        return DataLoader(dataset, batch_size=config.batch_size, shuffle=True), None

    val_size = max(1, round(len(dataset) * config.val_fraction))
    val_size = min(val_size, len(dataset) - 1)
    train_size = len(dataset) - val_size
    generator = torch.Generator().manual_seed(config.seed)
    train_ds, val_ds = random_split(dataset, [train_size, val_size], generator=generator)
    train_loader = DataLoader(train_ds, batch_size=config.batch_size, shuffle=True)
    val_loader = DataLoader(val_ds, batch_size=min(config.batch_size, len(val_ds)), shuffle=False)
    return train_loader, val_loader


def train_one_epoch(model: torch.nn.Module, loader: DataLoader, optimizer: torch.optim.Optimizer, device: str) -> float:
    model.train()
    total_loss = 0.0
    for images, masks in loader:
        images, masks = images.to(device), masks.to(device)
        optimizer.zero_grad()
        logits = model(images)
        loss = combined_loss(logits, masks)
        loss.backward()
        optimizer.step()
        total_loss += loss.item() * images.size(0)
    return total_loss / len(loader.dataset)


@torch.no_grad()
def evaluate(model: torch.nn.Module, loader: DataLoader | None, device: str) -> float:
    if loader is None:
        return float("nan")
    model.eval()
    total_loss = 0.0
    for images, masks in loader:
        images, masks = images.to(device), masks.to(device)
        loss = combined_loss(model(images), masks)
        total_loss += loss.item() * images.size(0)
    return total_loss / len(loader.dataset)


def train(config: TrainConfig) -> Path:
    """Entrena y devuelve la ruta del mejor checkpoint (`best.pt`)."""
    torch.manual_seed(config.seed)
    config.output_dir.mkdir(parents=True, exist_ok=True)
    (config.output_dir / "config.json").write_text(json.dumps(config.to_json_dict(), indent=2))

    train_loader, val_loader = build_dataloaders(config)
    model = VertebraSegmentationUNet(base_channels=config.base_channels, depth=config.depth).to(config.device)
    optimizer = torch.optim.Adam(model.parameters(), lr=config.learning_rate)

    checkpoint_path = config.output_dir / "best.pt"
    history: list[dict] = []
    best_metric = float("inf")

    for epoch in range(1, config.epochs + 1):
        train_loss = train_one_epoch(model, train_loader, optimizer, config.device)
        val_loss = evaluate(model, val_loader, config.device)
        history.append({"epoch": epoch, "train_loss": train_loss, "val_loss": val_loss})
        print(f"[{epoch}/{config.epochs}] train_loss={train_loss:.4f} val_loss={val_loss:.4f}")

        metric = val_loss if val_loader is not None else train_loss
        if metric < best_metric:
            best_metric = metric
            torch.save(
                {
                    "model_state_dict": model.state_dict(),
                    "base_channels": config.base_channels,
                    "depth": config.depth,
                    "epoch": epoch,
                    "metric": metric,
                },
                checkpoint_path,
            )

    (config.output_dir / "history.json").write_text(json.dumps(history, indent=2))
    return checkpoint_path


def parse_args(argv: list[str] | None = None) -> TrainConfig:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--data-dir", type=Path, required=True, help="Directorio con pares estudio.json + imagen original.")
    parser.add_argument("--output-dir", type=Path, required=True, help="Dónde guardar checkpoints, config e historial.")
    parser.add_argument("--epochs", type=int, default=50)
    parser.add_argument("--batch-size", type=int, default=4)
    parser.add_argument("--learning-rate", type=float, default=1e-3)
    parser.add_argument("--val-fraction", type=float, default=0.15)
    parser.add_argument("--target-width", type=int, default=512)
    parser.add_argument("--target-height", type=int, default=1024)
    parser.add_argument("--base-channels", type=int, default=32)
    parser.add_argument("--depth", type=int, default=4)
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--device", type=str, default="cuda" if torch.cuda.is_available() else "cpu")
    args = parser.parse_args(argv)
    return TrainConfig(
        data_dir=args.data_dir,
        output_dir=args.output_dir,
        epochs=args.epochs,
        batch_size=args.batch_size,
        learning_rate=args.learning_rate,
        val_fraction=args.val_fraction,
        target_width=args.target_width,
        target_height=args.target_height,
        base_channels=args.base_channels,
        depth=args.depth,
        seed=args.seed,
        device=args.device,
    )


def main(argv: list[str] | None = None) -> None:
    config = parse_args(argv)
    checkpoint_path = train(config)
    print(f"Mejor checkpoint: {checkpoint_path}")


if __name__ == "__main__":
    main()
