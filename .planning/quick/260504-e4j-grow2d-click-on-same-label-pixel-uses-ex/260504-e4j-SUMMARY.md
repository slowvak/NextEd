---
phase: quick
plan: 260504-e4j
subsystem: client/viewer
tags: [region-grow, segmentation, grow2d, intensity-range]
dependency_graph:
  requires: []
  provides: [three-way-range-branch-in-_startRegionGrow]
  affects: [client/src/viewer/ViewerPanel.js]
tech_stack:
  added: []
  patterns: [slice-scan-for-label-intensity-range]
key_files:
  modified:
    - client/src/viewer/ViewerPanel.js
decisions:
  - Scan only the current slice (not the full 3D volume) for label pixels to keep cost proportional to a 2D operation, consistent with Grow2D being a 2D tool
  - Fall back to mean±stdev if no label pixels are found on the slice (safety net — shouldn't trigger since seedIdx matched)
metrics:
  duration: "3 minutes"
  completed: "2026-05-04"
  tasks_completed: 1
  files_modified: 1
---

# Quick Task 260504-e4j: Grow2D click on same-label pixel derives range from slice intensities

**One-liner:** Three-way min/max branch in `_startRegionGrow` so clicking on an existing-label pixel with no stored range scans that label's slice pixels for the intensity range instead of using the local 5x5 patch mean±stdev.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Add slice-scan branch to _startRegionGrow | 6984eba | client/src/viewer/ViewerPanel.js |

## What Was Done

Modified `_startRegionGrow` in `client/src/viewer/ViewerPanel.js` to replace the two-way `if/else` with a three-way structure:

1. **Stored range (unchanged):** If `label.regionGrowMin` and `label.regionGrowMax` are set, use them.
2. **Existing-label pixel (new):** If `segVolume[seedIdx] === activeLabel` and no stored range exists, scan all pixels on the current slice bearing the active label and derive `[sliceMin, sliceMax]` from their intensities. Falls back to mean±stdev if the scan finds nothing.
3. **Unlabeled pixel (unchanged):** Use mean±stdev from the 5×5 patch, clamped to include the seed.

The slice scan iterates over the correct 2D plane for all three axes (axial / coronal / sagittal) using the existing `dimX`, `dimY`, `dimZ`, and `fixedDepth` variables already in scope.

## Deviations from Plan

None — plan executed exactly as written.

## Verification

Build: `cd client && npx vite build --mode development` — passed in 216ms, no errors, one pre-existing dynamic import warning unrelated to this change.

## Self-Check: PASSED

- `client/src/viewer/ViewerPanel.js` — modified, confirmed
- Commit `6984eba` — confirmed via `git log`
