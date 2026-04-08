---
phase: quick
plan: 260408-dk9
subsystem: server-api, client-ui
tags: [totalsegmentator, nifti-export, ai-tools, tool-panel]
dependency_graph:
  requires: []
  provides: [nifti-export-endpoint, totalsegmentator-button]
  affects: [server/api/volumes.py, client/src/main.js]
tech_stack:
  added: []
  patterns: [anchor-download, nibabel-tempfile-serialize]
key_files:
  created: []
  modified:
    - server/api/volumes.py
    - client/src/main.js
decisions:
  - Use anchor href for NIfTI download (not fetch/blob) to avoid holding large volume in JS memory twice
  - Use tempfile approach for DICOM-to-NIfTI conversion (nibabel nib.save requires a filename)
  - Simple diagonal affine from voxel spacing (no RAS transform) — sufficient for external tool use
metrics:
  duration: 8m
  completed: "2026-04-08"
  tasks_completed: 2
  files_modified: 2
---

# Quick Task 260408-dk9: Add TotalSegmentator Button Summary

**One-liner:** NIfTI export endpoint + TotalSegmentator tool-panel button that downloads the current volume and opens totalsegmentator.com.

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 | Add GET /api/v1/volumes/{id}/nifti endpoint | 574fe63 | server/api/volumes.py |
| 2 | Add TotalSegmentator button to tool panel | 30c717a | client/src/main.js |

## What Was Built

**Server endpoint (`GET /api/v1/volumes/{volume_id}/nifti`):**
- Returns 404 if volume not registered
- For NIfTI source volumes: reads raw file bytes and returns them with `Content-Disposition: attachment`
- For DICOM source volumes: converts to NIfTI via nibabel using a diagonal affine built from voxel spacing, serializes via `tempfile.NamedTemporaryFile`, returns bytes with `.nii` filename

**Client button (`_runTotalSegmentator`):**
- `TotalSegmentator` button placed immediately after the existing AI button in the tool panel
- Shows a `window.confirm` dialog explaining the workflow before acting
- Triggers download via an `<a href="...">` element click — browser streams directly from server, no in-memory blob
- Opens `https://totalsegmentator.com` in a new tab (`noopener,noreferrer`)

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Self-Check: PASSED

- `server/api/volumes.py` modified: confirmed
- `client/src/main.js` modified: confirmed
- Commit 574fe63 exists: confirmed (nifti endpoint)
- Commit 30c717a exists: confirmed (TotalSegmentator button)
- Route registered: `GET /api/v1/volumes/{volume_id}/nifti` verified via import test
- Client references: `_runTotalSegmentator` at line 1002, button at line 704
