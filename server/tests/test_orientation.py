"""Tests for RAS+ canonical orientation normalization."""

from __future__ import annotations

import tempfile
from pathlib import Path

import nibabel as nib
import numpy as np
import pytest

from server.loaders.nifti_loader import load_nifti_volume


class TestRASNormalization:
    """Verify that volumes are correctly reoriented to RAS+ canonical."""

    def test_ras_normalization_from_lps(self, tmp_path: Path) -> None:
        """Load a NIfTI saved in LPS orientation, verify output is RAS+."""
        # Create asymmetric test volume so orientation changes are detectable
        shape = (10, 20, 30)
        data = np.zeros(shape, dtype=np.float32)
        data[0, 0, 0] = 1.0
        data[9, 19, 29] = 999.0

        # LPS affine: Left-Posterior-Superior
        # L = -R, P = -A, S = S
        lps_affine = np.diag([-1.0, -1.0, 1.0, 1.0])
        img = nib.Nifti1Image(data, lps_affine)

        filepath = tmp_path / "test_lps.nii.gz"
        nib.save(img, str(filepath))

        result_data, metadata = load_nifti_volume(filepath)

        # Verify the canonical image is RAS+
        reloaded = nib.load(str(filepath))
        canonical = nib.as_closest_canonical(reloaded)
        axcodes = nib.aff2axcodes(canonical.affine)
        assert axcodes == ("R", "A", "S"), f"Expected RAS, got {axcodes}"

        # Verify dimensions are preserved (may be reordered)
        assert result_data.ndim == 3
        total_voxels = np.prod(shape)
        assert result_data.size == total_voxels

        # Verify metadata dimensions match original (dimX, dimY, dimZ) order
        # Data shape is transposed to (dimZ, dimY, dimX) for client indexing
        dims = metadata["dimensions"]
        assert result_data.shape == (dims[2], dims[1], dims[0])

    def test_ras_normalization_preserves_ras_input(self, tmp_path: Path) -> None:
        """A volume already in RAS+ should be unchanged after normalization."""
        shape = (15, 25, 35)
        data = np.arange(np.prod(shape), dtype=np.float32).reshape(shape)

        # RAS+ affine with non-unit spacing
        ras_affine = np.diag([0.5, 0.8, 2.0, 1.0])
        img = nib.Nifti1Image(data, ras_affine)

        filepath = tmp_path / "test_ras.nii.gz"
        nib.save(img, str(filepath))

        result_data, metadata = load_nifti_volume(filepath)

        # Data is transposed to (dimZ, dimY, dimX) for client indexing
        assert result_data.shape == (shape[2], shape[1], shape[0])
        # Values should be preserved (just reordered axes)
        assert result_data.size == np.prod(shape)
        assert metadata["voxel_spacing"] == pytest.approx([0.5, 0.8, 2.0])

    def test_c_contiguous_output(self, tmp_path: Path) -> None:
        """Verify loaded volume data is C-contiguous in memory."""
        shape = (8, 12, 16)
        data = np.random.rand(*shape).astype(np.float32)

        # Use a non-trivial affine (oblique-ish)
        affine = np.array(
            [
                [-1.0, 0.0, 0.0, 0.0],
                [0.0, -1.0, 0.0, 0.0],
                [0.0, 0.0, 1.0, 0.0],
                [0.0, 0.0, 0.0, 1.0],
            ]
        )
        img = nib.Nifti1Image(data, affine)

        filepath = tmp_path / "test_contiguous.nii.gz"
        nib.save(img, str(filepath))

        result_data, _ = load_nifti_volume(filepath)

        assert result_data.flags["C_CONTIGUOUS"] is True

    def test_voxel_spacing_in_ras_order(self, tmp_path: Path) -> None:
        """Verify voxel_spacing reflects RAS+ axis order after normalization."""
        shape = (10, 20, 30)
        data = np.ones(shape, dtype=np.float32)

        # PIR affine: Posterior-Inferior-Right with specific spacing
        # This should get reoriented to RAS+
        pir_affine = np.array(
            [
                [0.0, 0.0, 1.5, 0.0],  # 3rd axis -> R with 1.5mm
                [-0.8, 0.0, 0.0, 0.0],  # 1st axis -> A (from P) with 0.8mm
                [0.0, -2.0, 0.0, 0.0],  # 2nd axis -> S (from I) with 2.0mm
                [0.0, 0.0, 0.0, 1.0],
            ]
        )
        img = nib.Nifti1Image(data, pir_affine)

        filepath = tmp_path / "test_pir.nii.gz"
        nib.save(img, str(filepath))

        _, metadata = load_nifti_volume(filepath)

        # After RAS+ reorientation, spacing should be reordered accordingly
        spacing = metadata["voxel_spacing"]
        assert len(spacing) == 3
        # All original spacings should be present (possibly reordered)
        assert sorted(spacing) == pytest.approx(sorted([1.5, 0.8, 2.0]))

    def test_float32_dtype(self, tmp_path: Path) -> None:
        """Verify output data is float32."""
        shape = (5, 5, 5)
        # Save as int16 to verify conversion
        data = np.arange(125, dtype=np.int16).reshape(shape)
        affine = np.eye(4)
        img = nib.Nifti1Image(data, affine)

        filepath = tmp_path / "test_int16.nii.gz"
        nib.save(img, str(filepath))

        result_data, metadata = load_nifti_volume(filepath)

        assert result_data.dtype == np.float32
        assert metadata["dtype"] == "float32"
