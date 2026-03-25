"""NIfTI volume loader with RAS+ normalization and auto-windowing."""

from __future__ import annotations

from pathlib import Path

import nibabel as nib
import numpy as np


def compute_auto_window(data: np.ndarray) -> tuple[float, float]:
    """Compute window center and width from 5th-95th percentile of non-zero voxels.

    Returns (window_center, window_width). Window width is clamped to >= 1
    to avoid zero-width windows. If all voxels are zero, returns (0.0, 1.0).
    """
    nonzero = data[data != 0]
    if nonzero.size == 0:
        return 0.0, 1.0
    p5, p95 = np.percentile(nonzero, [5, 95])
    window_center = float((p5 + p95) / 2)
    window_width = float(max(p95 - p5, 1.0))
    return window_center, window_width


def load_nifti_volume(filepath: str | Path) -> tuple[np.ndarray, dict]:
    """Load a NIfTI volume, normalize to RAS+ canonical orientation.

    Returns:
        tuple of (data, metadata) where:
        - data: C-contiguous float32 numpy array in RAS+ orientation
        - metadata: dict with dimensions, voxel_spacing, dtype,
          window_center, window_width
    """
    img = nib.load(str(filepath))

    # Reorient to RAS+ canonical orientation
    canonical = nib.as_closest_canonical(img)

    # Extract data as C-contiguous float32
    data = np.ascontiguousarray(canonical.get_fdata(dtype=np.float32))

    # Voxel spacing in RAS+ axis order (from canonical header)
    spacing = [float(s) for s in canonical.header.get_zooms()[:3]]

    # Auto-windowing from 5th-95th percentile of non-zero voxels
    window_center, window_width = compute_auto_window(data)

    metadata = {
        "dimensions": [int(d) for d in canonical.shape[:3]],
        "voxel_spacing": spacing,
        "dtype": "float32",
        "window_center": window_center,
        "window_width": window_width,
    }

    return data, metadata
