# Copyright Bradley J Erickson, 2026.
"""Task mode API — supports external workflow integration.

Allows loading volumes and segmentations by filesystem path (rather than
catalog ID), and completing tasks with callback to an external system.
"""

from __future__ import annotations

import ipaddress
import json
import os
import socket
from pathlib import Path
from urllib.parse import urlparse

import httpx
import nibabel as nib
import numpy as np
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response

from server.catalog.models import VolumeMetadata, SegmentationMetadata
from server.loaders.nifti_loader import load_nifti_volume, load_nifti_segmentation

router = APIRouter(prefix="/api/v1/task", tags=["task"])


def _allowed_roots() -> list[Path]:
    raw = os.environ.get("SIGMA_DATA_ROOTS", "")
    roots = [Path(p).expanduser().resolve() for p in raw.split(":") if p.strip()]
    if not roots:
        raise HTTPException(
            status_code=500,
            detail="SIGMA_DATA_ROOTS is not configured. Set it to a colon-separated list of allowed data directories.",
        )
    return roots


def _resolve_within_roots(user_path: str) -> Path:
    resolved = Path(user_path).expanduser().resolve()
    roots = _allowed_roots()
    for root in roots:
        try:
            resolved.relative_to(root)
            return resolved
        except ValueError:
            continue
    raise HTTPException(status_code=403, detail=f"Path outside allowed data roots: {user_path}")


def _validate_callback_url(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise HTTPException(status_code=400, detail="callback_url must be http(s)")
    host = parsed.hostname
    if not host:
        raise HTTPException(status_code=400, detail="callback_url missing host")

    allowed = os.environ.get("SIGMA_CALLBACK_HOSTS", "")
    allowed_hosts = {h.strip().lower() for h in allowed.split(",") if h.strip()}
    if host.lower() in allowed_hosts:
        return

    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror as e:
        raise HTTPException(status_code=400, detail=f"callback_url host unresolvable: {e}")

    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_multicast or ip.is_reserved:
            raise HTTPException(
                status_code=403,
                detail=f"callback_url resolves to non-routable address {ip}. Add {host} to SIGMA_CALLBACK_HOSTS to allow.",
            )


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

    filepath = _resolve_within_roots(path)
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
    filepath = _resolve_within_roots(path)
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


@router.get("/load-segmentation-folder")
async def load_segmentation_folder(folder: str, volume_id: str):
    """Merge all .nii.gz files in a folder into a single uint8 multi-label volume.

    Each file gets a unique integer label (1..N). Returns binary uint8 data with
    X-Label-Names header (comma-separated label=name pairs) and X-Volume-Dimensions.

    Query params:
        folder: absolute path to directory containing per-structure .nii.gz files
        volume_id: ID of the parent volume (for dimension reference)
    """
    folder_path = _resolve_within_roots(folder)
    if not folder_path.exists() or not folder_path.is_dir():
        raise HTTPException(status_code=404, detail=f"Folder not found: {folder}")

    nii_files = sorted(folder_path.glob("*.nii.gz"))
    if not nii_files:
        raise HTTPException(status_code=404, detail=f"No .nii.gz files in folder: {folder}")

    merged = None
    dims = None
    label_names = []

    for label_idx, nii_path in enumerate(nii_files, start=1):
        try:
            data, metadata = load_nifti_segmentation(str(nii_path))
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to load {nii_path.name}: {e}")

        if merged is None:
            dims = metadata["dimensions"]
            merged = np.zeros(data.shape, dtype=np.uint8)

        # data is binary (0/1) or uint8; mark non-zero voxels with this label
        merged[data > 0] = label_idx
        # Strip .nii.gz suffix for display name
        name = nii_path.name.replace(".nii.gz", "").replace("_", " ")
        label_names.append(f"{label_idx}={name}")

    headers = {
        "X-Volume-Dimensions": ",".join(str(d) for d in dims),
        "X-Label-Names": ",".join(label_names),
    }

    return Response(
        content=merged.tobytes(),
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
    callback_auth = body.get("callback_auth")
    output_mask_path = body.get("output_mask_path")
    sigma_decision = body.get("decision", "completed")
    text = body.get("text", "")

    # Map Sigma QC decisions to ewocs workflow decisions
    DECISION_MAP = {
        "accept": "OK",
        "reject": "Cancel",
        "revise": "Cancel",
        "completed": "OK",
    }
    ewocs_decision = DECISION_MAP.get(sigma_decision, "OK")

    result_payload = {
        "status": "completed",
        "task_id": body.get("task_id"),
        "response": {
            "decision": ewocs_decision,
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

    # POST to ewocs callback if provided, forwarding auth token
    if callback_url:
        _validate_callback_url(callback_url)
        try:
            headers = {}
            if callback_auth:
                headers["Authorization"] = f"Bearer {callback_auth}"
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(
                    callback_url,
                    json={"decision": ewocs_decision, "text": text},
                    headers=headers,
                )
                result_payload["callback_status"] = resp.status_code
                if not resp.is_success:
                    result_payload["callback_error"] = resp.text
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

        out = _resolve_within_roots(output_path)
        out.parent.mkdir(parents=True, exist_ok=True)
        nib.save(img, str(out))

        return {"status": "saved", "path": str(out)}
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to save mask: {e}")
