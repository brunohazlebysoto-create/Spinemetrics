import json

import cv2
import numpy as np
import onnx
import pytest

from spinemetrics_training.export_onnx import compute_model_version, export_to_onnx
from spinemetrics_training.schema import SPINAL_LEVELS
from spinemetrics_training.train import TrainConfig, train
from tests.conftest import make_study_export, make_vertebra


@pytest.fixture
def trained_checkpoint(tmp_path):
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    image = np.zeros((800, 400), dtype=np.uint8)
    image[:, 150:250] = 200
    cv2.imwrite(str(data_dir / "sample_000.png"), image)
    vertebrae = [
        make_vertebra("T5", x_center=200, y_center=150, half_width=40, half_height=25),
        make_vertebra("T12", x_center=200, y_center=600, half_width=40, half_height=25),
    ]
    (data_dir / "sample_000.json").write_text(json.dumps(make_study_export(vertebrae=vertebrae)))

    output_dir = tmp_path / "run"
    config = TrainConfig(
        data_dir=data_dir,
        output_dir=output_dir,
        epochs=1,
        batch_size=1,
        target_width=32,
        target_height=64,
        base_channels=4,
        depth=2,
        device="cpu",
    )
    return train(config)


class TestComputeModelVersion:
    def test_returns_a_12_character_hex_string(self, tmp_path):
        checkpoint_path = tmp_path / "fake.pt"
        checkpoint_path.write_bytes(b"not a real checkpoint, just bytes to hash")
        version = compute_model_version(checkpoint_path)
        assert len(version) == 12
        int(version, 16)  # no lanza si es hexadecimal válido

    def test_is_deterministic_for_the_same_bytes(self, tmp_path):
        path_a = tmp_path / "a.pt"
        path_b = tmp_path / "b.pt"
        path_a.write_bytes(b"identical content")
        path_b.write_bytes(b"identical content")
        assert compute_model_version(path_a) == compute_model_version(path_b)

    def test_differs_for_different_bytes(self, tmp_path):
        path_a = tmp_path / "a.pt"
        path_b = tmp_path / "b.pt"
        path_a.write_bytes(b"content one")
        path_b.write_bytes(b"content two")
        assert compute_model_version(path_a) != compute_model_version(path_b)


class TestExportToOnnx:
    def test_produces_a_valid_onnx_file(self, trained_checkpoint, tmp_path):
        output_path = tmp_path / "model.onnx"
        result = export_to_onnx(trained_checkpoint, output_path, input_size=(32, 64))

        assert result.onnx_path.exists()
        model = onnx.load(str(result.onnx_path))
        onnx.checker.check_model(model)

    def test_spatial_axes_are_dynamic(self, trained_checkpoint, tmp_path):
        output_path = tmp_path / "model.onnx"
        result = export_to_onnx(trained_checkpoint, output_path, input_size=(32, 64))

        model = onnx.load(str(result.onnx_path))
        input_dims = model.graph.input[0].type.tensor_type.shape.dim
        # batch, canal, alto, ancho: 0 y 2, 3 deben ser simbólicos (dinámicos).
        assert input_dims[0].dim_param != ""
        assert input_dims[2].dim_param != ""
        assert input_dims[3].dim_param != ""
        assert input_dims[1].dim_value == 1  # canal fijo (imagen en escala de grises)

    def test_writes_metadata_sidecar_with_expected_fields(self, trained_checkpoint, tmp_path):
        output_path = tmp_path / "model.onnx"
        result = export_to_onnx(trained_checkpoint, output_path, input_size=(32, 64))

        assert result.metadata_path == tmp_path / "model.onnx.metadata.json"
        metadata = json.loads(result.metadata_path.read_text())
        assert metadata["modelVersion"] == result.model_version
        assert len(metadata["modelVersion"]) == 12
        assert metadata["spinalLevels"] == list(SPINAL_LEVELS)
        assert metadata["inputSize"] == {"width": 32, "height": 64}
        assert metadata["sourceCheckpoint"] == str(trained_checkpoint)
        assert metadata["trainedEpoch"] == 1

    def test_model_version_matches_checkpoint_hash(self, trained_checkpoint, tmp_path):
        output_path = tmp_path / "model.onnx"
        result = export_to_onnx(trained_checkpoint, output_path, input_size=(32, 64))
        assert result.model_version == compute_model_version(trained_checkpoint)
