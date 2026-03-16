"""Compatibility shims for third-party deps."""
import sys

try:
    import torchvision  # noqa: F401
except Exception:
    torchvision = None

if torchvision is not None:
    try:
        import torchvision.transforms.functional_tensor  # noqa: F401
    except Exception:
        try:
            from torchvision.transforms import _functional_tensor as _ft
            sys.modules["torchvision.transforms.functional_tensor"] = _ft
        except Exception:
            pass
