"""DICOM volume loader with RAS+ normalization and auto-windowing."""

from __future__ import annotations

from pathlib import Path

import nibabel as nib
import numpy as np
import pydicom

from server.loaders.nifti_loader import compute_auto_window


def _build_affine(
    orientation: list[float],
    position: list[float],
    pixel_spacing: list[float],
    slice_positions: list[float],
    n_slices: int,
) -> np.ndarray:
    """Build a 4x4 affine matrix from DICOM geometry tags.

    Args:
        orientation: ImageOrientationPatient (6 floats: row_cosines + col_cosines)
        position: ImagePositionPatient of first slice (3 floats)
        pixel_spacing: PixelSpacing [row_spacing, col_spacing]
        slice_positions: sorted list of ImagePositionPatient z-values for all slices
        n_slices: number of slices
    """
    row_cosine = np.array(orientation[:3])
    col_cosine = np.array(orientation[3:6])

    # Compute slice direction from cross product of row and column cosines
    slice_cosine = np.cross(row_cosine, col_cosine)

    # Compute slice spacing from actual positions if possible
    if n_slices > 1 and len(slice_positions) > 1:
        slice_spacing = abs(slice_positions[1] - slice_positions[0])
    else:
        slice_spacing = 1.0

    # Build affine: columns are scaled direction cosines
    affine = np.eye(4)
    affine[:3, 0] = row_cosine * pixel_spacing[1]  # column spacing
    affine[:3, 1] = col_cosine * pixel_spacing[0]  # row spacing
    affine[:3, 2] = slice_cosine * slice_spacing
    affine[:3, 3] = position

    return affine


def load_dicom_volume(folder: str | Path) -> tuple[np.ndarray, dict]:
    """Load a DICOM series from a folder, normalize to RAS+ canonical orientation.

    Reads all .dcm files in the folder, sorts by ImagePositionPatient,
    assembles into a 3D volume, then normalizes to RAS+ using nibabel.

    Returns:
        tuple of (data, metadata) where:
        - data: C-contiguous float32 numpy array in RAS+ orientation
        - metadata: dict with dimensions, voxel_spacing, dtype,
          window_center, window_width
    """
    folder = Path(folder)
    dcm_files = sorted(folder.glob("*.dcm"))
    if not dcm_files:
        # Also try without extension filter (some DICOM files lack .dcm)
        dcm_files = [
            f
            for f in sorted(folder.iterdir())
            if f.is_file() and not f.name.startswith(".")
        ]

    if not dcm_files:
        raise FileNotFoundError(f"No DICOM files found in {folder}")

    # Read all slices
    slices = []
    for f in dcm_files:
        try:
            ds = pydicom.dcmread(str(f))
            if hasattr(ds, "pixel_array"):
                slices.append(ds)
        except Exception:
            continue

    if not slices:
        raise ValueError(f"No valid DICOM slices with pixel data in {folder}")

    # Sort by ImagePositionPatient z-coordinate (slice position)
    slices.sort(key=lambda s: float(s.ImagePositionPatient[2]))

    # Extract geometry from first slice
    first = slices[0]
    orientation = [float(v) for v in first.ImageOrientationPatient]
    position = [float(v) for v in first.ImagePositionPatient]
    pixel_spacing = [float(v) for v in first.PixelSpacing]

    # Collect slice positions for affine computation
    slice_positions = [float(s.ImagePositionPatient[2]) for s in slices]

    # Assemble 3D volume (rows x cols x slices)
    rows, cols = first.Rows, first.Columns
    volume_3d = np.zeros((rows, cols, len(slices)), dtype=np.float32)
    for i, s in enumerate(slices):
        arr = s.pixel_array.astype(np.float32)
        # Apply rescale slope/intercept if present (e.g., CT Hounsfield units)
        slope = float(getattr(s, "RescaleSlope", 1.0))
        intercept = float(getattr(s, "RescaleIntercept", 0.0))
        arr = arr * slope + intercept
        volume_3d[:, :, i] = arr

    # Build affine from DICOM geometry
    affine = _build_affine(
        orientation, position, pixel_spacing, slice_positions, len(slices)
    )

    # Wrap in nibabel NIfTI image for RAS+ normalization
    nii_img = nib.Nifti1Image(volume_3d, affine)
    canonical = nib.as_closest_canonical(nii_img)

    # Extract data, transpose to (Z, Y, X) so X varies fastest in C order
    # Matches client indexing: index = x + y*dimX + z*dimX*dimY
    raw = canonical.get_fdata(dtype=np.float32)
    data = np.ascontiguousarray(raw.transpose(2, 1, 0))

    # Voxel spacing in RAS+ axis order
    spacing = [float(s) for s in canonical.header.get_zooms()[:3]]

    # Auto-windowing
    window_center, window_width = compute_auto_window(data)

    metadata = {
        "dimensions": [int(d) for d in canonical.shape[:3]],
        "voxel_spacing": spacing,
        "dtype": "float32",
        "window_center": window_center,
        "window_width": window_width,
    }

    return data, metadata
