---
phase: quick-260521-h1m
plan: 01
subsystem: client/viewer/3d
tags: [three.js, webgl, marching-cubes, volume-rendering, web-worker]
dependency_graph:
  requires: [ObliquePanel, FourPanelLayout, ViewerState]
  provides: [ThreeDPanel, marchingCubesWorker, volumeShader]
  affects: [FourPanelLayout, client/package.json]
tech_stack:
  added: [three ^0.170.0, THREE.OrbitControls, THREE.Data3DTexture, THREE.ShaderMaterial]
  patterns: [Web Worker marching cubes, ray-cast volume rendering, CSS flex panel layout]
key_files:
  created:
    - client/src/viewer/ThreeDPanel.js
    - client/src/viewer/marchingCubesWorker.js
    - client/src/viewer/volumeShader.js
  modified:
    - client/src/viewer/FourPanelLayout.js
    - client/package.json
    - client/package-lock.json
decisions:
  - "triTable and edgeTable are inlined in the worker — no library imports keep it self-contained"
  - "Ctrl-LMB horizontal=minThreshold, vertical=maxThreshold (independent of global W/L)"
  - "Volume texture built as Uint8 normalized by state.dataMin/dataMax for GPU efficiency"
  - "onBeforeRender callback converts world camera pos to local [0,1]^3 cube space each frame"
metrics:
  duration_seconds: 435
  completed_date: "2026-05-21"
  tasks_completed: 3
  files_changed: 6
---

# Quick Task 260521-h1m: 3D View Panel with Surface and Volume Rendering

**One-liner:** Three.js WebGL panel with OrbitControls swappable into lower-right quadrant, featuring non-blocking marching cubes surface rendering (Web Worker) and ray-cast volume fog with Ctrl-LMB threshold controls.

## What Was Built

### ThreeDPanel.js
Full Three.js panel implementing the ObliquePanel public API (`constructor`, `setVolume`, `render`, `destroy`, `updateDisplaySize`, `_updateCursor`, `toggleBtn`). Internally:
- WebGLRenderer with OrbitControls (damping enabled) in a flex-column container
- `_mode`: `'surface'` (default) or `'volume'` — toggled by a "Vol"/"Surf" button in the labelBar
- Surface mode: spawns `marchingCubesWorker.js` via `new Worker(new URL(...), { type: 'module' })`, receives Float32Array geometry, builds MeshPhongMaterial meshes per label
- Volume mode: creates THREE.Data3DTexture from `state.volume` (Uint8, normalized), renders via ShaderMaterial ray-cast shader; `onBeforeRender` converts camera position to local cube space each frame
- Ctrl-LMB drag: horizontal adjusts `_volThreshMin`, vertical adjusts `_volThreshMax` — completely independent of global W/L in 2D panels
- Animate loop handles resize via `rendererDiv.clientWidth/Height` polling

### marchingCubesWorker.js
Self-contained Web Worker ES module with full 256-entry `edgeTable` and 256x16 `triTable` from Lorensen & Cline 1987. The `marchLabel()` function:
1. Evaluates binary field (1.0 inside label, 0.0 outside) at 8 cube corners
2. Computes cube configuration index, looks up edge flags + triangle list
3. Interpolates vertex positions (iso-value 0.5) in mm-space (multiplied by spacing)
4. Computes flat normals via cross product, replicates per vertex

Posts `{ label, vertices: Float32Array, normals: Float32Array }` per visible label, then `{ done: true }`. Buffers are transferred (zero-copy).

### volumeShader.js
GLSL vertex + fragment shaders for ray-cast volume rendering:
- Vertex shader: passes camera position and ray direction in local cube space
- Fragment shader: ray-AABB intersection, 256-step front-to-back compositing, per-step alpha 0.04 for fog effect, discards samples outside `[uThreshMin, uThreshMax]`

### FourPanelLayout.js (updated)
- Added `ThreeDPanel` import and `_3dMode = false` flag
- `_addObliqueThreeDToggle()`: injects "3D"/"Obl" button into lower-right panel labelBar before the spacer
- `_toggleLowerRight()`: destroys current panel, creates replacement (ThreeDPanel or ObliquePanel), re-wires `toggleBtn`, feeds current volume/state, moves viewModeBtn into new labelBar
- `_exitSingleView()`: uses `'3'` for toggleBtn text when in 3D mode, `'O'` for oblique mode

## Deviations from Plan

### Auto-fixed Issues

None.

### Implementation Notes

1. **Ctrl-LMB semantics adjusted:** Plan spec said "horizontal=minThreshold, vertical=maxThreshold" as independent controls (vs. the window-center/width-shift approach in the plan's code sample). Implemented as described in the constraints: horizontal adjusts `minThreshold`, vertical adjusts `maxThreshold` — simpler and more intuitive.

2. **Worker self.onmessage in Node.js:** The plan's verification command `node --input-type=module --eval "import('./marchingCubesWorker.js')..."` fails in Node.js because `self` is undefined. Verified with `globalThis.self` polyfill — the module structure is correct. In a real browser/Worker context `self` is always available.

3. **vertexShader vDir calculation:** The plan's vertex shader used `position - cameraPos` directly. Since the proxy geometry is a BoxGeometry (vertices at [-0.5, 0.5]) and the camera position uniform is in [0,1]^3 space, the correct ray direction is `position + vec3(0.5) - cameraPos`. This was adjusted to ensure proper ray-box intersection.

## Known Stubs

None — all functionality is wired. The `_buildVolumeRender` function requires `state.volume` and `state.dims` to be set (which happens on volume load via `setVolume()`), so the volume render is correctly deferred until data is available.

## Self-Check: PASSED

All files created and all commits exist:
- `bdcb834`: feat(quick-260521-h1m): add three.js, ThreeDPanel scaffold, and Oblique/3D toggle
- `0add16a`: feat(quick-260521-h1m): marching cubes Web Worker for surface mesh generation
- `d078d38`: feat(quick-260521-h1m): ray-cast volume shader and Ctrl-LMB threshold controls
