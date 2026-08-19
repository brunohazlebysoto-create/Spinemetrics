import cv2
import numpy as np
import pytest

from spinemetrics_training.corners import (
    extract_vertebra_corners,
    gradient_magnitude,
    min_area_rect_corners,
    order_corners,
    refine_corner,
)
from spinemetrics_training.schema import Point


class TestOrderCorners:
    def test_orders_shuffled_axis_aligned_rectangle(self):
        # Rectángulo x∈[10,50], y∈[20,80], dado en orden arbitrario.
        box = np.array([[50, 80], [10, 20], [50, 20], [10, 80]], dtype=np.float32)
        corners = order_corners(box)
        assert corners.superior_left == Point(10, 20)
        assert corners.superior_right == Point(50, 20)
        assert corners.inferior_left == Point(10, 80)
        assert corners.inferior_right == Point(50, 80)


class TestMinAreaRectCorners:
    def test_recovers_corners_of_a_filled_rectangle(self):
        mask = np.zeros((100, 100), dtype=np.uint8)
        mask[20:80, 10:50] = 1  # filas 20-79 (y), columnas 10-49 (x)
        corners = min_area_rect_corners(mask.astype(bool))
        assert corners is not None
        assert corners.superior_left.x == pytest.approx(10, abs=1)
        assert corners.superior_left.y == pytest.approx(20, abs=1)
        assert corners.inferior_right.x == pytest.approx(49, abs=1)
        assert corners.inferior_right.y == pytest.approx(79, abs=1)

    def test_returns_none_for_empty_mask(self):
        mask = np.zeros((50, 50), dtype=bool)
        assert min_area_rect_corners(mask) is None

    def test_picks_the_largest_contour_when_several_present(self):
        mask = np.zeros((100, 100), dtype=np.uint8)
        mask[10:20, 10:20] = 1  # ruido pequeño
        mask[40:90, 30:70] = 1  # vértebra real, mucho más grande
        corners = min_area_rect_corners(mask.astype(bool))
        assert corners is not None
        assert corners.superior_left.x == pytest.approx(30, abs=1)
        assert corners.superior_left.y == pytest.approx(40, abs=1)


class TestRefineCorner:
    def test_snaps_to_the_peak_gradient_within_the_window(self):
        gradient = np.zeros((50, 50), dtype=np.float32)
        gradient[24, 27] = 100.0  # pico a 3px a la derecha del punto inicial
        refined = refine_corner(Point(24, 24), gradient, window=5)
        assert refined == Point(27, 24)

    def test_leaves_point_unchanged_when_window_falls_outside_image(self):
        gradient = np.zeros((10, 10), dtype=np.float32)
        point = Point(-5, -5)
        assert refine_corner(point, gradient, window=3) == point


class TestGradientMagnitude:
    def test_zero_for_a_flat_image(self):
        image = np.full((20, 20), 128, dtype=np.uint8)
        grad = gradient_magnitude(image)
        assert np.allclose(grad, 0.0)

    def test_high_at_a_sharp_edge(self):
        image = np.zeros((20, 20), dtype=np.uint8)
        image[:, 10:] = 255
        grad = gradient_magnitude(image)
        assert grad[:, 9:11].max() > grad[:, 0:5].max()


class TestExtractVertebraCorners:
    def test_without_image_returns_raw_rectangle_corners(self):
        mask = np.zeros((100, 100), dtype=bool)
        mask[20:80, 10:50] = True
        corners = extract_vertebra_corners(mask)
        assert corners is not None
        assert corners.superior_left.x == pytest.approx(10, abs=1)

    def test_with_image_refines_corners_towards_local_gradient(self):
        mask = np.zeros((100, 100), dtype=np.uint8)
        mask[20:80, 10:50] = 1
        # Imagen con un borde neto justo dentro de la máscara, cerca de la
        # esquina superior-izquierda nominal (10,20): el refinamiento debe
        # desplazar la esquina hacia ese borde.
        image = np.zeros((100, 100), dtype=np.uint8)
        image[:, 13:] = 255
        corners = extract_vertebra_corners(mask.astype(bool), image=image, refine_window=5)
        assert corners is not None
        assert corners.superior_left.x == pytest.approx(13, abs=1)

    def test_returns_none_for_empty_mask_even_with_image(self):
        mask = np.zeros((50, 50), dtype=bool)
        image = np.zeros((50, 50), dtype=np.uint8)
        assert extract_vertebra_corners(mask, image=image) is None
