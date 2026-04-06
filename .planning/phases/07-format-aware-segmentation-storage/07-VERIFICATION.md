---
phase: 07-format-aware-segmentation-storage
verified: 2026-04-06T14:30:00Z
status: passed
score: 7/7 must-haves verified
re_verification: false
---

# Phase 7: Format-Aware Segmentation Storage Verification Report

**Phase Goal:** Users save segmentations and the correct format is chosen automatically -- DICOM-SEG for DICOM-sourced volumes, NIfTI for NIfTI-sourced volumes
**Verified:** 2026-04-06T14:30:00Z
**Status:** passed
**Re-verification:** No -- initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A DICOM-SEG file can be constructed from a RAS+ segmentation array, source DICOM file paths, and label metadata | VERIFIED | `build_dicom_seg()` in `server/loaders/dicom_seg_writer.py` (lines 123-215) constructs via `hd.seg.Segmentation` with source_images, pixel_array, segment_descriptions. 6 tests in `test_dicom_seg_writer.py` cover label remap, sort, empty check, frame shape. |
| 2 | Arbitrary label values (e.g., 0, 1, 5, 12) are remapped to contiguous segment numbers 1..N with label 0 excluded | VERIFIED | `remap_labels()` (lines 19-43) uses `np.unique`, sorts, enumerates from 1, excludes 0. `test_remap_labels_basic` explicitly tests [0,1,5,12] -> [0,1,2,3]. |
| 3 | The watcher suppress list prevents re-detection of self-written files within a TTL window | VERIFIED | `WatcherSuppressList` in `server/watcher/suppress.py` with `threading.Lock`, `time.monotonic()`, TTL expiry. 5 tests including TTL expiry and thread safety. |
| 4 | Saving a segmentation on a DICOM volume produces a DICOM-SEG .dcm file in the source series directory | VERIFIED | `_save_dicom_seg()` in `segmentations.py` (lines 35-68) calls `build_dicom_seg`, writes to `series_dir / seg_filename`. `test_format_selection_dicom` verifies routing. |
| 5 | Saving a segmentation on a NIfTI volume produces a _seg.nii.gz file (unchanged from v1.0) | VERIFIED | `_save_nifti_seg()` in `segmentations.py` (lines 25-32) uses nibabel save. `test_nifti_save_produces_file` creates real file and verifies on disk. |
| 6 | The user does not choose the format -- the server selects it automatically based on VolumeMetadata.format | VERIFIED | `save_segmentation()` (line 111) branches on `fmt == "dicom_series"` from `_path_registry`. No format parameter in the API signature. Both `test_format_selection_nifti` and `test_format_selection_dicom` confirm auto-routing. |
| 7 | The watcher does not re-detect DICOM-SEG files written by the save endpoint | VERIFIED | `suppress_list.add()` called BEFORE write at line 65 in segmentations.py. `suppress_list.should_suppress()` checked at line 189 in observer.py in the "created" event handler. `test_suppress_list_called_for_dicom` confirms the add call. |

**Score:** 7/7 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `server/loaders/dicom_seg_writer.py` | DICOM-SEG construction module | VERIFIED | 216 lines. Exports `build_dicom_seg`, `remap_labels`, `_sort_dicom_datasets`, `_ras_seg_to_dicom_frames`. Uses highdicom, pydicom, nibabel orientations. |
| `server/watcher/suppress.py` | Thread-safe suppress list | VERIFIED | 45 lines. Class `WatcherSuppressList` with `add()`, `should_suppress()`, `remove()`. Uses `threading.Lock` and `time.monotonic()`. |
| `server/api/segmentations.py` | Format-aware save endpoint | VERIFIED | 189 lines. Contains `_save_nifti_seg`, `_save_dicom_seg`, format branching in `save_segmentation()`. Imports `build_dicom_seg` and `manager`. |
| `server/watcher/observer.py` | Suppress list integration | VERIFIED | Line 188-189: imports suppress_list from main, calls `should_suppress()` before processing created events. |
| `server/main.py` | Module-level suppress_list | VERIFIED | Line 33: imports `WatcherSuppressList`. Line 36: `suppress_list = WatcherSuppressList(ttl=5.0)`. |
| `server/tests/test_dicom_seg_writer.py` | Tests for writer module | VERIFIED | 6 test functions covering label remapping (3), dataset sorting (1), empty seg error (1), frame shape (1). |
| `server/tests/test_watcher_suppress.py` | Tests for suppress list | VERIFIED | 5 test functions covering add/check, unknown path, TTL expiry, removal, thread safety. |
| `server/tests/test_save_segmentation.py` | Tests for format selection | VERIFIED | 4 test functions covering NIfTI routing, DICOM routing, actual file creation, suppress_list.add call. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `dicom_seg_writer.py` | `dicom_loader.py` | `_build_affine` import | WIRED | Line 16: `from server.loaders.dicom_loader import _build_affine`. Used at line 100. |
| `dicom_seg_writer.py` | `highdicom` | `hd.seg.Segmentation` | WIRED | Line 199: `seg_dcm = hd.seg.Segmentation(...)` with full parameter set. |
| `segmentations.py` | `dicom_seg_writer.py` | `build_dicom_seg()` call | WIRED | Line 16: import. Line 50: `build_dicom_seg(seg_zyx=..., ...)` call in `_save_dicom_seg`. |
| `segmentations.py` | `suppress.py` | `suppress_list.add()` | WIRED | Line 89: imports from `server.main`. Line 65: `suppress_list.add(str(out_path))` before file write. |
| `observer.py` | `suppress.py` | `should_suppress()` check | WIRED | Line 188: imports from `server.main`. Line 189: `if suppress_list.should_suppress(path): continue`. |
| `segmentations.py` | `ws.py` | `manager.broadcast()` | WIRED | Line 17: `from server.api.ws import manager`. Lines 135-138: broadcasts `segmentation_added` event. |

### Data-Flow Trace (Level 4)

Not applicable for this phase. The save endpoint receives binary data from client POST body and writes to disk. No rendering of dynamic data from data sources.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Module imports | `python -c "from server.loaders.dicom_seg_writer import build_dicom_seg, remap_labels"` | Not runnable without full env (SSL/pip issues block uv sync) | SKIP |
| Tests pass | `uv run python -m pytest tests/` | Per user context: 15 new tests all pass. 5 pre-existing failures from missing packages (watchdog, pytest-asyncio) due to PyPI cert issues -- NOT regressions. | SKIP (env constraint) |

Step 7b: SKIPPED -- environment has SSL certificate issues preventing uv sync; cannot run tests directly. User-provided context confirms 15 new tests pass and 5 pre-existing failures are unrelated to this phase.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|------------|-------------|--------|----------|
| SEG-01 | 07-01 | Segmentations for DICOM volumes saved as DICOM-SEG via highdicom | SATISFIED | `build_dicom_seg()` constructs `hd.seg.Segmentation` with source DICOMs, frame alignment, segment descriptions |
| SEG-02 | 07-02 | NIfTI volumes continue saving as _seg.nii.gz | SATISFIED | `_save_nifti_seg()` uses nibabel unchanged path. `test_nifti_save_produces_file` confirms real file creation. |
| SEG-03 | 07-02 | Format selection automatic based on parent volume format | SATISFIED | `save_segmentation()` branches on `_path_registry` format field. No format parameter in API. Tests confirm routing. |
| SEG-04 | 07-01 | Label values remapped to contiguous 1..N for DICOM-SEG | SATISFIED | `remap_labels()` with `np.unique`, sorted, enumerate from 1, 0 excluded. 3 dedicated tests. |

No orphaned requirements found. All 4 SEG requirements mapped to Phase 7 in REQUIREMENTS.md are claimed and satisfied.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| None | - | - | - | No TODOs, FIXMEs, placeholders, or stub implementations found in any phase artifact |

### Human Verification Required

### 1. DICOM-SEG Viewer Compatibility

**Test:** Load a DICOM volume, create a segmentation with multiple labels (e.g., values 1, 5, 12), save, then open the resulting .dcm file in 3D Slicer or another DICOM-SEG viewer.
**Expected:** The DICOM-SEG file opens correctly with contiguous segment numbers and label names intact.
**Why human:** Requires running the full application, creating actual segmentations on real DICOM data, and verifying in an external viewer.

### 2. RAS-to-LPS Orientation Reversal Accuracy

**Test:** Save a segmentation on a non-axial DICOM series (e.g., coronal or sagittal acquisition), then reload and compare voxel positions.
**Expected:** The saved segmentation aligns exactly with the source volume when reloaded.
**Why human:** The `_ras_seg_to_dicom_frames` reversal involves complex orientation math that is only fully validated with real non-axial DICOM data.

### 3. Watcher Suppress Race Condition

**Test:** Save a DICOM segmentation while the watcher is active and observe the watcher logs.
**Expected:** No "registered DICOM series" log entry for the self-written DICOM-SEG file.
**Why human:** Requires running the live server with watcher enabled and observing real-time behavior.

### Gaps Summary

No gaps found. All 7 observable truths are verified at all levels (existence, substantive implementation, wiring, data flow where applicable). All 4 requirements are satisfied. All key links are wired. No anti-patterns detected.

The implementation follows the planned architecture precisely: `dicom_seg_writer.py` handles DICOM-SEG construction with highdicom, `suppress.py` provides thread-safe TTL-based path suppression, `segmentations.py` branches on format automatically, and `observer.py` checks the suppress list before processing new files. Test coverage includes 15 new tests across 3 test files.

---

_Verified: 2026-04-06T14:30:00Z_
_Verifier: Claude (gsd-verifier)_
