---
phase: quick
plan: 260518-c3r
subsystem: volume-list / catalog
tags: [ui, sidebar, volume-list, catalog, nifti, dicom]
dependency_graph:
  requires: []
  provides: [relative_path field on VolumeMetadata API response, volume-path span in sidebar]
  affects: [server/catalog/models.py, server/main.py, client/src/ui/volumeList.js, client/src/styles.css]
tech_stack:
  added: []
  patterns: [conditional DOM element rendering, pydantic optional field extension]
key_files:
  created: []
  modified:
    - server/catalog/models.py
    - server/main.py
    - client/src/ui/volumeList.js
    - client/src/styles.css
decisions:
  - relative_to() returns "." for files directly in scan_root — convert to "" so client conditional hides path line cleanly
  - scan_root determined per path in _discover_all: directories use path itself, files use path.parent
  - Cache schema bumped v2 -> v3 to discard stale caches missing the new field
metrics:
  duration: "1 minute 22 seconds"
  completed: "2026-05-18"
  tasks_completed: 2
  files_changed: 4
---

# Quick Task 260518-c3r: Add Relative Path Display to Volume List Summary

**One-liner:** Added `relative_path` field to `VolumeMetadata` (populated by NIfTI and DICOM discovery) and rendered it as muted 11px text in the volume list sidebar beneath each volume name.

## What Was Built

Volumes in subdirectories of the scan root now show their parent folder path (e.g. `subjects/sub-01/anat`) as a second line in the sidebar. Volumes directly at the scan root show nothing extra. This lets users distinguish volumes with identical names across subject directories.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Add relative_path to VolumeMetadata and populate in discovery + registration | 8b3328a | server/catalog/models.py, server/main.py |
| 2 | Render relative path in volume list UI and add CSS | a56617b | client/src/ui/volumeList.js, client/src/styles.css |

## Decisions Made

- `relative_to()` returns `"."` when file is directly in `scan_root` — normalize to `""` so the client truthy check hides the span cleanly for root-level volumes.
- `scan_root` is determined in `_discover_all`: when a directory path is given, `scan_root = path`; when a file path is given, `scan_root = path.parent`. This ensures the relative path is computed against the user-supplied root, not an intermediate subdirectory.
- Cache schema bumped from `v2` to `v3` to invalidate stale caches that don't include `relative_path`, preventing deserialization issues with old cached entries.

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None - `relative_path` is fully wired from server discovery through API response to sidebar rendering.

## Self-Check: PASSED

- `server/catalog/models.py` — `relative_path` field present
- `server/main.py` — `_CACHE_SCHEMA_VERSION = "v3"` confirmed; `scan_root` parameter passed in all four discovery calls
- `client/src/ui/volumeList.js` — `volume-path` span inserted conditionally
- `client/src/styles.css` — `.volume-path` rule present
- Commits 8b3328a and a56617b confirmed in git log
