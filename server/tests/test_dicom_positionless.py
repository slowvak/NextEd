# Copyright Bradley J Erickson, 2026.
"""Two ways a series can arrive without usable top-level ImagePositionPatient:

  1. Enhanced (multi-frame) DICOM — one file, N frames, geometry in the
     functional groups. The positions are real and must be used as-is.
  2. Legacy single-frame exports with SliceThickness but no position at all —
     stacked synthetically at 0, t, 2t, ... in slice-number order.

Case 1 must never fall back to case 2: fabricated even spacing would quietly
replace measured geometry.
"""

from pathlib import Path

import numpy as np
import pydicom
import pytest
from pydicom.uid import ExplicitVRLittleEndian

from server.loaders.dicom_loader import load_dicom_series


def _base(ds: pydicom.Dataset, sop: str) -> pydicom.Dataset:
    ds.SOPInstanceUID = sop
    ds.SeriesInstanceUID = "1.2.3.99"
    ds.StudyInstanceUID = "1.2.3.98"
    ds.Modality = "MR"
    ds.Rows = 4
    ds.Columns = 4
    ds.BitsAllocated = 16
    ds.BitsStored = 16
    ds.HighBit = 15
    ds.PixelRepresentation = 0
    ds.SamplesPerPixel = 1
    ds.PhotometricInterpretation = "MONOCHROME2"
    ds.file_meta = pydicom.Dataset()
    ds.file_meta.TransferSyntaxUID = ExplicitVRLittleEndian
    ds.file_meta.MediaStorageSOPClassUID = "1.2.840.10008.5.1.4.1.1.4"
    ds.file_meta.MediaStorageSOPInstanceUID = sop
    return ds


def _positionless_slice(tmp_path: Path, n: int, thickness: float) -> str:
    """A slice with SliceThickness and InstanceNumber but no position tag."""
    ds = _base(pydicom.Dataset(), f"1.2.3.{n}")
    ds.SliceThickness = thickness
    ds.InstanceNumber = n
    ds.PixelData = np.full((4, 4), 100 + n, dtype=np.uint16).tobytes()
    path = str(tmp_path / f"s{n}.dcm")
    ds.save_as(path, write_like_original=False)
    return path


def _enhanced(tmp_path: Path, positions: list[float]) -> str:
    """One Enhanced file whose per-frame groups carry the real geometry."""
    ds = _base(pydicom.Dataset(), "1.2.3.enh")
    ds.SOPClassUID = "1.2.840.10008.5.1.4.1.1.4.1"  # Enhanced MR Image Storage
    ds.NumberOfFrames = len(positions)

    per_frame = []
    for i, z in enumerate(positions):
        pos, orient, meas = pydicom.Dataset(), pydicom.Dataset(), pydicom.Dataset()
        pos.ImagePositionPatient = [0.0, 0.0, z]
        orient.ImageOrientationPatient = [1, 0, 0, 0, 1, 0]
        meas.PixelSpacing = [1.0, 1.0]
        meas.SliceThickness = 2.0
        frame = pydicom.Dataset()
        frame.PlanePositionSequence = pydicom.Sequence([pos])
        frame.PlaneOrientationSequence = pydicom.Sequence([orient])
        frame.PixelMeasuresSequence = pydicom.Sequence([meas])
        content = pydicom.Dataset()
        content.InStackPositionNumber = i + 1
        frame.FrameContentSequence = pydicom.Sequence([content])
        per_frame.append(frame)

    ds.PerFrameFunctionalGroupsSequence = pydicom.Sequence(per_frame)
    ds.SharedFunctionalGroupsSequence = pydicom.Sequence([pydicom.Dataset()])
    stack = np.stack([np.full((4, 4), 10 * (i + 1), dtype=np.uint16)
                      for i in range(len(positions))])
    ds.PixelData = stack.tobytes()
    path = str(tmp_path / "enhanced.dcm")
    ds.save_as(path, write_like_original=False)
    return path


def test_positionless_series_stacks_by_thickness(tmp_path):
    """No position anywhere: stack at 0, t, 2t… ordered by InstanceNumber."""
    thickness = 3.0
    # Deliberately out of order on disk — InstanceNumber decides the stacking.
    paths = [_positionless_slice(tmp_path, n, thickness) for n in (3, 1, 2)]

    data, meta = load_dicom_series(paths)

    assert data.shape[0] == 3, "all three slices should survive"
    # voxel_spacing is [x, y, z] after RAS+ canonicalization.
    z_spacing = meta["voxel_spacing"][2]
    assert z_spacing == pytest.approx(thickness, abs=1e-3), (
        f"slices should sit {thickness}mm apart, got {z_spacing}"
    )


def test_positionless_without_thickness_is_rejected(tmp_path):
    """No position and no thickness: nothing to stack by, so refuse."""
    ds = _base(pydicom.Dataset(), "1.2.3.7")
    ds.InstanceNumber = 1
    ds.PixelData = np.zeros((4, 4), dtype=np.uint16).tobytes()
    path = str(tmp_path / "bare.dcm")
    ds.save_as(path, write_like_original=False)

    with pytest.raises(ValueError):
        load_dicom_series([path])


def test_enhanced_multiframe_expands_to_slices(tmp_path):
    """One Enhanced file becomes N slices at its own per-frame positions."""
    positions = [0.0, 5.4, 10.8, 16.2]
    data, meta = load_dicom_series([_enhanced(tmp_path, positions)])

    assert data.shape[0] == len(positions), (
        f"expected {len(positions)} slices from a {len(positions)}-frame file, "
        f"got {data.shape[0]}"
    )
    # 5.4 is the real per-frame gap; SliceThickness is 2.0. Reading the wrong
    # one is the failure this pins down.
    assert meta["voxel_spacing"][2] == pytest.approx(5.4, abs=1e-3), (
        "spacing must come from the per-frame positions, not SliceThickness"
    )
