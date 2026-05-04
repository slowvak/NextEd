---
phase: quick
plan: 260504-eao
type: execute
wave: 1
depends_on: []
files_modified:
  - client/src/viewer/ViewerPanel.js
  - client/src/viewer/ViewerState.js
  - client/src/main.js
  - client/src/ui/helpModal.js
autonomous: true
requirements: []
must_haves:
  truths:
    - "Grow3D appears in tool dropdown below Grow2D"
    - "Grow3D does 6-connected 3D region grow (no depth restriction)"
    - "Grow3D shares the same Min/Max range controls as Grow2D"
    - "Clicking an already-labeled voxel in Grow3D uses stored min/max or computes from entire labeled volume"
    - "Clicking an unlabeled voxel in Grow3D uses mean±stdev (same as Grow2D)"
    - "Switching away from Grow3D clears the grow seed (same as Grow2D)"
  artifacts:
    - path: client/src/viewer/ViewerPanel.js
      provides: _startRegionGrow(e, is3D) and _applyRegionGrow(is3D) with 3D flag
    - path: client/src/viewer/ViewerState.js
      provides: setActiveTool treats region-grow-3d same as region-grow for seed clearing
    - path: client/src/main.js
      provides: Grow3D button in dropdown, updateToolPlanes handles region-grow-3d
    - path: client/src/ui/helpModal.js
      provides: Help entry for Grow3D
---

<objective>
Add Grow3D tool to the tool dropdown below Grow2D. Grow3D performs unrestricted 6-connected 3D region grow using the same intensity range, label collision rules, and same-label-click-to-reseed behavior as Grow2D.
</objective>

<tasks>
<task type="auto">
  <name>Task 1: Wire Grow3D across all layers</name>
  <files>client/src/viewer/ViewerPanel.js client/src/viewer/ViewerState.js client/src/main.js client/src/ui/helpModal.js</files>
  <done>All changes implemented and committed in f4a7d15</done>
</task>
</tasks>
