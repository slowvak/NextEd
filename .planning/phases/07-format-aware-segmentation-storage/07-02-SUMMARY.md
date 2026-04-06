---
phase: 07-format-aware-segmentation-storage
plan: 02
subsystem: api
tags: [dicom-seg, segmentation, save-endpoint, watcher, suppress-list, websocket]

# Dependency graph
requires:
  - phase: 07-01
    provides: DICOM-SEG writer module (build_dicom_seg), watcher suppress list (WatcherSuppressList)
provides:
  - Format-aware save endpoint with automatic DICOM-SEG/NIfTI branching
  - Watcher suppress list integration preventing self-written file re-detection
affects: [client save workflow (no changes needed), watcher event processing]

# Tech tracking
tech-stack:
  added: []
  patterns: [format-aware save branching by _path_registry format, suppress-before-write pattern for watcher coordination]

key-files:
  created:
    - server/tests/test_save_segmentation.py
  modified:
    - server/api/segmentations.py
    - server/main.py
    - server/watcher/observer.py

key-decisions:
  - "Format selection based on _path_registry format field, not VolumeMetadata.format (more reliable source of truth)"
  - "suppress_list.add() called BEFORE file write to prevent race condition with watcher"
  - "DICOM-SEG output filename always gets .dcm extension if not already present (per D-09)"

patterns-established:
  - "Format branching: check _path_registry fmt == 'dicom_series' to route to DICOM-SEG save"
  - "Suppress-before-write: add path to suppress list before writing to prevent watcher re-detection"

requirements-completed: [SEG-02, SEG-03]

# Metrics
duration: 3min
completed: 2026-04-06
---

# Phase 7 Plan 2: Save Endpoint Wiring and Watcher Integration Summary

**Format-aware save endpoint wiring with automatic DICOM-SEG/NIfTI branching, watcher suppress list integration, and 4 format-selection tests**

## Performance

- **Duration:** 3 min
- **Started:** 2026-04-06T14:03:28Z
- **Completed:** 2026-04-06T14:06:24Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- Refactored save_segmentation endpoint with format-aware branching: DICOM volumes automatically produce DICOM-SEG (.dcm) via build_dicom_seg, NIfTI volumes use unchanged nibabel save path
- Extracted _save_nifti_seg and _save_dicom_seg helper functions for clean separation
- Added module-level WatcherSuppressList instance in main.py shared between save endpoint and watcher
- Integrated suppress_list.should_suppress() check in watcher process_events to prevent re-detection of self-written DICOM-SEG files
- Broadcast segmentation_added WebSocket event after successful save
- Created 4 tests covering NIfTI format selection, DICOM format routing, actual file creation, and suppress list integration

## Task Commits

Each task was committed atomically:

1. **Task 1: Add format branching to save_segmentation endpoint** - `ec7c00a` (feat)
2. **Task 2: Integrate suppress list into watcher and add format-selection tests** - `5ecc924` (feat)

## Files Created/Modified
- `server/api/segmentations.py` - Refactored save_segmentation with format branching, _save_nifti_seg, _save_dicom_seg helpers, WebSocket broadcast
- `server/main.py` - Added WatcherSuppressList import and module-level suppress_list instance
- `server/watcher/observer.py` - Added suppress_list.should_suppress() check in process_events created handler
- `server/tests/test_save_segmentation.py` - 4 tests for format selection, file creation, suppress list call

## Decisions Made
- Used _path_registry format field as the branching criterion since it directly stores the registered format
- suppress_list.add() is called before seg_dcm.save_as() to prevent race conditions where watcher detects the file before suppress entry is registered
- DICOM-SEG output files always receive .dcm extension if not already present, per D-09

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None - all data paths are fully wired.

## Issues Encountered
- SSL certificate issues prevented uv from creating a fresh venv; used the system Python with existing site-packages instead

## Next Phase Readiness
- Format-aware segmentation storage is fully functional
- DICOM volumes now automatically save as DICOM-SEG
- NIfTI save behavior is unchanged (backward compatible)
- Watcher correctly ignores self-written DICOM-SEG files
- All 49 tests pass (45 existing + 4 new)

## Self-Check: PASSED

All 4 modified/created files verified present. Both task commits (ec7c00a, 5ecc924) verified in git log.
