"""Multi-volume endpoints: resampling and volumetric registration."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel

router = APIRouter(prefix="/api/v1", tags=["multivolume"])

# Lazy import of volumes internals to avoid circular imports at module load
def _get_volume_cache():
    from server.api.volumes import _volume_cache, _metadata_registry, _ensure_loaded
    return _volume_cache, _metadata_registry, _ensure_loaded


class ResampleRequest(BaseModel):
    target_dims: list[int]  # [X, Y, Z] matching the client's dimension convention


class RegistrationRequest(BaseModel):
    source_id: str
    target_id: str
    method: str = "rigid"


@router.post("/volumes/{volume_id}/resample")
async def resample_volume(volume_id: str, body: ResampleRequest) -> Response:
    """Resample a volume to target dimensions using linear interpolation.

    target_dims must be [X, Y, Z] (matching the client's dimension convention).
    Internally converts to [Z, Y, X] for the numpy array operation.
    Returns raw float32 bytes with the same (Z, Y, X) layout as /data.
    """
    import numpy as np
    import scipy.ndimage

    _volume_cache, _metadata_registry, _ensure_loaded = _get_volume_cache()

    if volume_id not in _metadata_registry:
        raise HTTPException(status_code=404, detail=f"Volume {volume_id} not found")

    _ensure_loaded(volume_id)
    data, _ = _volume_cache[volume_id]   # numpy array (Z, Y, X)
    meta = _metadata_registry[volume_id]

    target = body.target_dims  # [X, Y, Z] from client
    if len(target) != 3:
        raise HTTPException(status_code=422, detail="target_dims must have 3 elements [X, Y, Z]")

    # Convert client [X, Y, Z] → [Z, Y, X] to match the (Z,Y,X) array axes
    target_zyx = [target[2], target[1], target[0]]
    zoom = [target_zyx[i] / data.shape[i] for i in range(3)]
    resampled = scipy.ndimage.zoom(data, zoom, order=3).astype(np.float32)  # cubic B-spline

    # Derive new spacing proportionally.
    # voxel_spacing = [X_sp, Y_sp, Z_sp]; data.shape = (Z, Y, X); target = [X_new, Y_new, Z_new]
    orig_spacing = meta.voxel_spacing or [1.0, 1.0, 1.0]
    new_spacing = [
        orig_spacing[0] * data.shape[2] / target[0],  # X
        orig_spacing[1] * data.shape[1] / target[1],  # Y
        orig_spacing[2] * data.shape[0] / target[2],  # Z
    ]

    new_id = f"{volume_id}_resampled_{'x'.join(str(d) for d in target)}"

    from server.loaders.nifti_loader import compute_auto_window
    wc, ww = compute_auto_window(resampled)
    loader_meta = {
        "dimensions": list(target),   # [X, Y, Z]
        "voxel_spacing": new_spacing,  # [X, Y, Z]
        "window_center": wc,
        "window_width": ww,
        "data_min": float(np.min(resampled)),
        "data_max": float(np.max(resampled)),
    }
    _volume_cache[new_id] = (resampled, loader_meta)
    from server.catalog.models import VolumeMetadata
    _metadata_registry[new_id] = meta.model_copy(update={
        "id": new_id,
        "dimensions": list(target),   # [X, Y, Z]
        "voxel_spacing": new_spacing,  # [X, Y, Z]
        "window_center": wc,
        "window_width": ww,
    })

    return Response(
        content=resampled.tobytes(),
        media_type="application/octet-stream",
        headers={
            "X-Volume-Id": new_id,
            "X-Volume-Dimensions": ",".join(str(d) for d in target),  # [X, Y, Z]
            "X-Voxel-Spacing": ",".join(f"{s:.6f}" for s in new_spacing),
        },
    )


@router.post("/registration")
async def register_volumes(body: RegistrationRequest) -> Response:
    """Register source volume onto target using rigid or affine registration.

    Uses SimpleITK. Returns the resampled source volume ID and transform parameters.
    The resampled volume is registered into the target's voxel space so cursor
    coordinates map 1:1 between the two windows after registration.
    """
    try:
        import SimpleITK as sitk
    except ImportError:
        raise HTTPException(
            status_code=501,
            detail="SimpleITK not installed. Run: uv add simpleitk",
        )

    import numpy as np

    _volume_cache, _metadata_registry, _ensure_loaded = _get_volume_cache()

    for vid in (body.source_id, body.target_id):
        if vid not in _metadata_registry:
            raise HTTPException(status_code=404, detail=f"Volume {vid} not found")
        _ensure_loaded(vid)

    source_arr, _ = _volume_cache[body.source_id]
    target_arr, _ = _volume_cache[body.target_id]

    source_meta = _metadata_registry[body.source_id]
    target_meta = _metadata_registry[body.target_id]

    fixed  = sitk.GetImageFromArray(target_arr.astype(np.float32))
    moving = sitk.GetImageFromArray(source_arr.astype(np.float32))

    # voxel_spacing is [X_sp, Y_sp, Z_sp] (RAS+ order from NIfTI get_zooms).
    # SimpleITK also expects [X_sp, Y_sp, Z_sp] — pass directly, no reversal.
    def _sitk_spacing(sp):
        return list(sp) if sp else [1.0, 1.0, 1.0]

    fixed.SetSpacing(_sitk_spacing(target_meta.voxel_spacing))
    moving.SetSpacing(_sitk_spacing(source_meta.voxel_spacing))

    # Initial alignment by center of mass
    initial_tx = sitk.CenteredTransformInitializer(
        fixed, moving,
        sitk.Euler3DTransform() if body.method == "rigid" else sitk.AffineTransform(3),
        sitk.CenteredTransformInitializerFilter.GEOMETRY,
    )

    reg = sitk.ImageRegistrationMethod()
    reg.SetMetricAsMattesMutualInformation(numberOfHistogramBins=50)
    reg.SetMetricSamplingStrategy(reg.RANDOM)
    reg.SetMetricSamplingPercentage(0.1)
    reg.SetInterpolator(sitk.sitkLinear)
    reg.SetOptimizerAsRegularStepGradientDescent(
        learningRate=1.0,
        minStep=0.001,
        numberOfIterations=200,
    )
    reg.SetOptimizerScalesFromPhysicalShift()
    reg.SetInitialTransform(initial_tx, inPlace=False)
    reg.SetShrinkFactorsPerLevel([4, 2, 1])
    reg.SetSmoothingSigmasPerLevel([2, 1, 0])
    reg.SmoothingSigmasAreSpecifiedInPhysicalUnitsOn()

    final_tx = reg.Execute(
        sitk.Cast(fixed, sitk.sitkFloat32),
        sitk.Cast(moving, sitk.sitkFloat32),
    )

    resampled_sitk = sitk.Resample(
        moving, fixed, final_tx,
        sitk.sitkBSpline, 0.0, moving.GetPixelID(),
    )
    resampled_arr = sitk.GetArrayFromImage(resampled_sitk).astype(np.float32)

    resampled_arr = np.ascontiguousarray(resampled_arr)
    # target_arr.shape is (Z, Y, X); client expects dimensions as [X, Y, Z]
    target_shape = target_arr.shape
    new_dims = [target_shape[2], target_shape[1], target_shape[0]]  # [X, Y, Z]
    new_spacing = target_meta.voxel_spacing or [1.0, 1.0, 1.0]     # [X, Y, Z]

    # Return binary directly — avoids a second round-trip and any cache dependency.
    # W/L headers omitted: client preserves the source volume's window settings.
    return Response(
        content=resampled_arr.astype(np.float32).tobytes(),
        media_type="application/octet-stream",
        headers={
            "X-Volume-Dimensions": ",".join(str(d) for d in new_dims),   # [X, Y, Z]
            "X-Voxel-Spacing":     ",".join(f"{s:.6f}" for s in new_spacing),
        },
    )
