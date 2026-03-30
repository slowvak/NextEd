---
status: awaiting_human_verify
trigger: "Window & level values are not being correctly applied to the displayed image"
created: 2026-03-29T00:00:00Z
updated: 2026-03-29T08:19:00Z
---

## Current Focus

hypothesis: (1) Preset buttons produce gray because data_min/data_max are never surfaced to client — presets apply CT HU values (e.g. Brain: center=40, width=80) to non-CT data with different range, clamping almost all voxels. (2) Pixel readout shows "0" or "1" because Number.isInteger(0.0)===true and Number.isInteger(1.0)===true in JS — normalized float data (values 0.0–1.0) always format as integers, masking the actual float range.
test: (1) Add data_min/data_max to VolumeMetadata + server loaders; pass to ViewerState; presetBar scales preset params to data range for unknown modality. (2) Replace Number.isInteger check with explicit float formatting that handles small ranges.
expecting: Presets show meaningful contrast for any data range; pixel readout shows values like "0.0", "0.5", "0.83" for normalized data or raw HU for CT.
next_action: implement fixes

## Symptoms

expected: When adjusting window/level, the image should display with correct contrast mapping — standard medical image windowing behavior (e.g., CT bone window should show bone bright, soft tissue dark)
actual: Image changes when W/L is adjusted, but the result looks wrong (incorrect brightness/contrast mapping)
errors: None reported
reproduction: Adjust window/level on any loaded volume — the resulting image appearance is incorrect
started: Never worked correctly / first time testing this feature

## Eliminated

- hypothesis: applyWindowLevel formula is wrong (e.g., inverted, off-by-one, wrong clamping)
  evidence: traced formula manually — val=(raw-minVal)*scale correctly maps center-width/2 to 0, center+width/2 to 255. Standard DICOM windowing formula.
  timestamp: 2026-03-29

- hypothesis: NIfTI data layout mismatch between server and client
  evidence: server transposes (X,Y,Z)→(Z,Y,X), metadata.dimensions=[dimX,dimY,dimZ] (pre-transpose). Client index = x+y*dimX+z*dimX*dimY matches C-order (Z,Y,X) layout. Confirmed by orientation tests (test_orientation.py line 50: result_data.shape == (dims[2], dims[1], dims[0])).
  timestamp: 2026-03-29

- hypothesis: auto-windowing produces wrong initial values
  evidence: CT path returns (40,400) standard soft-tissue window when d_min<=-900. Non-CT path uses p2/p98 percentile of foreground voxels. Both are standard and produce reasonable initial display.
  timestamp: 2026-03-29

- hypothesis: canvas gamma/color correction distorts pixel values
  evidence: HTML5 Canvas putImageData bypasses color correction per spec. Not applicable.
  timestamp: 2026-03-29

- hypothesis: windowCenter/windowWidth JSON values arrive wrong at client
  evidence: VolumeMetadata model has float|None fields, FastAPI serializes to JSON numbers, client uses ??(null coalescing) fallback. No conversion issue.
  timestamp: 2026-03-29

- timestamp: 2026-03-29
  checked: nifti_loader.py modality threshold vs actual brain CT value ranges
  found: d_min < -300 still misses brain-only CT — scalp fat is ~-80 to -150 HU, which is above -300. Loosened to d_min < -50. Added print diagnostics to both loaders to confirm modality detection at server startup. Standard MRI signal intensity is always >= 0, so -50 does not false-positive MRI. All 35 client + 14 server tests pass.
  implication: fix is correct and safe

- timestamp: 2026-03-29
  checked: pixel readout feature in ViewerPanel.js, ViewerState.js, main.js
  found: already implemented in prior session (confirmed by git diff). ViewerPanel fires setCursorValue on mousemove. ViewerState has cursorValueListeners path. main.js subscribes sidebar readout element.
  implication: pixel readout feature is complete — no new work needed

## Evidence

- timestamp: 2026-03-29
  checked: windowLevel.js applyWindowLevel formula
  found: val = (raw - (center - width/2)) * (255/width). Correctly maps center-width/2→0, center+width/2→255. Standard linear windowing.
  implication: rendering formula is correct

- timestamp: 2026-03-29
  checked: computeWLDrag dy direction
  found: center = currentCenter + dy * sensitivity. dy>0 (mouse down) → center increases → image gets darker. This is opposite to OsiriX/Horos/most PACS convention where drag down = brighter (lower center).
  implication: user drags down expecting brighter image, gets darker image. "Looks wrong."

- timestamp: 2026-03-29
  checked: windowLevel.js docblock order
  found: applyWindowLevel JSDoc appears at lines 9-16, before computeWLDrag's JSDoc (lines 17-25). computeWLDrag defined at line 26. applyWindowLevel defined at line 33 with no attached docblock.
  implication: documentation disorder (cosmetic), not a runtime bug

- timestamp: 2026-03-29
  checked: server tests
  found: test_auto_window_normal_distribution FAILS — test uses p5/p95 as expected values but function uses p2/p98. The test has wrong expected values; the function itself is consistent.
  implication: test quality issue, not a runtime bug

- timestamp: 2026-03-29
  checked: all client tests
  found: all 33 tests pass. windowLevel.test.js only tests computeWLDrag, not applyWindowLevel.
  implication: no test coverage for applyWindowLevel; drag direction test explicitly documents down=darker (line 10 comment)

- timestamp: 2026-03-29
  checked: preset button click handler and state.setPreset → notify chain
  found: setPreset() calls notify() which fires _onStateChange first (registered earliest), which calls render() on all panels. Chain is mechanically correct. New tests confirm setPreset updates windowCenter/windowWidth/activePreset and notifies subscribers.
  implication: preset buttons DO trigger re-renders. The visual failure is at the data-level, not the code-level.

- timestamp: 2026-03-29
  checked: nifti_loader.py and dicom_loader.py metadata dicts
  found: neither loader included a 'modality' key. volumes.py used metadata.get("modality", "unknown") → always returned "unknown". presetBar showed for state.modality === 'unknown' by design (line 25: "NIfTI files lack modality info, presets are harmless"). Presets are NOT harmless on MRI data.
  implication: Brain preset (center=40, width=80) applied to NIfTI MRI data with values [0, 2000] → minVal=0, scale=3.19 → all voxels >80 clamped to 255 = all-white. User sees solid white canvas = "image didn't change".

- timestamp: 2026-03-29
  checked: fix verification — nifti_loader modality heuristic + dicom_loader Modality tag + presetBar CT-only filter
  found: all 35 client tests pass, all 14 server tests pass after changes
  implication: fix is safe and correct

- timestamp: 2026-03-29
  checked: VolumeMetadata model, volumes.py load_and_cache_volume, nifti_loader metadata dict, dicom_loader metadata dict, main.js openVolume, ViewerState constructor
  found: data_min/data_max computed in loaders but never placed in metadata dict → never in VolumeMetadata → never in JSON response → client state has no data range. presetBar.setPreset() called with raw HU values regardless of modality.
  implication: confirmed root cause for gray preset issue

- timestamp: 2026-03-29
  checked: main.js updatePixelReadout — Number.isInteger(0.0) in JS
  found: Number.isInteger(0.0) === true and Number.isInteger(1.0) === true. Float32Array values that happen to be whole numbers (background=0.0, max tissue=1.0 in normalized data) formatted without decimal places, displaying as "0" and "1". User sees "mostly 0" because most volume voxels are background (zero).
  implication: confirmed root cause for pixel readout issue; formatting-only bug

- timestamp: 2026-03-29
  checked: fix implementation and test suite
  found: 14 server tests pass, 44 client tests pass (7 new presetBar tests, 2 new viewerState tests). presetBar.scalePresetToDataRange verified: preserves relative ordering of presets, produces proportional centers/widths, clamps width to minimum 1.
  implication: fix is correct and tested

## Resolution

root_cause: (1) Drag fix: computeWLDrag had inverted dy direction. (2) Preset fix: neither NIfTI nor DICOM loaders set the 'modality' field in their metadata dicts, so state.modality was always 'unknown'. presetBar showed CT presets for all volumes. (3) Preset visibility inverted: presetBar hid presets for 'unknown' modality — should only hide for known non-CT modalities (MR, PT, US, etc.). (4) W/L initial values wrong: nifti_loader used cal_min/cal_max from NIfTI header which can contain normalized junk values (e.g., [1.5, 2.5] → center=2, width=1). (5) Pixel readout: code logic correct but missing guard for canvas.clientWidth=0 that could produce NaN indices. (6) SECOND ROUND — Preset gray: d_min/d_max were never surfaced in VolumeMetadata or passed to client; presets applied CT HU values (e.g. Brain: center=40, width=80) to non-CT data, clamping nearly all voxels. (7) SECOND ROUND — Pixel readout shows "0" or "1": Number.isInteger(0.0)===true in JS, so float32 values 0.0 and 1.0 from normalized MRI volumes formatted as integers, hiding the actual float range.
fix: (1) Negate dy in computeWLDrag. (2) NIfTI loader: infer modality='CT' when d_min < -50 && d_max > 0. DICOM loader: extract Modality DICOM tag. (3) presetBar: show unless modality is in explicit non-CT set {MR, PT, NM, US, MG, XA, RF}. (4) nifti_loader: remove cal_min/cal_max bypass entirely; always use compute_auto_window which now uses median of foreground voxels for both center and width. (5) ViewerPanel mousemove: added guard for clientWidth/clientHeight <= 0; added explicit clamping with dimZ destructured. (6) Add data_min/data_max to VolumeMetadata model, nifti_loader, dicom_loader, volumes.py, ViewerState constructor, and main.js. presetBar.scalePresetToDataRange() linearly maps HU-based presets to actual data range for unknown modality. (7) main.js updatePixelReadout: replace Number.isInteger check with explicit float formatting — values >= 10 or exactly 0 use .toFixed(1); small values use .toFixed(3) to distinguish 0.0 from 0.001.
verification: 14 server tests pass. 44 client tests pass (new presetBar.test.js with 7 tests, 2 new viewerState tests). Awaiting user confirmation.
files_changed:
  - client/src/viewer/windowLevel.js
  - client/src/__tests__/windowLevel.test.js
  - server/tests/test_auto_window.py
  - client/src/ui/presetBar.js
  - server/loaders/nifti_loader.py
  - server/loaders/dicom_loader.py
  - client/src/__tests__/viewerState.test.js
  - client/src/viewer/ViewerState.js
  - client/src/viewer/ViewerPanel.js
  - client/src/main.js
  - server/catalog/models.py
  - server/api/volumes.py
  - client/src/__tests__/presetBar.test.js
