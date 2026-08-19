import torch

from spinemetrics_training.model import VertebraSegmentationUNet
from spinemetrics_training.schema import SPINAL_LEVELS


class TestVertebraSegmentationUNet:
    def test_default_output_shape(self):
        model = VertebraSegmentationUNet(base_channels=4, depth=2)
        x = torch.zeros(2, 1, 64, 64)
        y = model(x)
        assert y.shape == (2, len(SPINAL_LEVELS), 64, 64)

    def test_custom_num_classes_and_in_channels(self):
        model = VertebraSegmentationUNet(in_channels=3, num_classes=5, base_channels=4, depth=2)
        x = torch.zeros(1, 3, 32, 32)
        y = model(x)
        assert y.shape == (1, 5, 32, 32)

    def test_various_depths_preserve_spatial_size(self):
        for depth in (1, 2, 3):
            model = VertebraSegmentationUNet(base_channels=4, depth=depth)
            x = torch.zeros(1, 1, 64, 64)
            y = model(x)
            assert y.shape[2:] == (64, 64), f"depth={depth}"

    def test_rejects_invalid_depth(self):
        import pytest

        with pytest.raises(ValueError, match="depth"):
            VertebraSegmentationUNet(depth=0)

    def test_gradients_flow_to_all_parameters(self):
        model = VertebraSegmentationUNet(base_channels=4, depth=2)
        x = torch.randn(1, 1, 32, 32, requires_grad=True)
        target = torch.zeros(1, len(SPINAL_LEVELS), 32, 32)
        loss = torch.nn.functional.binary_cross_entropy_with_logits(model(x), target)
        loss.backward()
        assert x.grad is not None
        for name, param in model.named_parameters():
            assert param.grad is not None, f"sin gradiente: {name}"

    def test_output_is_finite(self):
        model = VertebraSegmentationUNet(base_channels=4, depth=2)
        model.eval()
        with torch.no_grad():
            y = model(torch.randn(1, 1, 64, 64))
        assert torch.isfinite(y).all()
