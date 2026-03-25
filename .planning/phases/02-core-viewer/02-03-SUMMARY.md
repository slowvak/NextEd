---
phase: 02-core-viewer
plan: 03
subsystem: client
tags: [crosshairs, window-level, presets, single-view, interactions, vanilla-js]
dependency_graph:
  requires: ["02-02"]
  provides: ["crosshair-sync", "wl-presets", "single-view-toggle", "ctrl-drag-wl", "wheel-scroll"]
  affects: ["client/src/viewer/ViewerPanel.js", "client/src/viewer/FourPanelLayout.js", "client/src/viewer/ViewerState.js", "client/src/viewer/windowLevel.js"]
tech_stack:
  added: []
  patterns: ["canvasToVoxel coordinate conversion", "computeWLDrag sensitivity scaling", "single-view CSS grid toggle"]
key_files:
  created:
    - client/src/ui/presetBar.js
    - client/src/__tests__/crosshair.test.js
    - client/src/__tests__/windowLevel.test.js
  modified:
    - client/src/viewer/ViewerPanel.js
    - client/src/viewer/FourPanelLayout.js
    - client/src/viewer/ViewerState.js
    - client/src/viewer/windowLevel.js
    - client/src/styles.css
    - client/src/main.js
decisions:
  - "canvasToVoxel exported as standalone function for testability rather than instance method"
  - "computeWLDrag uses sensitivity = width/300 for proportional W/L scaling"
  - "setPreset separate from setWindowLevel to preserve activePreset name"
metrics:
  tasks_completed: 2
  tasks_total: 3
  tests_added: 10
  tests_total: 20
  completed: "2026-03-25"
requirements:
  - VIEW-04
  - VIEW-07
  - WLVL-02
  - WLVL-03
  - WLVL-04
---

# Phase 02 Plan 03: Viewer Interactions Summary

Crosshair sync, Ctrl+drag W/L, mouse wheel scrolling, CT presets, and single-view toggle -- completing all Phase 2 viewer interaction requirements.

## What Was Built

### Task 1: Crosshair rendering, click+drag nav, wheel scroll, Ctrl+drag W/L (TDD)

- `canvasToVoxel()` function converts CSS-scaled canvas coordinates to voxel indices per axis
- Crosshair lines drawn after putImageData with axis-specific colors: yellow (axial), green (coronal), orange (sagittal) at 0.8 alpha
- Click+drag on canvas updates crosshair across all three panels via shared ViewerState
- Mouse wheel scrolls slices with `preventDefault()` to trap scroll events
- Ctrl+drag (and Meta+drag for macOS) adjusts W/L with `computeWLDrag()` sensitivity scaling
- 10 new unit tests: 5 crosshair coordinate conversion, 5 W/L drag math

### Task 2: W/L presets, single-view toggle, sidebar controls

- `createPresetBar(state)` creates four CT preset buttons: Brain (40/80), Bone (500/3000), Lung (-500/1000), Abd (125/450)
- Presets hidden for non-CT modalities via `display: none` check
- `setPreset(name, center, width)` on ViewerState preserves activePreset name (vs setWindowLevel which clears it)
- Single-view toggle: A/C/S buttons expand one panel to full grid, + button returns to 4-panel
- CSS single-view mode uses `grid-column: 1 / -1; grid-row: 1 / -1` for full expansion
- Preset bar wired into sidebar via main.js

### Task 3: Visual verification (awaiting human verification)

Task 3 is a checkpoint:human-verify task. The viewer must be visually verified by a human with test data.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 (RED) | 3fcba9b | Failing tests for crosshair and W/L drag |
| 1 (GREEN) | 46bfa83 | Crosshair rendering, click+drag, wheel, Ctrl+drag W/L |
| 2 | 0bcec4d | W/L presets, single-view toggle, sidebar controls |

## Deviations from Plan

None -- plan executed exactly as written.

## Known Stubs

None -- all functionality is fully wired with real data sources.

## Self-Check: PASSED

All 7 key files verified present. All 3 commits verified in git log. 20 tests pass. Build succeeds.
