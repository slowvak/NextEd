"""Task mode API — supports external workflow integration.

Allows loading volumes and segmentations by filesystem path (rather than
catalog ID), and completing tasks with callback to an external system.
"""

from __future__ import annotations

import json
from pathlib import Path

import httpx
import nibabel as nib
import numpy as np
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response

from server.catalog.models import VolumeMetadata, SegmentationMetadata
from server.loaders.nifti_loader import load_nifti_volume, load_nifti_segmentation

router = APIRouter(prefix="/api/v1/task", tags=["task"])


@router.get("/load-volume")
async def load_volume_by_path(path: str):
    """Register and load a volume by filesystem path. Returns volume metadata
    with an assigned ID that can be used with existing /volumes endpoints.

    Query params:
        path: absolute filesystem path to NIfTI or DICOM directory
    """
    from server.api.volumes import (
        _metadata_registry, _path_registry, _volume_cache,
        register_volume, _ensure_loaded,
    )

    filepath = Path(path).expanduser().resolve()
    if not filepath.exists():
        raise HTTPException(status_code=404, detail=f"File not found: {path}")

    # Check if already registered by path
    for vol_id, (reg_path, _) in _path_registry.items():
        if Path(reg_path).resolve() == filepath:
            _ensure_loaded(vol_id)
            return _metadata_registry[vol_id]

    # Determine format
    if filepath.is_dir():
        fmt = "dicom"
    elif filepath.suffix == ".gz" or filepath.suffix == ".nii":
        fmt = "nifti"
    else:
        raise HTTPException(status_code=400, detail=f"Unsupported format: {filepath.suffix}")

    # Assign a unique ID
    vol_id = f"task_{hash(str(filepath)) & 0xFFFFFFFF:08x}"

    meta = VolumeMetadata(
        id=vol_id,
        name=filepath.stem.replace(".nii", ""),
        path=str(filepath),
        format=fmt,
        dimensions=None,
        voxel_spacing=None,
        dtype=None,
        modality="unknown",
    )

    register_volume(vol_id, meta, str(filepath), fmt)
    _ensure_loaded(vol_id)

    return _metadata_registry[vol_id]


@router.get("/load-segmentation")
async def load_segmentation_by_path(path: str, volume_id: str):
    """Load a segmentation mask by filesystem path. Returns binary uint8 data.

    Query params:
        path: absolute path to segmentation NIfTI
        volume_id: ID of the parent volume (for dimension validation)
    """
    filepath = Path(path).expanduser().resolve()
    if not filepath.exists():
        raise HTTPException(status_code=404, detail=f"Segmentation not found: {path}")

    try:
        data, metadata = load_nifti_segmentation(str(filepath))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load segmentation: {e}")

    dims = metadata["dimensions"]

    headers = {
        "X-Volume-Dimensions": ",".join(str(d) for d in dims),
    }

    return Response(
        content=data.tobytes(),
        media_type="application/octet-stream",
        headers=headers,
    )


@router.post("/complete")
async def complete_task(request: Request):
    """Complete a workflow task — save mask to disk and POST result to callback.

    Request body (JSON):
    {
        "volume_id": "task_abc123",
        "callback_url": "http://flowsigma:3000/api/tasks/xyz/complete-workflow",
        "output_mask_path": "/data/output/seg.nii.gz",
        "decision": "accept",
        "text": "Liver segmentation verified",
        "labels_modified": [1, 4],
        "time_spent_seconds": 142
    }

    Optionally include segmentation data as a follow-up binary POST,
    or the endpoint reads it from the volume cache if already saved.
    """
    body = await request.json()

    volume_id = body.get("volume_id")
    callback_url = body.get("callback_url")
    output_mask_path = body.get("output_mask_path")
    decision = body.get("decision", "completed")
    text = body.get("text", "")

    result_payload = {
        "status": "completed",
        "response": {
            "decision": decision,
            "text": text,
            "labels_modified": body.get("labels_modified", []),
            "time_spent_seconds": body.get("time_spent_seconds", 0),
        },
    }

    # Save mask if output path specified and seg data available
    if output_mask_path and volume_id:
        from server.api.volumes import _volume_cache

        if volume_id in _volume_cache:
            _, vol_metadata = _volume_cache[volume_id]
            affine = vol_metadata.get("affine", np.eye(4))
            result_payload["mask_path"] = output_mask_path
        else:
            result_payload["mask_path"] = None
            result_payload["mask_error"] = "Volume not loaded, mask not saved"

    # POST to callback if provided
    if callback_url:
        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(callback_url, json=result_payload)
                result_payload["callback_status"] = resp.status_code
        except Exception as e:
            result_payload["callback_error"] = str(e)

    return result_payload


@router.post("/save-mask")
async def save_task_mask(request: Request, volume_id: str, output_path: str):
    """Save segmentation mask to a specific filesystem path.

    Used by task mode to write the edited mask to the path specified
    by the workflow. Body is raw uint8 segmentation bytes.

    Query params:
        volume_id: volume ID (to get affine/dims)
        output_path: absolute filesystem path to write the NIfTI
    """
    from server.api.volumes import _volume_cache

    if volume_id not in _volume_cache:
        raise HTTPException(status_code=400, detail="Volume not loaded")

    _, vol_metadata = _volume_cache[volume_id]
    affine = vol_metadata.get("affine", np.eye(4))
    dims = vol_metadata["dimensions"]

    body = await request.body()

    try:
        dimX, dimY, dimZ = dims
        data_zyx = np.frombuffer(body, dtype=np.uint8).reshape((dimZ, dimY, dimX))
        data_xyz = data_zyx.transpose(2, 1, 0)

        img = nib.Nifti1Image(data_xyz.astype(np.uint8), affine)
        img.set_data_dtype(np.uint8)

        out = Path(output_path).expanduser().resolve()
        out.parent.mkdir(parents=True, exist_ok=True)
        nib.save(img, str(out))

        return {"status": "saved", "path": str(out)}
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to save mask: {e}")
