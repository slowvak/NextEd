# Copyright Bradley J Erickson, 2026.
"""Duplicate slice locations (e.g. a second copy of the series in a subfolder)
must not collapse slice spacing to 0 and break the affine."""

from pathlib import Path

import numpy as np
import pydicom
import pytest
from pydicom.uid import ExplicitVRLittleEndian

from server.loaders.dicom_loader import load_dicom_series


def _slice(tmp_path: Path, name: str, z: float) -> str:
    ds = pydicom.Dataset()
    ds.SOPInstanceUID = f"1.2.3.{name}"
    ds.SeriesInstanceUID = "1.2.3.99"
    ds.StudyInstanceUID = "1.2.3.98"
    ds.Modality = "CT"
    ds.Rows = 4
    ds.Columns = 4
    ds.BitsAllocated = 16
    ds.BitsStored = 16
    ds.HighBit = 15
    ds.PixelRepresentation = 0
    ds.SamplesPerPixel = 1
    ds.PhotometricInterpretation = "MONOCHROME2"
    ds.PixelSpacing = [1.0, 1.0]
    ds.SliceThickness = 3.0
    ds.ImageOrientationPatient = [1, 0, 0, 0, 1, 0]
    ds.ImagePositionPatient = [0.0, 0.0, z]
    ds.PixelData = np.full((4, 4), int(z) + 100, dtype=np.uint16).tobytes()
    ds.file_meta = pydicom.Dataset()
    ds.file_meta.TransferSyntaxUID = ExplicitVRLittleEndian
    ds.file_meta.MediaStorageSOPClassUID = "1.2.840.10008.5.1.4.1.1.2"
    ds.file_meta.MediaStorageSOPInstanceUID = ds.SOPInstanceUID
    fpath = str(tmp_path / f"{name}.dcm")
    ds.save_as(fpath, write_like_original=False)
    return fpath


def test_duplicate_slice_locations_are_dropped(tmp_path: Path) -> None:
    zs = [0.0, 3.0, 6.0]
    files = [_slice(tmp_path, f"a{i}", z) for i, z in enumerate(zs)]
    files += [_slice(tmp_path, f"b{i}", z) for i, z in enumerate(zs)]  # copies

    data, metadata = load_dicom_series(files)

    assert metadata["dimensions"][2] == len(zs)
    assert data.shape[0] == len(zs)
    assert metadata["voxel_spacing"][2] == pytest.approx(3.0)
