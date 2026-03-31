"""Segmentation API endpoints for metadata and binary data serving."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response

import numpy as np
import nibabel as nib
from pathlib import Path

from server.catalog.models import SegmentationMetadata
from server.loaders.nifti_loader import load_nifti_segmentation

router = APIRouter(prefix="/api/v1", tags=["segmentations"])

# In-memory segmentation cache (seg_id -> (data, metadata))
_seg_data_cache: dict[str, tuple] = {}


@router.get("/volumes/{volume_id}/segmentations", response_model=list[SegmentationMetadata])
async def list_segmentations(volume_id: str) -> list[SegmentationMetadata]:
    """Return a list of companion segmentations for the given volume."""
    from server.main import _segmentation_catalog
    
    if volume_id not in _segmentation_catalog:
        raise HTTPException(status_code=404, detail=f"Volume {volume_id} not found")
        
    return _segmentation_catalog[volume_id]


@router.post("/volumes/{volume_id}/segmentations")
async def save_segmentation(volume_id: str, request: Request, filename: str) -> dict:
    """Save binary segmentation data to a NIfTI file."""
    from server.main import _catalog, _segmentation_catalog
    from server.catalog.models import SegmentationMetadata
    from server.api.volumes import _volume_cache
    
    vol_meta = next((v for v in _catalog if v.id == volume_id), None)
    if not vol_meta:
        raise HTTPException(status_code=404, detail=f"Volume {volume_id} not found")
        
    if volume_id not in _volume_cache:
        raise HTTPException(status_code=400, detail=f"Volume {volume_id} must be loaded before saving segmentation")
        
    _, metadata, _ = _volume_cache[volume_id]
    affine = metadata.get("affine", np.eye(4))
    
    body = await request.body()
    
    try:
        dimX, dimY, dimZ = vol_meta.dimensions
        
        # Reshape the client binary input (Z, Y, X) and transpose back to (X, Y, Z)
        data_z_y_x = np.frombuffer(body, dtype=np.uint8).reshape((dimZ, dimY, dimX))
        transposed_array = data_z_y_x.transpose(2, 1, 0)
        
        # Create new NIfTI image using cached affine
        new_img = nib.Nifti1Image(transposed_array, affine)
        new_img.set_data_dtype(np.uint8)
        
        # Save to disk (for DICOM this places it next to the folder)
        out_path = Path(vol_meta.path).parent / filename
        nib.save(new_img, out_path)
        
        # Make sure the catalog knows about this new file
        if volume_id not in _segmentation_catalog:
            _segmentation_catalog[volume_id] = []
            
        seg_id = f"seg_{volume_id}_{filename}"
        existing = next((s for s in _segmentation_catalog[volume_id] if s.name == filename), None)
        if not existing:
            _segmentation_catalog[volume_id].append(SegmentationMetadata(
                id=seg_id,
                name=filename,
                path=str(out_path),
                volume_id=volume_id,
                dimensions=list(vol_meta.dimensions),
                labels=[]
            ))
            
        return {"status": "success", "filename": filename, "path": str(out_path)}
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Failed to save segmentation: {e}")


@router.get("/segmentations/{seg_id}/data")
async def get_segmentation_data(seg_id: str) -> Response:
    """Return segmentation binary data as C-contiguous uint8 bytes.

    Custom headers provide volume geometry for client-side parsing:
    - X-Volume-Dimensions: comma-separated dimension sizes
    """
    from server.main import _segmentation_catalog

    if seg_id not in _seg_data_cache:
        # Resolve seg_id to path
        seg_meta: SegmentationMetadata | None = None
        for vol_segs in _segmentation_catalog.values():
            for seg in vol_segs:
                if seg.id == seg_id:
                    seg_meta = seg
                    break
            if seg_meta:
                break
                
        if not seg_meta:
            raise HTTPException(status_code=404, detail=f"Segmentation {seg_id} not found")
            
        try:
            data, metadata = load_nifti_segmentation(seg_meta.path)
            _seg_data_cache[seg_id] = (data, metadata)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to load segmentation: {e}")

    data, metadata = _seg_data_cache[seg_id]
    dims = metadata["dimensions"]

    headers = {
        "X-Volume-Dimensions": ",".join(str(d) for d in dims),
    }

    return Response(
        content=data.tobytes(),
        media_type="application/octet-stream",
        headers=headers,
    )
