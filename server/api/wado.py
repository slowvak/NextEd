"""DICOMweb WADO-RS endpoints for series-level retrieval and metadata.

Implements:
- GET /api/v1/wado-rs/studies/{study_uid}/series/{series_uid}
    Retrieve all DICOM instances as multipart/related response.
- GET /api/v1/wado-rs/studies/{study_uid}/series/{series_uid}/metadata
    Retrieve DICOM tags as PS3.18 JSON array with BulkDataURI references.
"""

from __future__ import annotations

import json
import uuid
from pathlib import Path

import pydicom
from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse

from server.api.volumes import _metadata_registry, _path_registry

router = APIRouter(prefix="/api/v1/wado-rs", tags=["wado-rs"])

CRLF = b"\r\n"
CHUNK_SIZE = 65536  # 64KB chunks for streaming


def _resolve_series_files(study_uid: str, series_uid: str) -> list[str]:
    """Find DICOM file paths for a given Study/Series UID pair.

    Scans _metadata_registry for a volume matching both UIDs with
    format "dicom_series", then returns the JSON-decoded file list
    from _path_registry.
    """
    for vol_id, meta in _metadata_registry.items():
        if (
            meta.format == "dicom_series"
            and meta.study_instance_uid == study_uid
            and meta.series_instance_uid == series_uid
        ):
            path_str, fmt = _path_registry[vol_id]
            if fmt == "dicom_series":
                return json.loads(path_str)
    return []


def _multipart_generator(file_paths: list[str], boundary: str):
    """Yield multipart/related parts for DICOM files.

    Each part has a Content-Type: application/dicom header followed
    by the raw DICOM file bytes streamed in 64KB chunks.
    """
    for fpath in file_paths:
        yield b"--" + boundary.encode() + CRLF
        yield b"Content-Type: application/dicom" + CRLF
        yield CRLF  # end of part headers
        with open(fpath, "rb") as f:
            while True:
                chunk = f.read(CHUNK_SIZE)
                if not chunk:
                    break
                yield chunk
        yield CRLF  # CRLF after body before next boundary
    yield b"--" + boundary.encode() + b"--" + CRLF  # closing boundary


@router.get("/studies/{study_uid}/series/{series_uid}")
async def retrieve_series(study_uid: str, series_uid: str):
    """WADO-RS RetrieveSeries: return all instances as multipart/related."""
    files = _resolve_series_files(study_uid, series_uid)
    if not files:
        raise HTTPException(status_code=404, detail="Series not found")

    # Verify all files exist before streaming (D-10: fail entire request)
    for f in files:
        if not Path(f).exists():
            raise HTTPException(
                status_code=404,
                detail=f"DICOM file missing from disk: {f}",
            )

    boundary = uuid.uuid4().hex
    # Set Content-Type via headers dict to avoid Starlette normalization (Pitfall 1)
    headers = {
        "Content-Type": (
            f'multipart/related; type="application/dicom"; boundary={boundary}'
        )
    }
    return StreamingResponse(
        _multipart_generator(files, boundary),
        headers=headers,
    )


@router.get("/studies/{study_uid}/series/{series_uid}/metadata")
async def retrieve_series_metadata(study_uid: str, series_uid: str):
    """WADO-RS RetrieveSeriesMetadata: return PS3.18 JSON array."""
    files = _resolve_series_files(study_uid, series_uid)
    if not files:
        raise HTTPException(status_code=404, detail="Series not found")

    metadata_list = []
    for fpath in files:
        if not Path(fpath).exists():
            raise HTTPException(
                status_code=404,
                detail=f"DICOM file missing from disk: {fpath}",
            )

        ds = pydicom.dcmread(fpath, stop_before_pixels=True)
        sop_uid = str(getattr(ds, "SOPInstanceUID", "unknown"))

        # Use default-arg binding to avoid closure bug (Pitfall 3)
        def bulk_handler(
            elem, _study=study_uid, _series=series_uid, _sop=sop_uid
        ):
            return (
                f"/api/v1/wado-rs/studies/{_study}/series/{_series}"
                f"/instances/{_sop}/bulk/{elem.tag:08X}"
            )

        json_dict = ds.to_json_dict(bulk_data_element_handler=bulk_handler)

        # Manually inject PixelData BulkDataURI since stop_before_pixels=True
        # omits it from the dataset (Open Question 1 in research)
        json_dict["7FE00010"] = {
            "vr": "OW",
            "BulkDataURI": (
                f"/api/v1/wado-rs/studies/{study_uid}/series/{series_uid}"
                f"/instances/{sop_uid}/bulk/7FE00010"
            ),
        }

        metadata_list.append(json_dict)

    return JSONResponse(
        content=metadata_list,
        media_type="application/dicom+json",
    )
