# Copyright Bradley J Erickson, 2026.
"""AI model execution API — proxy inference to a single AI server."""

from __future__ import annotations

import asyncio
import json
import os
import tempfile
import uuid
from pathlib import Path

import numpy as np
import nibabel as nib
from fastapi import APIRouter, HTTPException, Request, UploadFile, File, Form
from fastapi.responses import Response, StreamingResponse

router = APIRouter(prefix="/api/v1/ai", tags=["ai"])


def _auth_headers() -> dict[str, str]:
    """Credentials for SigmaServer's protected endpoints (predict, upload, delete)."""
    key = os.environ.get("SIGMASERVER_API_KEY", "")
    if not key:
        raise HTTPException(
            status_code=503,
            detail="SIGMASERVER_API_KEY is not configured — start.sh sets it for both servers",
        )
    return {"X-API-Key": key}

# In-memory job store: job_id -> job dict
_jobs: dict[str, dict] = {}

# Path to the models config directory (set by main.py at startup)
_models_dir: Path | None = None


def set_models_dir(path: Path):
    global _models_dir
    _models_dir = path


def _load_config() -> dict:
    """Read AI config from the unified config.json."""
    from server.api.config import get_config_data
    cfg = get_config_data()
    return cfg.get("ai", {"server": "", "models": []})


async def _fetch_dynamic_models(config: dict) -> list[dict]:
    """Fetch models from inference server, fallback to config.json models."""
    import httpx
    
    server_url = config.get("server", "").rstrip("/")
    if not server_url:
        return config.get("models", [])
        
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{server_url}/models")
            if resp.status_code == 200:
                dynamic_models = resp.json()
                if isinstance(dynamic_models, list) and len(dynamic_models) > 0:
                    return dynamic_models
    except Exception as e:
        print(f"Warning: Failed to fetch models from AI server {server_url}: {e}")
        
    return config.get("models", [])


@router.get("/models")
async def list_models():
    """Return available AI models by querying SigmaServer's /models endpoint.

    Returns null if the server is not configured or unreachable (so the client
    can prompt for host/port), or a list (possibly empty) if the server responded.
    """
    import httpx

    config = _load_config()
    server_url = config.get("server", "").rstrip("/")
    if not server_url:
        return None

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{server_url}/models")
            if resp.status_code == 200:
                return resp.json()
            return None
    except Exception:
        return None


@router.post("/run")
async def run_model(request: Request):
    """Submit an AI inference job.

    Request body: { "volume_id": "0", "model_id": "totalsegmentator" }
    Optionally includes "seg_data" as base64 when model.accepts_labels is true,
    but the preferred path is for the client to upload seg data first via
    POST /api/v1/ai/upload-seg/{volume_id}.

    Returns: { "job_id": "uuid" }
    """
    from server.api.volumes import _volume_cache, _ensure_loaded, _path_registry

    body = await request.json()
    volume_id = body.get("volume_id")
    model_id = body.get("model_id")
    start_slice = body.get("start_slice")
    end_slice = body.get("end_slice")
    fast = body.get("fast")  # True/False/None; None means SigmaServer uses its platform default

    if not volume_id or not model_id:
        raise HTTPException(status_code=400, detail="volume_id and model_id required")

    # Validate volume exists and load it
    if volume_id not in _path_registry:
        raise HTTPException(status_code=404, detail=f"Volume {volume_id} not found")

    _ensure_loaded(volume_id)
    if volume_id not in _volume_cache:
        raise HTTPException(status_code=400, detail="Volume not loaded")

    # Find model config — prefer config.ai.models, fall back to SigmaServer's /models
    config = _load_config()
    models = await _fetch_dynamic_models(config)
    model_cfg = next((m for m in models if m["id"] == model_id), None)
    if not model_cfg:
        import httpx
        server_url = config.get("server", "").rstrip("/")
        if server_url:
            try:
                async with httpx.AsyncClient(timeout=5.0) as client:
                    resp = await client.get(f"{server_url}/models")
                    if resp.status_code == 200:
                        model_cfg = next((m for m in resp.json() if m["id"] == model_id), None)
            except Exception:
                pass
    if not model_cfg:
        raise HTTPException(status_code=404, detail=f"Model {model_id} not found in config or SigmaServer")

    # Create job
    job_id = str(uuid.uuid4())[:8]
    _jobs[job_id] = {
        "id": job_id,
        "status": "queued",
        "progress": 0,
        "volume_id": volume_id,
        "model_id": model_id,
        "model_config": model_cfg,
        "result": None,
        "error": None,
        "start_slice": start_slice,
        "end_slice": end_slice,
        "fast": fast,
    }

    # Run inference in background
    asyncio.create_task(_run_inference(job_id))
    return {"job_id": job_id}


async def _run_inference(job_id: str):
    """Execute inference: write temp NIfTI, POST to AI server, parse result."""
    import httpx

    job = _jobs[job_id]
    job["status"] = "running"
    job["progress"] = 2

    volume_id = job["volume_id"]
    model_cfg = job["model_config"]
    config = _load_config()
    server_url = config.get("server", "").rstrip("/")

    if not server_url:
        job["status"] = "failed"
        job["error"] = "No AI server configured"
        return

    try:
        from server.api.volumes import _volume_cache

        data, metadata = _volume_cache[volume_id]
        affine = metadata.get("affine", np.eye(4))
        dims = metadata["dimensions"]  # [X, Y, Z]

        # Apply Z-slice subset if specified (data is Z,Y,X)
        z_total = data.shape[0]
        z_start = int(job["start_slice"]) if job.get("start_slice") is not None else 0
        z_end   = int(job["end_slice"])   if job.get("end_slice")   is not None else z_total
        z_start = max(0, min(z_start, z_total))
        z_end   = max(z_start + 1, min(z_end, z_total))
        data_sub = data[z_start:z_end] if (z_start > 0 or z_end < z_total) else data

        # Write volume to temp NIfTI file
        # data is (Z,Y,X) float32 C-contiguous; transpose to (X,Y,Z) for NIfTI
        vol_xyz = data_sub.transpose(2, 1, 0).astype(np.float32)
        vol_img = nib.Nifti1Image(vol_xyz, affine)

        job["progress"] = 5

        with tempfile.TemporaryDirectory() as tmpdir:
            input_path = Path(tmpdir) / "input.nii.gz"
            nib.save(vol_img, input_path)

            job["progress"] = 8

            # Build multipart request
            files = {"image": ("input.nii.gz", open(input_path, "rb"), "application/gzip")}
            form_data = {"weights": model_cfg.get("weights", "")}
            if job.get("start_slice") is not None:
                form_data["start_slice"] = str(job["start_slice"])
            if job.get("end_slice") is not None:
                form_data["end_slice"] = str(job["end_slice"])
            if job.get("fast") is not None:
                form_data["fast"] = "true" if job["fast"] else "false"

            # If model accepts labels and we have seg data cached, send it
            if model_cfg.get("accepts_labels") and volume_id in _seg_upload_cache:
                seg_bytes = _seg_upload_cache[volume_id]
                seg_arr = np.frombuffer(seg_bytes, dtype=np.uint8).reshape(
                    dims[2], dims[1], dims[0]
                )
                seg_xyz = seg_arr.transpose(2, 1, 0)
                seg_img = nib.Nifti1Image(seg_xyz.astype(np.uint8), affine)
                seg_path = Path(tmpdir) / "labels.nii.gz"
                nib.save(seg_img, seg_path)
                files["labels"] = ("labels.nii.gz", open(seg_path, "rb"), "application/gzip")

            endpoint = model_cfg.get("endpoint", "/predict")
            url = f"{server_url}{endpoint}"
            job["progress"] = 10

            # Poll SigmaServer's /progress endpoint while inference runs so the
            # browser progress bar reflects the real tqdm percentage (10%→95%).
            async def _poll_sigmaserver_progress():
                while True:
                    await asyncio.sleep(0.5)
                    try:
                        async with httpx.AsyncClient(timeout=2.0) as pc:
                            r = await pc.get(f"{server_url}/progress")
                            if r.status_code == 200:
                                pct = r.json().get("pct", 0)
                                job["progress"] = 10 + int(pct * 0.85)
                    except Exception:
                        pass

            poll_task = asyncio.create_task(_poll_sigmaserver_progress())
            try:
                async with httpx.AsyncClient(timeout=600.0) as client:
                    resp = await client.post(url, files=files, data=form_data, headers=_auth_headers())
            finally:
                poll_task.cancel()
                try:
                    await poll_task
                except asyncio.CancelledError:
                    pass

            if resp.status_code != 200:
                job["status"] = "failed"
                job["error"] = f"AI server returned {resp.status_code}: {resp.text[:500]}"
                return

            job["progress"] = 92

            # Parse response — expect multipart with segmentation + optional report
            # For now, handle two response formats:
            # 1. Content-Type: application/gzip or application/octet-stream → raw NIfTI mask
            # 2. Content-Type: multipart/... → segmentation file + report JSON
            content_type = resp.headers.get("content-type", "")

            result_mask = None
            result_report = {}

            # Check for label map in response headers
            ai_labels_header = resp.headers.get("x-ai-labels", "")
            if ai_labels_header:
                try:
                    result_report["labels"] = json.loads(ai_labels_header)
                except Exception:
                    pass

            if "multipart" in content_type:
                # Parse multipart response
                result_mask, result_report = _parse_multipart_response(resp, tmpdir)
            else:
                # Treat entire body as NIfTI mask
                mask_path = Path(tmpdir) / "output.nii.gz"
                mask_path.write_bytes(resp.content)
                result_mask = mask_path

            job["progress"] = 96

            if result_mask and result_mask.exists():
                # Load the mask NIfTI and convert to uint8 C-contiguous (Z,Y,X)
                mask_img = nib.load(str(result_mask))
                mask_canonical = nib.as_closest_canonical(mask_img)
                mask_data = np.asarray(mask_canonical.dataobj)
                print(f"[AI] raw mask dtype={mask_data.dtype} shape={mask_data.shape} "
                      f"non-zero={np.count_nonzero(mask_data)} unique={np.unique(mask_data).tolist()[:10]}")
                mask_data = mask_data.astype(np.uint8)
                # mask_data is (X,Y,Z) after canonical; transpose to (Z,Y,X)
                mask_zyx = mask_data.transpose(2, 1, 0)

                # If a Z-slice subset was sent, pad the mask back to the full volume
                if z_start > 0 or z_end < z_total:
                    full = np.zeros((z_total, mask_zyx.shape[1], mask_zyx.shape[2]), dtype=np.uint8)
                    full[z_start:z_end] = mask_zyx
                    mask_zyx = full

                mask_bytes = np.ascontiguousarray(mask_zyx).tobytes()

                # Determine labels from model config or report
                labels = model_cfg.get("labels", [])
                if result_report.get("labels"):
                    labels = result_report["labels"]

                job["result"] = {
                    "mask": mask_bytes,
                    "dims": list(mask_zyx.shape),  # [Z, Y, X] — always full volume
                    "labels": labels,
                    "report": result_report,
                }
                job["status"] = "completed"
                job["progress"] = 100
            else:
                job["status"] = "failed"
                job["error"] = "AI server did not return a segmentation mask"

    except Exception as e:
        import traceback
        traceback.print_exc()
        job["status"] = "failed"
        job["error"] = str(e)


def _parse_multipart_response(resp, tmpdir):
    """Parse a multipart response from AI server. Returns (mask_path, report_dict)."""
    # Simple boundary-based parser for multipart responses
    content_type = resp.headers.get("content-type", "")
    mask_path = None
    report = {}

    # If it's not actually multipart, treat as NIfTI
    if "boundary" not in content_type:
        p = Path(tmpdir) / "output.nii.gz"
        p.write_bytes(resp.content)
        return p, {}

    boundary = content_type.split("boundary=")[-1].strip()
    parts = resp.content.split(f"--{boundary}".encode())

    for part in parts:
        if b"Content-Disposition" not in part:
            continue
        header_end = part.find(b"\r\n\r\n")
        if header_end < 0:
            continue
        header_str = part[:header_end].decode("utf-8", errors="replace")
        body = part[header_end + 4:]
        # Strip trailing \r\n
        if body.endswith(b"\r\n"):
            body = body[:-2]

        if "segmentation" in header_str.lower() or ".nii" in header_str.lower():
            mask_path = Path(tmpdir) / "output.nii.gz"
            mask_path.write_bytes(body)
        elif "report" in header_str.lower() or "json" in header_str.lower():
            try:
                report = json.loads(body)
            except Exception:
                pass

    return mask_path, report


# Cache for client-uploaded segmentation data (for accepts_labels models)
_seg_upload_cache: dict[str, bytes] = {}


@router.post("/upload-seg/{volume_id}")
async def upload_seg_for_ai(volume_id: str, request: Request):
    """Upload current segmentation so AI model can use it as input.

    Client sends raw uint8 segVolume bytes (same layout as save segmentation).
    Cached in memory until the AI job reads it.
    """
    body = await request.body()
    _seg_upload_cache[volume_id] = body
    return {"ok": True, "size": len(body)}


@router.get("/jobs/{job_id}/status")
async def job_status_sse(job_id: str):
    """SSE stream of job progress updates."""
    if job_id not in _jobs:
        raise HTTPException(status_code=404, detail="Job not found")

    async def event_stream():
        last_progress = -1
        while True:
            job = _jobs.get(job_id)
            if not job:
                yield f"data: {json.dumps({'status': 'not_found'})}\n\n"
                break

            if job["progress"] != last_progress or job["status"] in ("completed", "failed"):
                msg = {
                    "status": job["status"],
                    "progress": job["progress"],
                }
                if job["error"]:
                    msg["error"] = job["error"]
                yield f"data: {json.dumps(msg)}\n\n"
                last_progress = job["progress"]

            if job["status"] in ("completed", "failed"):
                break

            await asyncio.sleep(0.5)

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.get("/jobs/{job_id}/result")
async def get_job_result(job_id: str):
    """Return the inference result mask as raw uint8 bytes.

    Response headers:
    - X-Volume-Dimensions: Z,Y,X dimensions of the mask

    Labels and report are fetched separately via GET /jobs/{job_id}/meta
    to avoid exceeding HTTP header size limits for large label sets.
    """
    if job_id not in _jobs:
        raise HTTPException(status_code=404, detail="Job not found")

    job = _jobs[job_id]
    if job["status"] != "completed":
        raise HTTPException(status_code=400, detail=f"Job not completed (status: {job['status']})")

    result = job["result"]
    print(f"[AI] get_job_result: status={job['status']} result_type={type(result)} result_keys={list(result.keys()) if isinstance(result, dict) else 'N/A'}")
    if not result:
        raise HTTPException(status_code=500, detail="No result data")

    mask = result["mask"]
    dims = result["dims"]
    print(f"[AI] get_job_result: mask_type={type(mask)} mask_len={len(mask) if mask else 0} dims={dims}")
    return Response(
        content=mask,
        media_type="application/octet-stream",
        headers={"X-Volume-Dimensions": ",".join(str(d) for d in dims)},
    )


@router.get("/jobs/{job_id}/meta")
async def get_job_meta(job_id: str):
    """Return labels, dims, and report for a completed job as JSON."""
    if job_id not in _jobs:
        raise HTTPException(status_code=404, detail="Job not found")

    job = _jobs[job_id]
    if job["status"] != "completed":
        raise HTTPException(status_code=400, detail=f"Job not completed (status: {job['status']})")

    result = job["result"]
    if not result:
        raise HTTPException(status_code=500, detail="No result data")

    return {
        "dims": result["dims"],
        "labels": result["labels"],
        "report": result.get("report", {}),
    }


@router.post("/upload-model")
async def upload_model(
    file: UploadFile = File(...),
    config: UploadFile | None = File(None),
    name: str = Form(None),
    description: str = Form(None),
    arch: str = Form(""),
):
    """Proxy model upload to the AI Inference server."""
    import httpx
    
    cfg = _load_config()
    server_url = cfg.get("server", "").rstrip("/")
    if not server_url:
        raise HTTPException(status_code=400, detail="No AI server configured")
        
    async with httpx.AsyncClient(timeout=60.0) as client:
        files = [('file', (file.filename, await file.read(), file.content_type))]
        if config:
            files.append(('config', (config.filename, await config.read(), config.content_type)))

        data = {}
        if name: data['name'] = name
        if description: data['description'] = description
        if arch: data['arch'] = arch

        headers = _auth_headers()
        try:
            resp = await client.post(f"{server_url}/models/upload", files=files, data=data, headers=headers)
        except Exception as e:
            raise HTTPException(status_code=502, detail=f"Could not reach AI server: {e}")

        if resp.status_code != 200:
            raise HTTPException(status_code=resp.status_code, detail=resp.json().get("detail", resp.text))

        return resp.json()


@router.delete("/models/{model_id}")
async def delete_model(model_id: str):
    """Proxy model deletion to SigmaServer. Only user-uploaded models can be removed."""
    import httpx

    cfg = _load_config()
    server_url = cfg.get("server", "").rstrip("/")
    if not server_url:
        raise HTTPException(status_code=400, detail="No AI server configured")

    headers = _auth_headers()
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.delete(f"{server_url}/models/{model_id}", headers=headers)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Could not reach AI server: {e}")

    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail=resp.json().get("detail", resp.text))

    return resp.json()
