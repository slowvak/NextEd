# Copyright Bradley J Erickson, 2026.
"""DICOM volume loader with series grouping, RAS+ normalization, and auto-windowing."""

from __future__ import annotations

from pathlib import Path

import nibabel as nib
import numpy as np
import pydicom

from server.loaders.nifti_loader import compute_auto_window



# ── Enhanced (multi-frame) DICOM ─────────────────────────────────────────────
#
# Enhanced MR/CT store a whole series in ONE file: NumberOfFrames frames, with
# geometry in nested functional groups rather than top-level tags. A classic
# reader sees no ImagePositionPatient / PixelSpacing / ImageOrientationPatient
# on such a file and discards it — which is why these series came back empty.
#
# The standard allows values that are constant across frames to live in
# SharedFunctionalGroupsSequence and the rest per-frame, but vendors differ:
# Siemens Enhanced MR (MAGNETOM Vida) leaves the shared group with no geometry
# at all and repeats Pixel Measures / Plane Position / Plane Orientation on
# every frame. So look per-frame first, then fall back to shared.

DEFAULT_ORIENTATION = [1.0, 0.0, 0.0, 0.0, 1.0, 0.0]  # axial


def _fg_item(ds, frame_index: int, seq_name: str):
    """Return a functional-group sub-sequence item, per-frame first then shared."""
    for group_name, idx in (("PerFrameFunctionalGroupsSequence", frame_index),
                            ("SharedFunctionalGroupsSequence", 0)):
        groups = getattr(ds, group_name, None)
        if not groups or idx >= len(groups):
            continue
        sub = getattr(groups[idx], seq_name, None)
        if sub is not None and len(sub):
            return sub[0]
    return None


def is_multiframe(ds) -> bool:
    return int(getattr(ds, "NumberOfFrames", 1) or 1) > 1


class _FrameSlice:
    """One frame of an Enhanced file, shaped like a classic single-frame dataset.

    Presenting the same attribute names lets the sorting, affine and assembly
    code below stay single-path instead of branching on encoding everywhere.
    """

    __slots__ = ("pixel_array", "ImagePositionPatient", "ImageOrientationPatient",
                 "PixelSpacing", "Rows", "Columns", "RescaleSlope",
                 "RescaleIntercept", "SliceThickness", "InstanceNumber",
                 # carried from the parent dataset / frame VOI so naming,
                 # modality and windowing survive the split
                 "Modality", "StudyDescription", "SeriesDescription",
                 "WindowCenter", "WindowWidth", "GantryDetectorTilt")

    def __init__(self, **kw):
        for k, v in kw.items():
            setattr(self, k, v)


def _frame_geometry(ds, i: int) -> dict:
    """Geometry for frame `i` of an Enhanced dataset."""
    pp = _fg_item(ds, i, "PlanePositionSequence")
    po = _fg_item(ds, i, "PlaneOrientationSequence")
    pm = _fg_item(ds, i, "PixelMeasuresSequence")
    pvt = _fg_item(ds, i, "PixelValueTransformationSequence")
    fc = _fg_item(ds, i, "FrameContentSequence")
    voi = _fg_item(ds, i, "FrameVOILUTSequence")
    position = ([float(v) for v in pp.ImagePositionPatient]
                if pp is not None and hasattr(pp, "ImagePositionPatient") else None)
    orientation = ([float(v) for v in po.ImageOrientationPatient]
                   if po is not None and hasattr(po, "ImageOrientationPatient") else None)
    spacing = ([float(v) for v in pm.PixelSpacing]
               if pm is not None and hasattr(pm, "PixelSpacing") else None)
    thickness = (float(pm.SliceThickness)
                 if pm is not None and getattr(pm, "SliceThickness", None) is not None else None)
    return {
        "position": position,
        "orientation": orientation,
        "pixel_spacing": spacing,
        "thickness": thickness,
        "slope": float(getattr(pvt, "RescaleSlope", 1.0)) if pvt is not None else 1.0,
        "intercept": float(getattr(pvt, "RescaleIntercept", 0.0)) if pvt is not None else 0.0,
        # In-Stack Position Number orders frames within a stack; it is the
        # multi-frame analogue of InstanceNumber.
        "index": int(getattr(fc, "InStackPositionNumber", i + 1)) if fc is not None else i + 1,
        "window_center": getattr(voi, "WindowCenter", None) if voi is not None else None,
        "window_width": getattr(voi, "WindowWidth", None) if voi is not None else None,
    }


def _series_thickness(ds) -> float | None:
    """SliceThickness for a dataset, top-level or from the functional groups."""
    top = getattr(ds, "SliceThickness", None)
    if top is not None:
        try:
            t = float(top)
            if t > 0:
                return t
        except (TypeError, ValueError):
            pass
    pm = _fg_item(ds, 0, "PixelMeasuresSequence")
    if pm is not None and getattr(pm, "SliceThickness", None) is not None:
        try:
            t = float(pm.SliceThickness)
            if t > 0:
                return t
        except (TypeError, ValueError):
            pass
    return None


def _synthesize_positions(slices: list) -> bool:
    """Give position-less slices a synthetic stack along the slice normal.

    Legacy exports sometimes carry SliceThickness but no ImagePositionPatient.
    Requested behaviour: order by slice number, put the first at 0.0 and step
    by the thickness. That assumes the slice numbering reflects relative
    position and that spacing is uniform — true for a straight acquisition,
    wrong for a gantry-tilted or irregularly-spaced one, so it is only used
    when there is no real position data to prefer.
    """
    thickness = next((t for t in (_series_thickness(s) for s in slices) if t), None)
    if thickness is None:
        return False
    slices.sort(key=lambda s: int(getattr(s, "InstanceNumber", 0) or 0))
    for i, s in enumerate(slices):
        if not getattr(s, "ImageOrientationPatient", None):
            s.ImageOrientationPatient = list(DEFAULT_ORIENTATION)
        if not getattr(s, "PixelSpacing", None):
            s.PixelSpacing = [1.0, 1.0]
        s.ImagePositionPatient = [0.0, 0.0, i * thickness]
    print(f"[dicom_loader] synthesized positions for {len(slices)} slice(s) "
          f"at {thickness}mm spacing (no ImagePositionPatient present)")
    return True


def _build_affine(
    orientation: list[float],
    position: list[float],
    pixel_spacing: list[float],
    slice_positions: list[float],
    n_slices: int,
) -> np.ndarray:
    """Build a 4x4 affine matrix from DICOM geometry tags."""
    row_cosine = np.array(orientation[:3])
    col_cosine = np.array(orientation[3:6])
    slice_cosine = np.cross(row_cosine, col_cosine)

    if n_slices > 1 and len(slice_positions) > 1:
        slice_spacing = abs(slice_positions[1] - slice_positions[0])
    else:
        slice_spacing = 1.0

    # Build affine in DICOM LPS coordinates.
    # pixel_array is (rows, cols). Axis 0 = row index (vertical), axis 1 = col index (horizontal).
    # Moving along axis 0 (down rows) follows the column cosine direction, spaced by PixelSpacing[0].
    # Moving along axis 1 (across cols) follows the row cosine direction, spaced by PixelSpacing[1].
    affine_lps = np.eye(4)
    affine_lps[:3, 0] = col_cosine * pixel_spacing[0]   # axis 0: row index → column direction
    affine_lps[:3, 1] = row_cosine * pixel_spacing[1]   # axis 1: col index → row direction
    affine_lps[:3, 2] = slice_cosine * slice_spacing
    affine_lps[:3, 3] = position

    # Convert DICOM LPS to NIfTI RAS by negating X and Y rows
    # (Right = -Left, Anterior = -Posterior, Superior = Superior)
    lps_to_ras = np.diag([-1.0, -1.0, 1.0, 1.0])
    return lps_to_ras @ affine_lps


def orientation_from_iop(iop: list[float], pixel_spacing: list[float], z_spacing: float) -> str:
    """Determine Axial/Coronal/Sagittal/Oblique using nibabel canonical affine.

    Builds the DICOM geometry affine (LPS→RAS), canonicalises it to RAS+,
    then identifies orientation from which canonical axis carries the slice spacing.
    """
    affine = _build_affine(iop, [0.0, 0.0, 0.0], pixel_spacing, [0.0, z_spacing], 2)
    nii = nib.Nifti1Image(np.zeros((2, 2, 2), dtype=np.int8), affine)
    canonical = nib.as_closest_canonical(nii)
    zooms = [float(z) for z in canonical.header.get_zooms()[:3]]
    max_z = max(zooms)
    if max_z == 0:
        return "Unknown"
    eps = max_z * 0.001
    if sum(1 for z in zooms if z >= max_z - eps) >= 2:
        return "Oblique"
    return ["Sagittal", "Coronal", "Axial"][zooms.index(max_z)]


def discover_dicom_series(root: Path) -> list[dict]:
    """Scan a directory tree for DICOM files and group by SeriesInstanceUID.

    Reads only headers (no pixel data) for speed. Returns a list of series
    info dicts, each containing:
      - series_uid: SeriesInstanceUID
      - name: "StudyDescription - SeriesDescription"
      - files: list of file paths belonging to this series
      - modality: DICOM Modality tag
      - dimensions: [cols, rows, n_slices] (approximate)
      - voxel_spacing: [col_sp, row_sp, slice_sp_est]

    Series with any dimension < 5 are excluded.
    """
    # Collect all candidate DICOM files
    candidates = []
    for p in sorted(root.rglob("*")):
        if not p.is_file() or p.name.startswith("."):
            continue
        if p.suffix.lower() in [".nii", ".gz", ".json", ".csv", ".txt", ".md", ".py"]:
            continue
        candidates.append(p)

    # Group files by SeriesInstanceUID using header-only reads
    series_map: dict[str, dict] = {}  # uid -> series info

    for f in candidates:
        try:
            ds = pydicom.dcmread(str(f), stop_before_pixels=True)
        except Exception:
            continue

        uid = str(getattr(ds, "SeriesInstanceUID", "")).strip()
        if not uid:
            continue

        # Must be positionable: a real position tag, an Enhanced file whose
        # positions live in the functional groups, or at minimum a thickness we
        # can stack by.
        multiframe = is_multiframe(ds)
        if not (hasattr(ds, "ImagePositionPatient") or multiframe
                or _series_thickness(ds) is not None):
            continue
        if not hasattr(ds, "Rows") or not hasattr(ds, "Columns"):
            continue

        if uid not in series_map:
            study_uid = str(getattr(ds, "StudyInstanceUID", "")).strip()
            study_desc = str(getattr(ds, "StudyDescription", "")).strip()
            series_desc = str(getattr(ds, "SeriesDescription", "")).strip()
            if study_desc and series_desc:
                name = f"{study_desc} - {series_desc}"
            elif series_desc:
                name = series_desc
            elif study_desc:
                name = study_desc
            else:
                name = uid[:16]

            modality = str(getattr(ds, "Modality", "unknown")).strip() or "unknown"
            rows = int(getattr(ds, "Rows", 0))
            cols = int(getattr(ds, "Columns", 0))
            # An Enhanced file carries none of these at the top level.
            geom = _frame_geometry(ds, 0) if multiframe else {}
            spacing = ([float(v) for v in ds.PixelSpacing]
                       if hasattr(ds, "PixelSpacing")
                       else geom.get("pixel_spacing") or [1.0, 1.0])
            orientation = ([float(v) for v in ds.ImageOrientationPatient]
                           if hasattr(ds, "ImageOrientationPatient")
                           else geom.get("orientation"))

            series_map[uid] = {
                "series_uid": uid,
                "study_uid": study_uid,
                "name": name,
                "files": [],
                "modality": modality,
                "rows": rows,
                "cols": cols,
                "voxel_spacing": spacing,
                "orientation": orientation,
                "thickness": _series_thickness(ds),
                "positions": [],
            }

        if multiframe:
            # One file, many slices: count frames, not files, or the <5 filter
            # below throws the whole series away.
            n_frames = int(getattr(ds, "NumberOfFrames", 1) or 1)
            for i in range(n_frames):
                fpos = _frame_geometry(ds, i)["position"]
                if fpos is not None:
                    series_map[uid]["positions"].append(fpos)
            series_map[uid]["frames"] = series_map[uid].get("frames", 0) + n_frames
        else:
            pos = getattr(ds, "ImagePositionPatient", None)
            if pos is not None:
                series_map[uid]["positions"].append([float(v) for v in pos])
        series_map[uid]["files"].append(str(f))

    # Convert to list, compute dimensions, filter small series
    result = []
    for info in series_map.values():
        n_slices = info.get("frames") or len(info["files"])
        rows = info["rows"]
        cols = info["cols"]

        # Skip series with any dimension < 5 (scouts, localizers, dose reports)
        if cols < 5 or rows < 5 or n_slices < 5:
            continue

        # Compute actual Z spacing from ImagePositionPatient along slice normal
        z_spacing = 1.0
        orientation = info.get("orientation")
        positions = info.get("positions", [])
        if orientation and len(positions) >= 2:
            row_cosine = np.array(orientation[:3])
            col_cosine = np.array(orientation[3:6])
            slice_normal = np.cross(row_cosine, col_cosine)
            projections = sorted(
                float(np.dot(np.array(p), slice_normal)) for p in positions
            )
            gaps = [abs(projections[i+1] - projections[i])
                    for i in range(len(projections) - 1)
                    if abs(projections[i+1] - projections[i]) > 0.01]
            if gaps:
                z_spacing = float(np.median(gaps))
        elif info.get("thickness"):
            z_spacing = float(info["thickness"])

        info["dimensions"] = [cols, rows, n_slices]
        pixel_spacing = info["voxel_spacing"]  # still [ps0, ps1] at this point
        info["voxel_spacing"] = pixel_spacing + [z_spacing]
        iop = info.get("orientation")
        info["orientation_label"] = (
            orientation_from_iop(iop, pixel_spacing, z_spacing) if iop else "Unknown"
        )
        result.append(info)

    return result


def _detect_gantry_tilt(slices: list) -> float:
    """Return gantry tilt in degrees from DICOM GantryDetectorTilt tag, else 0.0."""
    for s in slices:
        tag = getattr(s, "GantryDetectorTilt", None)
        if tag is not None:
            try:
                return float(tag)
            except (TypeError, ValueError):
                pass
    return 0.0


def load_dicom_series(file_paths: list[str]) -> tuple[np.ndarray, dict]:
    """Load a DICOM series from an explicit list of file paths.

    Reads pixel data, sorts by ImagePositionPatient, assembles into a 3D
    volume, then normalizes to RAS+ using nibabel.

    Returns:
        tuple of (data, metadata)
    """
    # Read all slices with pixel data and spatial position
    slices = []
    skipped = 0
    positionless = []
    for f in file_paths:
        try:
            ds = pydicom.dcmread(str(f))
            if not hasattr(ds, "pixel_array"):
                skipped += 1
                continue

            if is_multiframe(ds):
                # One Enhanced file is a whole series: split it into per-frame
                # slices carrying the geometry from its functional groups.
                frames = ds.pixel_array  # (n_frames, rows, cols)
                for i in range(int(ds.NumberOfFrames)):
                    g = _frame_geometry(ds, i)
                    slices.append(_FrameSlice(
                        pixel_array=frames[i],
                        ImagePositionPatient=g["position"],
                        ImageOrientationPatient=g["orientation"] or list(DEFAULT_ORIENTATION),
                        PixelSpacing=g["pixel_spacing"] or [1.0, 1.0],
                        Rows=int(ds.Rows), Columns=int(ds.Columns),
                        RescaleSlope=g["slope"], RescaleIntercept=g["intercept"],
                        SliceThickness=g["thickness"], InstanceNumber=g["index"],
                        Modality=str(getattr(ds, "Modality", "unknown")),
                        StudyDescription=str(getattr(ds, "StudyDescription", "")),
                        SeriesDescription=str(getattr(ds, "SeriesDescription", "")),
                        WindowCenter=g["window_center"], WindowWidth=g["window_width"],
                        GantryDetectorTilt=getattr(ds, "GantryDetectorTilt", None),
                    ))
                continue

            if not hasattr(ds, "ImagePositionPatient"):
                # Held back rather than dropped: with a thickness these can
                # still be stacked, which is decided once all files are read.
                positionless.append(ds)
                continue
            if not hasattr(ds, "ImageOrientationPatient"):
                skipped += 1
                continue
            if not hasattr(ds, "PixelSpacing"):
                skipped += 1
                continue
            slices.append(ds)
        except Exception:
            skipped += 1
            continue

    # Only synthesize when nothing real was found — measured positions always win.
    if positionless and not slices:
        if _synthesize_positions(positionless):
            slices = positionless
        else:
            skipped += len(positionless)
    elif positionless:
        skipped += len(positionless)

    # Frames that reached here without a position (an Enhanced file missing
    # Plane Position) get the same treatment rather than crashing the sort.
    if slices and all(getattr(s, "ImagePositionPatient", None) is None for s in slices):
        if not _synthesize_positions(slices):
            raise ValueError("Series has no ImagePositionPatient and no SliceThickness to stack by")
    slices = [s for s in slices if getattr(s, "ImagePositionPatient", None) is not None]

    if skipped:
        print(f"[dicom_loader] skipped {skipped} file(s) without required attributes")

    if not slices:
        raise ValueError("No valid DICOM slices with pixel data and spatial attributes")

    # Extract orientation from any slice (they should be identical in a series)
    first_unsorted = slices[0]
    orientation = [float(v) for v in first_unsorted.ImageOrientationPatient]
    
    # Compute the normal vector (slice direction) using the cross product
    row_cosine = np.array(orientation[:3])
    col_cosine = np.array(orientation[3:6])
    slice_cosine = np.cross(row_cosine, col_cosine)

    def get_slice_pos(s) -> float:
        pos = np.array([float(v) for v in s.ImagePositionPatient])
        return float(np.dot(pos, slice_cosine))

    # Sort slices by their physical projection along the slice normal
    slices.sort(key=get_slice_pos)

    # ponytail: drop duplicate slice locations — folders often hold a second copy
    # of the same series (e.g. a "selected/" subfolder), and duplicates collapse
    # slice spacing to 0, which makes the affine undecomposable.
    unique, seen = [], set()
    for s in slices:
        key = round(get_slice_pos(s), 4)
        if key in seen:
            continue
        seen.add(key)
        unique.append(s)
    if len(unique) != len(slices):
        print(f"[dicom_loader] dropped {len(slices) - len(unique)} duplicate slice location(s)")
        slices = unique

    # Re-extract geometry from the true first slice
    first = slices[0]
    position = [float(v) for v in first.ImagePositionPatient]
    pixel_spacing = [float(v) for v in first.PixelSpacing]

    # Collect slice positions for affine computation
    slice_positions = [get_slice_pos(s) for s in slices]

    # Assemble 3D volume (rows x cols x slices)
    rows, cols = first.Rows, first.Columns
    volume_3d = np.zeros((rows, cols, len(slices)), dtype=np.float32)
    for i, s in enumerate(slices):
        arr = s.pixel_array.astype(np.float32)
        slope = float(getattr(s, "RescaleSlope", 1.0))
        intercept = float(getattr(s, "RescaleIntercept", 0.0))
        arr = arr * slope + intercept
        volume_3d[:, :, i] = arr

    # Build affine from DICOM geometry
    affine = _build_affine(
        orientation, position, pixel_spacing, slice_positions, len(slices)
    )

    # Wrap in nibabel NIfTI image for RAS+ normalization
    nii_img = nib.Nifti1Image(volume_3d, affine)
    canonical = nib.as_closest_canonical(nii_img)

    # Correct gantry tilt by resampling to an orthogonal grid.
    # The tilted affine encodes the shear correctly, but the client treats the
    # volume as a rectangular array and ignores off-diagonal affine terms.
    # resample_to_output builds a diagonal (shear-free) affine covering the same
    # world-space bounding box, then interpolates the data onto that grid.
    tilt_deg = _detect_gantry_tilt(slices)
    if abs(tilt_deg) > 0.5:
        from nibabel.processing import resample_to_output
        zooms = tuple(float(z) for z in canonical.header.get_zooms()[:3])
        fill_value = float(np.min(canonical.get_fdata(dtype=np.float32)))
        canonical = resample_to_output(canonical, voxel_sizes=zooms, order=1, cval=fill_value)
        print(f"[dicom_loader] Gantry tilt {tilt_deg:.1f}° — resliced to orthogonal grid {canonical.shape}, fill={fill_value:.0f}")

    raw = canonical.get_fdata(dtype=np.float32)
    data = np.ascontiguousarray(raw.transpose(2, 1, 0))

    spacing = [float(s) for s in canonical.header.get_zooms()[:3]]

    # Try using DICOM Window/Level
    window_center, window_width = None, None
    if hasattr(first, "WindowCenter") and hasattr(first, "WindowWidth"):
        wc_val = first.WindowCenter
        ww_val = first.WindowWidth

        if isinstance(wc_val, pydicom.multival.MultiValue):
            wc_val = wc_val[0]
        if isinstance(ww_val, pydicom.multival.MultiValue):
            ww_val = ww_val[0]

        try:
            window_center = float(wc_val)
            window_width = float(ww_val)
        except Exception:
            pass

    if window_center is None or window_width is None:
        window_center, window_width = compute_auto_window(data)

    modality = str(getattr(first, "Modality", "unknown")).strip() or "unknown"

    # Build descriptive name from DICOM tags
    study_desc = str(getattr(first, "StudyDescription", "")).strip()
    series_desc = str(getattr(first, "SeriesDescription", "")).strip()
    if study_desc and series_desc:
        name = f"{study_desc} - {series_desc}"
    elif series_desc:
        name = series_desc
    elif study_desc:
        name = study_desc
    else:
        name = "DICOM Series"

    d_min = float(np.min(data))
    d_max = float(np.max(data))

    metadata = {
        "name": name,
        "dimensions": [int(d) for d in canonical.shape[:3]],
        "voxel_spacing": spacing,
        "dtype": "float32",
        "modality": modality,
        "window_center": window_center,
        "window_width": window_width,
        "data_min": d_min,
        "data_max": d_max,
        "affine": canonical.affine,
    }

    return data, metadata


# Backward compat — old code called load_dicom_volume(folder)
def load_dicom_volume(folder: str | Path) -> tuple[np.ndarray, dict]:
    """Load a DICOM series from a folder (legacy interface).

    Discovers all valid files in the folder and delegates to load_dicom_series.
    """
    folder = Path(folder)
    dcm_files = sorted(folder.glob("*.dcm"))
    if not dcm_files:
        dcm_files = [
            f for f in sorted(folder.iterdir())
            if f.is_file() and not f.name.startswith(".")
        ]
    if not dcm_files:
        raise FileNotFoundError(f"No DICOM files found in {folder}")

    return load_dicom_series([str(f) for f in dcm_files])
