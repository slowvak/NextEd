"""Tests for segmentation discovery logic."""

import pytest
from pathlib import Path
import json
from server.main import _find_companion_segmentations, _discover_all

def test_find_companion_segmentations(tmp_path: Path):
    d = tmp_path / "data"
    d.mkdir()
    
    # Create main volume
    vol_nii_gz = d / "brain.nii.gz"
    vol_nii_gz.touch()
    
    vol_nii = d / "liver.nii"
    vol_nii.touch()
    
    # Create companions for brain
    (d / "brain_segmentation.nii.gz").touch()
    (d / "brain_seg.nii").touch()
    
    # Create non-matches for brain
    (d / "brain_mask.nii.gz").touch()
    (d / "brain2_seg.nii.gz").touch()
    
    # Create companion json for brain_segmentation
    brain_json = d / "brain_segmentation.json"
    with open(brain_json, "w") as f:
        json.dump({"labels": [{"value": 1, "name": "Left Brain", "color": "#ff0000"}]}, f)
    
    # Find for brain.nii.gz
    found_brain = _find_companion_segmentations(vol_nii_gz)
    assert len(found_brain) == 2
    
    paths = [p for p, _ in found_brain]
    names = [p.name for p in paths]
    assert "brain_segmentation.nii.gz" in names
    assert "brain_seg.nii" in names
    
    # Check JSON parsed for brain_segmentation
    for p, labels in found_brain:
        if p.name == "brain_segmentation.nii.gz":
            assert len(labels) == 1
            assert labels[0]["name"] == "Left Brain"
        else:
            assert labels == []
    
    # Find for liver.nii
    found_liver = _find_companion_segmentations(vol_nii)
    assert len(found_liver) == 0

def test_discover_volumes_excludes_segmentations(tmp_path: Path):
    d = tmp_path / "data"
    d.mkdir()

    # Create valid NIfTI files (need real headers for nibabel)
    import nibabel as nib
    import numpy as np

    # Create volumes with dims >= 5 so they pass the minimum dimension filter
    vol_data = np.zeros((10, 10, 10), dtype=np.float32)
    for name in ["chest.nii.gz", "head.nii"]:
        img = nib.Nifti1Image(vol_data, np.eye(4))
        nib.save(img, str(d / name))

    # Create segmentation files (also valid NIfTI so they'd be found if not filtered)
    for name in ["chest_segmentation.nii.gz", "chest_seg.nii", "head_seg.nii.gz"]:
        img = nib.Nifti1Image(vol_data, np.eye(4))
        nib.save(img, str(d / name))

    found = _discover_all([str(tmp_path)])

    # Should only find chest.nii.gz and head.nii
    assert len(found) == 2
    paths = [e["path"] for e in found]
    assert any(p.endswith("chest.nii.gz") for p in paths)
    assert any(p.endswith("head.nii") for p in paths)
    assert not any("seg" in p.lower() for p in paths)
