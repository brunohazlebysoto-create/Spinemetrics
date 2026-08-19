import json

import cv2
import numpy as np
import pytest

from spinemetrics_training.dataset import VertebraSegmentationDataset, load_image
from spinemetrics_training.schema import SPINAL_LEVELS, SamplePaths
from tests.conftest import make_study_export, make_vertebra


@pytest.fixture
def populated_dataset_dir(tmp_path):
    """Directorio con una muestra que tiene vértebras anotadas dentro de
    los límites de la imagen (a diferencia de `dataset_dir`, que usa el
    export por defecto de `study_export_dict` con vértebras arbitrarias)."""
    image = np.zeros((800, 400), dtype=np.uint8)
    # Algo de contraste para que detect_spine_roi encuentre una banda real.
    image[:, 150:250] = 200
    cv2.imwrite(str(tmp_path / "sample_001.png"), image)

    vertebrae = [
        make_vertebra("T5", x_center=200, y_center=150, half_width=40, half_height=25),
        make_vertebra("T12", x_center=200, y_center=600, half_width=40, half_height=25),
    ]
    export = make_study_export(vertebrae=vertebrae)
    (tmp_path / "sample_001.json").write_text(json.dumps(export))
    return tmp_path


class TestLoadImage:
    def test_reads_a_png_as_grayscale_float32(self, tmp_path):
        image = np.full((20, 30), 100, dtype=np.uint8)
        path = tmp_path / "img.png"
        cv2.imwrite(str(path), image)
        loaded = load_image(path)
        assert loaded.shape == (20, 30)
        assert loaded.dtype == np.float32
        assert loaded.max() == pytest.approx(100)

    def test_raises_on_unreadable_file(self, tmp_path):
        path = tmp_path / "not-an-image.png"
        path.write_text("garbage")
        with pytest.raises(ValueError, match="No se pudo leer"):
            load_image(path)


class TestVertebraSegmentationDataset:
    def test_len_matches_number_of_samples(self, populated_dataset_dir):
        dataset = VertebraSegmentationDataset.from_directory(populated_dataset_dir, target_size=(64, 128))
        assert len(dataset) == 1

    def test_getitem_returns_correctly_shaped_tensors(self, populated_dataset_dir):
        dataset = VertebraSegmentationDataset.from_directory(populated_dataset_dir, target_size=(64, 128))
        image_tensor, mask_tensor = dataset[0]
        assert image_tensor.shape == (1, 128, 64)
        assert mask_tensor.shape == (len(SPINAL_LEVELS), 128, 64)

    def test_image_tensor_is_normalized(self, populated_dataset_dir):
        dataset = VertebraSegmentationDataset.from_directory(populated_dataset_dir, target_size=(64, 128))
        image_tensor, _ = dataset[0]
        assert image_tensor.min() >= 0.0
        assert image_tensor.max() <= 1.0

    def test_annotated_levels_have_nonzero_mask_content(self, populated_dataset_dir):
        dataset = VertebraSegmentationDataset.from_directory(populated_dataset_dir, target_size=(64, 128))
        _, mask_tensor = dataset[0]
        t5_channel = SPINAL_LEVELS.index("T5")
        t12_channel = SPINAL_LEVELS.index("T12")
        assert mask_tensor[t5_channel].sum() > 0
        assert mask_tensor[t12_channel].sum() > 0

    def test_unannotated_levels_stay_empty(self, populated_dataset_dir):
        dataset = VertebraSegmentationDataset.from_directory(populated_dataset_dir, target_size=(64, 128))
        _, mask_tensor = dataset[0]
        l1_channel = SPINAL_LEVELS.index("L1")
        assert mask_tensor[l1_channel].sum() == 0

    def test_raises_when_study_has_more_than_one_radiograph(self, tmp_path):
        image = np.zeros((100, 100), dtype=np.uint8)
        cv2.imwrite(str(tmp_path / "bad.png"), image)
        export = make_study_export()
        # Duplica la radiografía y su measurementSet para simular >1.
        export["study"]["radiographs"].append(dict(export["study"]["radiographs"][0]))
        export["study"]["measurementSets"].append(dict(export["study"]["measurementSets"][0]))
        (tmp_path / "bad.json").write_text(json.dumps(export))

        dataset = VertebraSegmentationDataset([SamplePaths(tmp_path / "bad.json", tmp_path / "bad.png")])
        with pytest.raises(ValueError, match="1 radiografía"):
            dataset[0]
