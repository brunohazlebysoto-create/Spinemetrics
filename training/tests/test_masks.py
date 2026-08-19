import numpy as np
import pytest

from spinemetrics_training.masks import build_level_channel_masks, rasterize_vertebra
from spinemetrics_training.schema import SPINAL_LEVELS, Point, VertebraAnnotation


def make_vertebra_obj(level: str, x_center: float, y_center: float, half_w: float = 20, half_h: float = 15) -> VertebraAnnotation:
    return VertebraAnnotation(
        level=level,
        superior_endplate=(Point(x_center - half_w, y_center - half_h), Point(x_center + half_w, y_center - half_h)),
        inferior_endplate=(Point(x_center - half_w, y_center + half_h), Point(x_center + half_w, y_center + half_h)),
    )


class TestRasterizeVertebra:
    def test_produces_boolean_mask_of_requested_shape(self):
        vertebra = make_vertebra_obj("T5", 50, 50)
        mask = rasterize_vertebra(vertebra, shape=(100, 100))
        assert mask.shape == (100, 100)
        assert mask.dtype == bool

    def test_center_of_the_quadrilateral_is_filled(self):
        vertebra = make_vertebra_obj("T5", 50, 50, half_w=20, half_h=15)
        mask = rasterize_vertebra(vertebra, shape=(100, 100))
        assert mask[50, 50] == True  # noqa: E712

    def test_far_outside_the_quadrilateral_is_empty(self):
        vertebra = make_vertebra_obj("T5", 50, 50, half_w=20, half_h=15)
        mask = rasterize_vertebra(vertebra, shape=(100, 100))
        assert mask[5, 5] == False  # noqa: E712

    def test_area_is_approximately_the_rectangle_area(self):
        vertebra = make_vertebra_obj("T5", 50, 50, half_w=20, half_h=15)
        mask = rasterize_vertebra(vertebra, shape=(100, 100))
        expected_area = (2 * 20) * (2 * 15)
        # Rasterización discreta: tolerancia del 10% sobre el área continua.
        assert abs(int(mask.sum()) - expected_area) < 0.1 * expected_area


class TestBuildLevelChannelMasks:
    def test_output_shape_matches_number_of_spinal_levels(self):
        masks = build_level_channel_masks([make_vertebra_obj("T5", 50, 50)], shape=(100, 100))
        assert masks.shape == (len(SPINAL_LEVELS), 100, 100)

    def test_each_vertebra_lands_in_its_own_channel(self):
        vertebrae = [make_vertebra_obj("T5", 50, 30), make_vertebra_obj("T12", 50, 70)]
        masks = build_level_channel_masks(vertebrae, shape=(100, 100))
        t5_channel = SPINAL_LEVELS.index("T5")
        t12_channel = SPINAL_LEVELS.index("T12")
        assert masks[t5_channel, 30, 50] == 1.0
        assert masks[t5_channel, 70, 50] == 0.0
        assert masks[t12_channel, 70, 50] == 1.0
        assert masks[t12_channel, 30, 50] == 0.0

    def test_untouched_levels_stay_all_zero(self):
        masks = build_level_channel_masks([make_vertebra_obj("T5", 50, 50)], shape=(100, 100))
        l1_channel = SPINAL_LEVELS.index("L1")
        assert masks[l1_channel].sum() == 0

    def test_unknown_level_raises(self):
        bogus = make_vertebra_obj("T5", 50, 50)
        bogus = VertebraAnnotation(level="X99", superior_endplate=bogus.superior_endplate, inferior_endplate=bogus.inferior_endplate)
        with pytest.raises(ValueError, match="X99"):
            build_level_channel_masks([bogus], shape=(100, 100))
