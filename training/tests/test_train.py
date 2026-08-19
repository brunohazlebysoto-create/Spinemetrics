import json

import cv2
import numpy as np
import pytest
import torch

from spinemetrics_training.dataset import VertebraSegmentationDataset
from spinemetrics_training.train import (
    TrainConfig,
    build_dataloaders,
    combined_loss,
    dice_loss,
    parse_args,
    train,
)
from tests.conftest import make_study_export, make_vertebra


def _write_sample(directory, name: str) -> None:
    image = np.zeros((800, 400), dtype=np.uint8)
    image[:, 150:250] = 200
    cv2.imwrite(str(directory / f"{name}.png"), image)
    vertebrae = [
        make_vertebra("T5", x_center=200, y_center=150, half_width=40, half_height=25),
        make_vertebra("T12", x_center=200, y_center=600, half_width=40, half_height=25),
    ]
    export = make_study_export(vertebrae=vertebrae)
    (directory / f"{name}.json").write_text(json.dumps(export))


@pytest.fixture
def small_dataset_dir(tmp_path):
    for i in range(3):
        _write_sample(tmp_path, f"sample_{i:03d}")
    return tmp_path


@pytest.fixture
def single_sample_dataset_dir(tmp_path):
    _write_sample(tmp_path, "sample_000")
    return tmp_path


def _tiny_config(data_dir, output_dir, **overrides) -> TrainConfig:
    defaults = dict(
        data_dir=data_dir,
        output_dir=output_dir,
        epochs=2,
        batch_size=2,
        target_width=32,
        target_height=64,
        base_channels=4,
        depth=2,
        seed=0,
        device="cpu",
    )
    defaults.update(overrides)
    return TrainConfig(**defaults)


class TestLosses:
    def test_dice_loss_is_near_zero_for_perfect_prediction(self):
        # Un solo canal, con contenido positivo: si el canal fuera todo
        # fondo, cualquier probabilidad residual (nunca exactamente 0 tras
        # sigmoid) hunde el Dice de ese canal — comportamiento esperado de
        # Dice suave, no lo que esta prueba quiere ejercitar.
        targets = torch.zeros(1, 1, 8, 8)
        targets[0, 0, 2:5, 2:5] = 1.0
        logits = (targets * 20) - 10  # sigmoid(logits) ~= targets
        loss = dice_loss(logits, targets)
        assert loss.item() == pytest.approx(0.0, abs=1e-3)

    def test_dice_loss_is_high_for_opposite_prediction(self):
        targets = torch.zeros(1, 1, 8, 8)
        targets[0, 0, 2:5, 2:5] = 1.0
        logits = torch.full_like(targets, -10.0)  # predice todo fondo
        loss = dice_loss(logits, targets)
        assert loss.item() > 0.9

    def test_combined_loss_is_finite_and_nonnegative(self):
        targets = torch.randint(0, 2, (2, 3, 8, 8)).float()
        logits = torch.randn(2, 3, 8, 8)
        loss = combined_loss(logits, targets)
        assert torch.isfinite(loss)
        assert loss.item() >= 0.0


class TestBuildDataloaders:
    def test_single_sample_yields_no_validation_loader(self, single_sample_dataset_dir, tmp_path):
        config = _tiny_config(single_sample_dataset_dir, tmp_path / "out")
        train_loader, val_loader = build_dataloaders(config)
        assert val_loader is None
        assert len(train_loader.dataset) == 1

    def test_multiple_samples_yields_train_and_validation_loaders(self, small_dataset_dir, tmp_path):
        config = _tiny_config(small_dataset_dir, tmp_path / "out")
        train_loader, val_loader = build_dataloaders(config)
        assert val_loader is not None
        assert len(train_loader.dataset) + len(val_loader.dataset) == 3

    def test_raises_on_empty_directory(self, tmp_path):
        empty_dir = tmp_path / "empty"
        empty_dir.mkdir()
        config = _tiny_config(empty_dir, tmp_path / "out")
        with pytest.raises(ValueError, match="No se encontraron muestras"):
            build_dataloaders(config)


class TestTrain:
    def test_produces_checkpoint_config_and_history(self, single_sample_dataset_dir, tmp_path):
        output_dir = tmp_path / "run"
        config = _tiny_config(single_sample_dataset_dir, output_dir)
        checkpoint_path = train(config)

        assert checkpoint_path == output_dir / "best.pt"
        assert checkpoint_path.exists()
        assert (output_dir / "config.json").exists()
        assert (output_dir / "history.json").exists()

        history = json.loads((output_dir / "history.json").read_text())
        assert len(history) == config.epochs
        assert all("train_loss" in entry for entry in history)

    def test_checkpoint_contains_architecture_metadata(self, single_sample_dataset_dir, tmp_path):
        output_dir = tmp_path / "run"
        config = _tiny_config(single_sample_dataset_dir, output_dir)
        checkpoint_path = train(config)

        checkpoint = torch.load(checkpoint_path, map_location="cpu")
        assert checkpoint["base_channels"] == config.base_channels
        assert checkpoint["depth"] == config.depth
        assert "model_state_dict" in checkpoint

    def test_train_with_validation_split_records_val_loss(self, small_dataset_dir, tmp_path):
        output_dir = tmp_path / "run"
        config = _tiny_config(small_dataset_dir, output_dir)
        train(config)

        history = json.loads((output_dir / "history.json").read_text())
        assert all(entry["val_loss"] == entry["val_loss"] for entry in history)  # no NaN


class TestParseArgs:
    def test_parses_required_arguments_with_defaults(self, tmp_path):
        config = parse_args([
            "--data-dir", str(tmp_path / "data"),
            "--output-dir", str(tmp_path / "out"),
        ])
        assert config.data_dir == tmp_path / "data"
        assert config.output_dir == tmp_path / "out"
        assert config.epochs == 50
        assert config.device in ("cpu", "cuda")

    def test_overrides_defaults(self, tmp_path):
        config = parse_args([
            "--data-dir", str(tmp_path / "data"),
            "--output-dir", str(tmp_path / "out"),
            "--epochs", "5",
            "--batch-size", "8",
        ])
        assert config.epochs == 5
        assert config.batch_size == 8
