# Project Research Summary

**Project:** NextEd — Web-Based Medical Image Viewer/Editor
**Domain:** Medical image viewer with interactive segmentation editing (NIfTI + DICOM)
**Researched:** 2026-03-24
**Confidence:** MEDIUM

## Executive Summary

NextEd occupies a narrow but genuinely valuable niche: it is the only web-based tool targeting ITK-SNAP's core segmentation editing workflow. The competitive landscape splits cleanly into desktop tools that do editing (ITK-SNAP, 3D Slicer) and web tools that do viewing only (OHIF, Papaya, NiiVue). NextEd bridges this gap without requiring installation, making it immediately valuable to researchers who currently pass data back and forth to desktop tools. The recommended architecture is a thick-client pattern — a FastAPI server handles cataloging, format parsing, and heavy computation (region growing) while the browser holds the full volume in memory and performs all slice rendering and editing locally. This is the same pattern used by NiiVue and Papaya and is the correct choice for interactive frame-rate performance.

The stack is straightforward and low-risk: Python + FastAPI + pydicom/nibabel/numpy/scikit-image on the server, and vanilla JavaScript + HTML5 Canvas 2D + Vite on the client. The "no framework" frontend recommendation is strong and deliberate — this is a pixel-pushing canvas application, not a CRUD app, and React/Vue actively fight against direct canvas control. Volume data must be transferred as raw binary ArrayBuffers over HTTP, not JSON; a 512x512x400 int16 volume is 200 MB and JSON encoding would balloon it threefold. The entire rendering hot path (slice extraction, window/level transform, canvas putImageData) is approximately 50 lines of JavaScript and runs in under 5 ms per frame on modern hardware.

The most critical risks are all in the data handling layer and must be addressed from day one, not retrofitted. NIfTI orientation/affine mishandling (Pitfall 1) produces silently flipped anatomy — the single most common and most dangerous bug in medical viewers. Voxel spacing anisotropy (Pitfall 3) must be built into the rendering from the start; adding it later requires reworking all canvas drawing and tool coordinate math. DICOM slice ordering must use ImagePositionPatient, not InstanceNumber. The architecture for memory management (TypedArrays, sparse undo diffs) and the choice of Canvas 2D vs WebGL must both be locked before writing any rendering code, as both are near-rewrites to change later.

## Key Findings

### Recommended Stack

The server is Python-native: FastAPI for the HTTP API (async, auto-docs, streaming responses), pydicom and nibabel for format I/O, numpy/scikit-image/scipy for all image processing. Package management uses uv exclusively (project requirement). The client is deliberately framework-free: vanilla JavaScript ES2022+ with HTML5 Canvas 2D API, built with Vite for fast HMR and ESM-native tooling. The only client-side dependency worth noting is pako for gzip decompression if needed client-side, though HTTP GZip via uvicorn middleware and browser-native decompression is the simpler default.

Library choices over alternatives are well-justified and stable: pydicom over SimpleITK (direct tag access for series grouping), nibabel over SimpleITK/ITK (purpose-built for NIfTI, lighter), scikit-image+scipy over OpenCV (cleaner Python API, no large C++ dependency), vanilla JS over any framework (canvas-heavy app), Vite over Webpack (fastest DX, ESM-native), and custom Canvas rendering over Cornerstone.js (Cornerstone assumes DICOMweb servers and fights a custom backend).

**Core technologies:**
- Python >=3.11 + FastAPI >=0.115 + uvicorn: async HTTP API server — project requirement, async-native, excellent binary streaming
- pydicom >=2.4: DICOM file I/O — the only serious Python DICOM library, direct tag access
- nibabel >=5.2: NIfTI file I/O — purpose-built, exposes affine/spacing directly
- numpy >=1.26 + scikit-image >=0.22 + scipy >=1.12: array ops and image processing — backbone for all voxel work, Otsu and region growing
- Vanilla JS + HTML5 Canvas 2D + Vite >=5.0: client rendering and build — no framework overhead for canvas-heavy app
- uv (latest): package management — project requirement

**Version caveat:** All version numbers are from training data (pre-Aug 2025 cutoff). Run `uv pip install --dry-run fastapi pydicom nibabel numpy scipy scikit-image` and `npm info vite version` before pinning.

### Expected Features

The competitive baseline is ITK-SNAP's core workflow delivered through the browser. Users coming from ITK-SNAP will immediately notice if crosshairs, anisotropic display, or segmentation overlay behavior differs from what they expect. The feature dependency chain is strict: rendering must work before overlay, overlay before editing, label management before painting, undo before any editing ships.

**Must have (table stakes):**
- Multi-planar reconstruction (axial, coronal, sagittal) — every tool has this; missing = unusable
- Slice scrolling at <16 ms — fundamental interaction; must feel instant
- Window/level adjustment with auto-windowing on load — non-negotiable for any medical viewer
- Zoom and pan — users inspect regions at scale
- Segmentation overlay display with adjustable transparency — the whole point
- Label management (add, rename, recolor, change integer value) — users define what they're segmenting
- Paintbrush and eraser tools — most basic segmentation tools
- Undo (3 levels minimum) — losing segmentation work is devastating
- Save As (.nii.gz) — without this, edits are lost
- Volume catalog with NIfTI + DICOM support — users must find and open their data
- Crosshair synchronization across planes — standard in all MPR tools; critical for spatial orientation
- Keyboard shortcuts — researchers live on shortcuts

**Should have (differentiators):**
- Multi-slice paintbrush — speeds up manual segmentation; web tools don't have this
- ROI-constrained Otsu thresholding (rectangle + oval, shift+draw) — semi-automatic tool rare in web viewers
- Region growing (server-side, seeded flood fill) — present in ITK-SNAP; absent from all web viewers
- Min/max pixel range constraint on painting — experienced users expect this
- Single-view mode toggle — common in desktop tools; useful when editing
- Auto-detection of segmentation files by naming convention — reduces friction
- DICOM-SEG export — enables PACS round-tripping; rare in lightweight tools

**Defer (v2+):**
- 3D volume rendering — massive complexity, separate product concern
- Crosshair synchronization across views (can defer if needed to hit MVP, but listed as table stakes)
- Measurement tools (rulers, area) — not core to segmentation; OHIF handles this
- Polygon/lasso tools — paintbrush covers 80% of v1 needs
- PACS/DICOMweb integration — turns a local tool into an enterprise product
- AI/ML auto-segmentation — requires model serving infrastructure
- Multi-frame DICOM — edge case format, complex parsing

### Architecture Approach

NextEd follows the thick-client / thin-server pattern: the server is a catalog and data pipeline (scan files on startup, load volumes as binary, run heavy computation on demand); the browser holds the full 3D volume as a TypedArray in memory and performs all slice rendering, compositing, and mask editing locally. This eliminates network latency from the rendering hot path entirely. The server needs a module-level volume cache (one volume at a time, single-user) so region grow operations do not re-read 200 MB from disk on every request.

**Major components:**
1. Catalog Service (server) — walks folder tree on startup, groups DICOM by SeriesInstanceUID, exposes metadata via REST
2. Volume Loader (server) — reads NIfTI (nibabel) and DICOM (pydicom), assembles 3D numpy array, serializes as binary with metadata in HTTP headers
3. Image Processing Service (server) — Otsu threshold, region growing, histogram percentile; handles ops too slow for browser
4. Save Service (server) — receives Uint8Array mask + metadata, writes .nii.gz or DICOM-SEG with correct affine/headers
5. Volume Manager (client) — holds main volume TypedArray + segmentation mask TypedArray + metadata + W/L state; the central in-browser data store
6. Slice Renderer (client) — extracts 2D slice from 3D array via index math (no copy), applies W/L LUT transform, writes to pre-allocated ImageData, calls putImageData
7. Segmentation Overlay Renderer (client) — composites mask slice onto rendered image; separate offscreen canvas with imageSmoothingEnabled=false; alpha-blends via drawImage
8. Tool Engine (client) — handles mouse/keyboard events, dispatches to active tool, manages sparse diff undo stack (3 levels)
9. Label Manager (client) — integer value + name + color per label; feeds both Tool Engine (active label) and Overlay Renderer (color map)
10. Viewer Panel / Layout (client) — 4-up and single-view layouts; canvas sizing with CSS-based anisotropic aspect ratio correction

**Key architectural decisions locked:**
- Canvas 2D API (not WebGL) for v1 — 2D slices only, putImageData is sufficient and simpler
- LUT-based windowing — pre-compute 65536-entry lookup table; updating W/L regenerates LUT, not pixels
- Sparse diff undo — store only changed voxels per operation, not full volume snapshots
- Otsu client-side, region grow server-side — the 100K-voxel boundary rule
- Binary ArrayBuffer transfer with metadata in X-Volume-Metadata header — single atomic request

### Critical Pitfalls

1. **NIfTI orientation/affine mishandling** — Always derive display orientation from the affine matrix; never hardcode axis order assumptions. Test with a synthetic volume containing a marked voxel at a known RAS coordinate. Must be correct from the first rendering milestone; retrofitting requires a rewrite.

2. **Voxel spacing anisotropy ignored** — Scale canvas display via CSS transform based on voxel spacing ratios for coronal/sagittal views. Convert brush radius from mm to voxels per-axis. Test with a 1.0 x 1.0 x 5.0 mm dataset. Must be built into initial rendering; adding later reworks all canvas and tool coordinate code.

3. **DICOM parsing edge cases** — Sort slices by ImagePositionPatient Z-component (not InstanceNumber). Always apply RescaleSlope/Intercept. Handle MONOCHROME1 inversion. Sub-group series by ImageOrientationPatient to separate localizers. Use pydicom's pixel_array property.

4. **Browser memory exhaustion from volume data** — Use TypedArrays exclusively (not regular JS arrays). Implement undo as sparse diffs (changed voxels only, not full copies). Null out intermediate buffers after parsing. Architecture decision from Phase 1 that cannot be easily retrofitted.

5. **Canvas rendering performance bottleneck** — Pre-compute windowing LUT. Throttle renders with requestAnimationFrame. Use dirty flagging to only re-render changed panels. The putImageData hot path must stay under 5 ms per frame; profile early.

6. **Segmentation overlay compositing errors** — Render overlay on a separate offscreen canvas. Always set imageSmoothingEnabled=false on the overlay canvas (labels are categorical). Use identical coordinate transforms for image and segmentation. Verify alignment with a single-voxel test.

## Implications for Roadmap

Based on the feature dependency chain and architecture build order, a 5-phase structure is recommended.

### Phase 1: Foundation — Server Catalog + Volume Loading

**Rationale:** Everything else depends on being able to get a volume from disk into the browser. The catalog, loaders, and binary transfer API must be correct before client rendering can be written or tested. DICOM parsing correctness (Pitfall 4) must be solved here.

**Delivers:** A working FastAPI server that scans a folder tree, groups DICOM series, reads NIfTI/DICOM into 3D numpy arrays, and serves them as binary ArrayBuffers with metadata headers. Testable via curl.

**Addresses:** Volume catalog, DICOM + NIfTI format support (table stakes)

**Avoids:** DICOM slice ordering failures (Pitfall 4), JSON transfer bloat (Pitfall 7), RAS/LPS coordinate system mismatch decision (Pitfall 11 — fix internal convention here)

**Research flag:** Standard patterns (pydicom + nibabel are well-documented). No phase research needed unless DICOM-SEG output is in scope for this phase.

### Phase 2: Core Viewer — MPR Rendering + Navigation

**Rationale:** The rendering hot path and its foundational decisions (Canvas 2D vs WebGL, LUT windowing, anisotropic spacing, affine-derived orientation) must all be locked before any feature is built on top. Getting orientation wrong here means a rewrite. Getting performance wrong here means an architectural pivot.

**Delivers:** A browser client that loads a volume from the server, renders axial/coronal/sagittal slices in a 4-up layout with correct anisotropic display, supports slice scrolling, and provides window/level adjustment (auto + manual + CT presets). Layout toggle (4-up / single-view). Zoom and pan. This phase is demonstrable and usable as a pure viewer.

**Addresses:** MPR views, slice scrolling, window/level, zoom/pan, auto-windowing, 4-panel layout, single-view toggle (table stakes + differentiator)

**Avoids:** NIfTI orientation mishandling (Pitfall 1 — must be tested with gold-standard dataset here), voxel spacing anisotropy (Pitfall 3 — must be in initial canvas sizing), canvas rendering performance (Pitfall 5 — LUT and requestAnimationFrame from day one), W/L signed data errors (Pitfall 9)

**Research flag:** Standard patterns. Canvas 2D + LUT windowing + TypedArray slice extraction are well-documented.

### Phase 3: Segmentation Display + Label Management

**Rationale:** Overlay display must be correct before editing tools are built on top of it. Compositing errors found here are cheap to fix; found after the tool engine is built, they require reworking coordinate transforms across every tool.

**Delivers:** Segmentation file loading (with auto-detection by naming convention), overlay compositing on the viewer with per-label colors and adjustable transparency, label management panel (add, rename, recolor, change integer value, delete). Crosshair synchronization across planes.

**Addresses:** Segmentation overlay display, label management, overlay transparency, segmentation auto-detection, crosshair synchronization (table stakes + differentiators)

**Avoids:** Overlay compositing errors (Pitfall 6 — separate offscreen canvas, imageSmoothingEnabled=false), label integer value conflicts (Pitfall 13)

**Research flag:** Standard patterns. No phase research needed.

### Phase 4: Editing Tools + Undo + Save

**Rationale:** Editing tools depend on a correct overlay display (Phase 3) and a robust undo architecture. Undo must be designed before any editing tool is built, as all tools feed into it. The sparse diff approach must be decided here, not discovered later when memory issues surface.

**Delivers:** Paintbrush (single-slice and multi-slice), eraser (right-click), min/max pixel range constraint, 3-level sparse-diff undo, Save As (.nii.gz with correct affine roundtrip). Keyboard shortcuts for all tools.

**Addresses:** Paintbrush, eraser, multi-slice painting, min/max constraint, undo/redo, save segmentation, keyboard shortcuts (table stakes + differentiators)

**Avoids:** Undo as full volume snapshots — memory crash (Pitfall 8), multi-slice boundary out-of-bounds (Pitfall 12), save/export affine roundtrip loss (Pitfall 14), main thread blocking (Pitfall 10 — consider Web Worker for .nii.gz save)

**Research flag:** Standard patterns. Sparse diff undo and NIfTI save via nibabel are well-documented.

### Phase 5: Semi-Automatic Tools + DICOM-SEG Export

**Rationale:** Semi-automatic tools are differentiators that build on the editing foundation. Region grow is the most complex feature in the project (3D server-side flood fill + client/server round-trip + progress indication). DICOM-SEG export is complex DICOM encoding. Both belong in a dedicated phase after the core workflow is solid.

**Delivers:** Rectangle and oval ROI tools, Otsu thresholding within ROI (client-side, shift+draw), seeded region growing (server-side via scipy.ndimage, with progress indication and confirm/cancel flow), DICOM-SEG export via highdicom.

**Addresses:** ROI tools, Otsu thresholding, region growing, DICOM-SEG export (differentiators)

**Avoids:** Region grow unbounded / too slow on main thread (Pitfall 10 — server-side via scipy + async endpoint), Otsu edge cases on unimodal histograms (Pitfall 15 — graceful degradation + undo), DICOM-SEG encoding errors (use highdicom, not raw pydicom)

**Research flag:** Region grow API design and progress reporting pattern may benefit from a brief research pass. DICOM-SEG encoding via highdicom has sparse documentation — phase research recommended before implementation.

### Phase Ordering Rationale

- The feature dependency chain from FEATURES.md maps directly to this phase order: rendering before overlay, overlay before editing, editing before semi-automatic
- Architecture component build order from ARCHITECTURE.md confirms the same sequence (Phases 1-5 in ARCHITECTURE.md map to Phases 1-5 here)
- Critical pitfalls 1, 3, 5, and 6 must all be solved in Phases 1-3 before any editing tool is written; retrofitting any of them requires touching every subsequent component
- DICOM-SEG (Phase 5) is isolated as a pure add-on that does not affect any other component if deferred

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 5 (DICOM-SEG export):** highdicom documentation is sparse; DICOM-SEG standard compliance has many edge cases. Research the highdicom API and DICOM-SEG structure before designing the save endpoint.
- **Phase 5 (region grow progress reporting):** FastAPI streaming responses / SSE pattern for long-running operations. Straightforward but worth verifying the exact pattern before implementation.

Phases with standard patterns (skip research-phase):
- **Phase 1 (server catalog + loading):** pydicom and nibabel are mature, extensively documented, stable APIs.
- **Phase 2 (core viewer rendering):** Canvas 2D, TypedArray slice extraction, LUT windowing are textbook web platform patterns.
- **Phase 3 (overlay display):** Canvas compositing with globalAlpha and offscreen canvas is well-documented.
- **Phase 4 (editing + undo):** Sparse diff undo is a standard pattern; nibabel NIfTI writing is documented.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM | Library choices are HIGH confidence (stable 5+ years). Version numbers are LOW confidence — from training data pre-Aug 2025, must be verified with `uv pip install --dry-run` and `npm info` before pinning |
| Features | MEDIUM | Based on training knowledge of ITK-SNAP, OHIF, Cornerstone, NiiVue. Core feature categories are unlikely to have shifted (medical imaging tool expectations evolve slowly). NiiVue specifically may have added features since training cutoff |
| Architecture | HIGH | Thick-client pattern with Canvas 2D rendering and binary transfer is well-established, first-principles reasoning is solid, data size constraints are deterministic |
| Pitfalls | MEDIUM | Based on well-documented patterns from mature projects (Cornerstone.js, OHIF, Papaya, ITK-SNAP). NIfTI specification and DICOM standard are stable. Web search unavailable to verify latest community findings |

**Overall confidence:** MEDIUM

### Gaps to Address

- **Exact library versions:** Verify all Python and npm package versions against current stable releases before pinning in pyproject.toml and package.json. Use `uv pip install --dry-run fastapi pydicom nibabel numpy scipy scikit-image` and `npm info vite version`.
- **Canvas 2D vs WebGL performance threshold:** The recommendation is Canvas 2D for v1 (simpler, sufficient for 512x512). If profiling in Phase 2 reveals Canvas 2D cannot hit 60fps on target hardware, the fallback to WebGL needs to be planned. Make the rendering pipeline pluggable enough to swap if necessary.
- **DICOM-SEG encoding details:** highdicom API and DICOM-SEG standard compliance need a focused research pass before Phase 5 design. Treat as a research-phase trigger.
- **NiiVue feature status:** NiiVue is an actively developed project and may have added segmentation editing since training cutoff. Worth a quick check before finalizing competitive positioning claims.
- **Browser memory ceiling on target hardware:** The 800 MB estimate for a 512x512x400 volume + segmentation + undo is a guideline. Actual ceiling depends on OS, browser, and available RAM. Test on the lowest-spec target machine in Phase 2.

## Sources

### Primary (HIGH confidence)
- Training knowledge of Canvas 2D API, TypedArray, ArrayBuffer (stable web platform APIs, spec-defined)
- Training knowledge of numpy, scipy.ndimage, scikit-image capabilities (mature, stable Python libraries)
- Training knowledge of nibabel and pydicom (canonical medical imaging I/O libraries, stable 5+ years)
- Direct first-principles analysis of data size constraints and performance requirements

### Secondary (MEDIUM confidence)
- Training knowledge of OHIF Viewer and Cornerstone.js architecture (uses Cornerstone rendering + WebGL)
- Training knowledge of NiiVue (WebGL-based NIfTI viewer, holds volume in GPU texture)
- Training knowledge of Papaya viewer (Canvas 2D API, in-browser NIfTI rendering)
- Training knowledge of ITK-SNAP and 3D Slicer feature sets
- NIfTI-1 specification (sform/qform priority rules, affine conventions)
- DICOM standard Part 3 (ImagePositionPatient, RescaleSlope, PhotometricInterpretation)

### Tertiary (LOW confidence)
- NiiVue current feature set (actively developed; may have changed since training cutoff)
- Exact current stable versions of all libraries (need live verification)

---
*Research completed: 2026-03-24*
*Ready for roadmap: yes*
