import numpy as np
import pytest

from spinemetrics_training.preprocess import (
    AffineTransform,
    apply_clahe,
    detect_spine_roi,
    normalize_intensity,
    resample_mask_with_roi,
    resample_with_affine,
)
from spinemetrics_training.schema import Point


class TestAffineTransform:
    def test_identity_is_a_no_op(self):
        t = AffineTransform.identity()
        p = Point(12.3, 45.6)
        assert t.apply(p) == p

    def test_apply_inverse_recovers_the_original_point(self):
        t = AffineTransform(scale_x=0.5, scale_y=0.25, offset_x=10, offset_y=-3)
        original = Point(123.4, 567.8)
        resampled = t.apply(original)
        recovered = t.apply_inverse(resampled)
        assert recovered.x == pytest.approx(original.x, abs=1e-9)
        assert recovered.y == pytest.approx(original.y, abs=1e-9)

    def test_compose_matches_applying_transforms_in_sequence(self):
        crop = AffineTransform(1.0, 1.0, offset_x=-50, offset_y=-20)
        resize = AffineTransform(scale_x=2.0, scale_y=0.5)
        composed = crop.compose(resize)

        point = Point(80, 100)
        expected = resize.apply(crop.apply(point))
        assert composed.apply(point) == expected


class TestResampleWithAffine:
    def test_output_has_requested_target_size(self):
        image = np.zeros((800, 400), dtype=np.uint8)
        resized, _ = resample_with_affine(image, roi=(0, 0, 400, 800), target_size=(256, 512))
        assert resized.shape == (512, 256)

    @pytest.mark.parametrize(
        "roi,target_size",
        [
            ((0, 0, 400, 800), (256, 512)),
            ((50, 100, 350, 800), (224, 224)),
            ((10, 0, 390, 750), (512, 512)),
        ],
    )
    def test_affine_round_trip_within_half_pixel(self, roi, target_size):
        """SPEC.md §13.7: "landmarks detectados en el espacio remuestreado y
        devueltos al original conservan la posición dentro de 0.5 px."""
        image = np.zeros((800, 400), dtype=np.uint8)
        _, transform = resample_with_affine(image, roi=roi, target_size=target_size)

        x0, y0, x1, y1 = roi
        original_points = [
            Point(x0 + 5, y0 + 5),
            Point((x0 + x1) / 2, (y0 + y1) / 2),
            Point(x1 - 5, y1 - 5),
        ]
        for point in original_points:
            resampled = transform.apply(point)
            recovered = transform.apply_inverse(resampled)
            assert abs(recovered.x - point.x) < 0.5
            assert abs(recovered.y - point.y) < 0.5

    def test_raises_on_empty_roi(self):
        image = np.zeros((100, 100), dtype=np.uint8)
        with pytest.raises(ValueError, match="ROI vacía"):
            resample_with_affine(image, roi=(50, 50, 50, 80), target_size=(64, 64))


class TestResampleMaskWithRoi:
    def test_output_shape_matches_channels_and_target_size(self):
        mask = np.zeros((3, 100, 100), dtype=np.float32)
        result = resample_mask_with_roi(mask, roi=(0, 0, 100, 100), target_size=(50, 25))
        assert result.shape == (3, 25, 50)

    def test_stays_binary_after_resampling(self):
        mask = np.zeros((1, 100, 100), dtype=np.float32)
        mask[0, 20:80, 20:80] = 1.0
        result = resample_mask_with_roi(mask, roi=(0, 0, 100, 100), target_size=(37, 41))
        assert set(np.unique(result)) <= {0.0, 1.0}

    def test_preserves_which_channel_has_content(self):
        mask = np.zeros((2, 100, 100), dtype=np.float32)
        mask[0, 10:20, 10:20] = 1.0  # sólo canal 0 tiene contenido
        result = resample_mask_with_roi(mask, roi=(0, 0, 100, 100), target_size=(50, 50))
        assert result[0].sum() > 0
        assert result[1].sum() == 0


class TestNormalizeIntensity:
    def test_output_is_float32_within_unit_range(self):
        image = np.random.default_rng(0).integers(0, 4096, size=(50, 50), dtype=np.uint16)
        normalized = normalize_intensity(image)
        assert normalized.dtype == np.float32
        assert normalized.min() >= 0.0
        assert normalized.max() <= 1.0

    def test_constant_image_does_not_produce_nan(self):
        image = np.full((10, 10), 500, dtype=np.uint16)
        normalized = normalize_intensity(image)
        assert not np.isnan(normalized).any()


class TestApplyClahe:
    def test_preserves_shape_and_dtype(self):
        image = np.random.default_rng(0).integers(0, 256, size=(64, 64), dtype=np.uint8)
        result = apply_clahe(image)
        assert result.shape == image.shape
        assert result.dtype == np.uint8


class TestDetectSpineRoi:
    def test_finds_a_high_contrast_vertical_band(self):
        image = np.zeros((200, 200), dtype=np.uint8)
        # Franja vertical de alto contraste en el centro (columna simulada).
        rng = np.random.default_rng(0)
        image[:, 80:120] = rng.integers(0, 256, size=(200, 40), dtype=np.uint8)
        x0, y0, x1, y1 = detect_spine_roi(image)
        assert y0 == 0
        assert y1 == 200
        # La banda detectada debe cubrir el centro de la franja de contraste.
        assert x0 <= 100 <= x1

    def test_falls_back_to_full_image_when_no_contrast(self):
        image = np.full((100, 100), 128, dtype=np.uint8)
        x0, y0, x1, y1 = detect_spine_roi(image)
        assert (x0, y0, x1, y1) == (0, 0, 100, 100)

    def test_respects_minimum_width_fraction(self):
        image = np.zeros((200, 200), dtype=np.uint8)
        rng = np.random.default_rng(0)
        image[:, 95:105] = rng.integers(0, 256, size=(200, 10), dtype=np.uint8)  # franja muy estrecha
        x0, _, x1, _ = detect_spine_roi(image, min_width_fraction=0.5)
        assert (x1 - x0) >= 0.5 * 200
