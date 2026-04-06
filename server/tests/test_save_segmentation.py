"""Tests for format-aware save_segmentation endpoint.

Verifies that:
- NIfTI volumes use the unchanged NIfTI save path (SEG-02)
- DICOM volumes route to build_dicom_seg (SEG-03)
- suppress_list.add() is called before DICOM-SEG write (D-08)
- NIfTI save produces a real file on disk
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import numpy as np
import pytest

# Ensure server package is importable
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))

from fastapi.testclient import TestClient


def _make_vol_meta(vol_id="0", fmt="nifti", dims=(4, 4, 4), path="/tmp/test.nii.gz"):
    """Create a minimal VolumeMetadata-like object."""
    from server.catalog.models import VolumeMetadata

    return VolumeMetadata(
        id=vol_id,
        name="test",
        path=path,
        format=fmt,
        dimensions=list(dims),
        voxel_spacing=[1.0, 1.0, 1.0],
        dtype="float32",
        modality="CT",
    )


def _setup_app_state(vol_meta, path_entry, fmt, affine=None):
    """Patch the global state needed by save_segmentation."""
    if affine is None:
        affine = np.eye(4)
    metadata = {"affine": affine}
    data = np.zeros((4, 4, 4), dtype=np.float32)
    return {
        "server.main._catalog": [vol_meta],
        "server.main._segmentation_catalog": {vol_meta.id: []},
        "server.api.volumes._volume_cache": {vol_meta.id: (data, metadata)},
        "server.api.volumes._path_registry": {vol_meta.id: (path_entry, fmt)},
    }


def test_format_selection_nifti(tmp_path):
    """NIfTI volumes use the NIfTI save path (SEG-02)."""
    from server.main import app

    nifti_path = str(tmp_path / "test.nii.gz")
    vol_meta = _make_vol_meta(fmt="nifti", path=nifti_path)
    patches = _setup_app_state(vol_meta, nifti_path, "nifti")

    body = np.zeros((4, 4, 4), dtype=np.uint8).tobytes()

    with patch.dict("server.main.__dict__", {
        "_catalog": patches["server.main._catalog"],
        "_segmentation_catalog": patches["server.main._segmentation_catalog"],
    }), patch.dict("server.api.volumes.__dict__", {
        "_volume_cache": patches["server.api.volumes._volume_cache"],
        "_path_registry": patches["server.api.volumes._path_registry"],
    }), patch("server.api.segmentations.manager") as mock_manager:
        mock_manager.broadcast = AsyncMock()
        client = TestClient(app)
        resp = client.post(
            f"/api/v1/volumes/{vol_meta.id}/segmentations?filename=seg_test.nii.gz",
            content=body,
        )

    assert resp.status_code == 200
    result = resp.json()
    assert result["status"] == "success"
    assert result["path"].endswith("seg_test.nii.gz")


def test_format_selection_dicom():
    """DICOM volumes route to build_dicom_seg (SEG-03)."""
    from server.main import app

    dicom_files = ["/tmp/test1.dcm", "/tmp/test2.dcm"]
    path_entry = json.dumps(dicom_files)
    vol_meta = _make_vol_meta(fmt="dicom_series", path=path_entry)
    patches = _setup_app_state(vol_meta, path_entry, "dicom_series")

    body = np.ones((4, 4, 4), dtype=np.uint8).tobytes()

    mock_dataset = MagicMock()
    mock_dataset.save_as = MagicMock()

    with patch.dict("server.main.__dict__", {
        "_catalog": patches["server.main._catalog"],
        "_segmentation_catalog": patches["server.main._segmentation_catalog"],
    }), patch.dict("server.api.volumes.__dict__", {
        "_volume_cache": patches["server.api.volumes._volume_cache"],
        "_path_registry": patches["server.api.volumes._path_registry"],
    }), patch("server.api.segmentations.build_dicom_seg", return_value=(mock_dataset, [(1, "Label1")])) as mock_build, \
         patch("server.api.segmentations.manager") as mock_manager:
        mock_manager.broadcast = AsyncMock()
        client = TestClient(app)
        resp = client.post(
            f"/api/v1/volumes/{vol_meta.id}/segmentations?filename=my_seg",
            content=body,
        )

    assert resp.status_code == 200
    # Verify build_dicom_seg was called (format correctly routed)
    mock_build.assert_called_once()
    call_kwargs = mock_build.call_args
    assert call_kwargs[1]["dicom_file_paths"] == dicom_files


def test_nifti_save_produces_file(tmp_path):
    """NIfTI save produces an actual file on disk (SEG-02)."""
    import nibabel as nib

    from server.main import app

    # Create a real minimal NIfTI volume
    vol_data = np.zeros((4, 4, 4), dtype=np.float32)
    img = nib.Nifti1Image(vol_data, np.eye(4))
    vol_path = tmp_path / "brain.nii.gz"
    nib.save(img, vol_path)

    vol_meta = _make_vol_meta(fmt="nifti", path=str(vol_path))
    patches = _setup_app_state(vol_meta, str(vol_path), "nifti")

    seg_data = np.zeros((4, 4, 4), dtype=np.uint8)
    seg_data[1, 1, 1] = 1  # one labeled voxel
    body = seg_data.tobytes()

    with patch.dict("server.main.__dict__", {
        "_catalog": patches["server.main._catalog"],
        "_segmentation_catalog": patches["server.main._segmentation_catalog"],
    }), patch.dict("server.api.volumes.__dict__", {
        "_volume_cache": patches["server.api.volumes._volume_cache"],
        "_path_registry": patches["server.api.volumes._path_registry"],
    }), patch("server.api.segmentations.manager") as mock_manager:
        mock_manager.broadcast = AsyncMock()
        client = TestClient(app)
        resp = client.post(
            f"/api/v1/volumes/{vol_meta.id}/segmentations?filename=brain_seg.nii.gz",
            content=body,
        )

    assert resp.status_code == 200
    out_path = Path(resp.json()["path"])
    assert out_path.exists()
    assert out_path.name == "brain_seg.nii.gz"


def test_suppress_list_called_for_dicom():
    """suppress_list.add() is called with output path for DICOM saves (D-08)."""
    from server.main import app
    from server.watcher.suppress import WatcherSuppressList

    dicom_files = ["/tmp/series1/img001.dcm"]
    path_entry = json.dumps(dicom_files)
    vol_meta = _make_vol_meta(fmt="dicom_series", path=path_entry)
    patches = _setup_app_state(vol_meta, path_entry, "dicom_series")

    body = np.ones((4, 4, 4), dtype=np.uint8).tobytes()

    mock_dataset = MagicMock()
    mock_dataset.save_as = MagicMock()

    mock_suppress = MagicMock(spec=WatcherSuppressList)

    with patch.dict("server.main.__dict__", {
        "_catalog": patches["server.main._catalog"],
        "_segmentation_catalog": patches["server.main._segmentation_catalog"],
        "suppress_list": mock_suppress,
    }), patch.dict("server.api.volumes.__dict__", {
        "_volume_cache": patches["server.api.volumes._volume_cache"],
        "_path_registry": patches["server.api.volumes._path_registry"],
    }), patch("server.api.segmentations.build_dicom_seg", return_value=(mock_dataset, [(1, "Label1")])), \
         patch("server.api.segmentations.manager") as mock_manager:
        mock_manager.broadcast = AsyncMock()
        client = TestClient(app)
        resp = client.post(
            f"/api/v1/volumes/{vol_meta.id}/segmentations?filename=test_seg",
            content=body,
        )

    assert resp.status_code == 200
    # Verify suppress_list.add was called with the output path
    mock_suppress.add.assert_called_once()
    call_arg = mock_suppress.add.call_args[0][0]
    assert call_arg.endswith("test_seg.dcm")
