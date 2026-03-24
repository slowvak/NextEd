# Feature Landscape

**Domain:** Web-based medical image viewer/segmentation editor
**Researched:** 2026-03-24
**Confidence:** MEDIUM (based on training knowledge of OHIF, Cornerstone.js, ITK-SNAP, 3D Slicer, Papaya; no live verification possible this session)

## Competitive Landscape

The feature analysis below is informed by the following established tools:

- **ITK-SNAP** — Desktop gold standard for interactive segmentation of 3D medical images. Multi-plane views, active contour segmentation, manual paintbrush/polygon tools, label management.
- **3D Slicer** — Desktop Swiss-army knife for medical imaging. Hundreds of modules, volume rendering, registration, segmentation, scripting.
- **OHIF Viewer** — Web-based DICOM viewer built on Cornerstone.js. Viewing, measurements, annotations. Segmentation via extensions.
- **Cornerstone.js / Cornerstone3D** — Low-level JavaScript rendering library for medical images. Provides the rendering pipeline; tools built on top.
- **Papaya** — Lightweight web-based NIfTI/DICOM viewer. Orthogonal views, overlay support, basic interaction. No segmentation editing.
- **BrainBrowser** — Web-based neuroimaging viewer. Surface + volume viewing.
- **NiiVue** — Modern WebGL2-based NIfTI/DICOM viewer. Multi-plane, 3D rendering, overlays, colormaps.

NextEd's positioning: **ITK-SNAP's core segmentation workflow, delivered through a browser.** This is a narrow but valuable niche — most web viewers are view-only (OHIF, Papaya, NiiVue) while editing tools are desktop-only (ITK-SNAP, 3D Slicer).

---

## Table Stakes

Features users expect from any medical image viewer/editor. Missing = product feels incomplete or unusable to the target audience (researchers/radiologists familiar with ITK-SNAP).

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **Multi-planar reconstruction (MPR)** — Axial, coronal, sagittal views | Every tool has this. Users navigate anatomy spatially. | Medium | Core rendering challenge; must handle anisotropic voxel spacing correctly |
| **Slice scrolling** — Fast navigation through slices | Fundamental interaction. Must feel instant (<16ms). | Low | In-browser volume makes this straightforward with canvas |
| **Window/Level adjustment** — Brightness/contrast control | Radiologists adjust this constantly. Non-negotiable. | Low | Ctrl+drag is standard; presets for CT (Brain, Bone, Lung, Abdomen) expected |
| **Auto window/level on load** — Sensible initial display | Without this, images appear black/white on first open. | Low | 5th-95th percentile histogram is the standard approach |
| **Zoom and pan** — Navigate within a slice | Users need to inspect regions at different scales. | Low | Mouse wheel zoom + middle-click pan is standard |
| **Segmentation overlay display** — Color overlay on base image | The whole point of a segmentation editor. | Medium | Alpha blending with adjustable transparency; per-label colors |
| **Label management** — Add, rename, recolor labels | Users need to define what they're segmenting. | Medium | Integer value + name + color triplet; double-click editing |
| **Paintbrush tool** — Freehand voxel painting | Most basic segmentation tool. ITK-SNAP, 3D Slicer, all have it. | Medium | Must handle brush size, current label, paint-on-slice |
| **Eraser** — Remove segmentation voxels | Complement to paintbrush; right-click eraser is convention. | Low | Same as paintbrush but sets voxels to 0 |
| **Undo/Redo** — Reverse editing mistakes | Segmentation is tedious; losing work is devastating. | Medium | 3 levels minimum; must snapshot voxel state efficiently (delta-based) |
| **Save segmentation** — Export edited masks | Without this, edits are lost. Must save to NIfTI at minimum. | Medium | Save-As pattern is correct for safety; NIfTI (.nii.gz) is standard |
| **Volume catalog / file browser** — List available datasets | Users need to find and open their data. | Low | Server-side catalog with metadata display |
| **DICOM and NIfTI support** — Both major formats | Research uses NIfTI; clinical uses DICOM. Must support both. | High | DICOM grouping by series UID; NIfTI header parsing; different code paths |
| **Crosshair synchronization** — Linked cursor across views | Users expect clicking in one view to update slice position in others. | Medium | Standard in ITK-SNAP, 3D Slicer, OHIF. Critical for spatial orientation. |
| **Keyboard shortcuts** — Fast tool switching | Power users (researchers) live on keyboard shortcuts. | Low | Standard: P for paintbrush, E for eraser, Z for undo, etc. |

---

## Differentiators

Features that set NextEd apart from existing web-based tools. Not universally expected, but valuable.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Browser-based segmentation editing** | No install, no file transfer. This IS the core differentiator vs ITK-SNAP/3D Slicer. | N/A (meta) | The product concept itself is the differentiator |
| **Multi-slice paintbrush** — Paint across N slices simultaneously | Speeds up manual segmentation significantly. ITK-SNAP has this; web tools do not. | Medium | Slider control for slice count; applies brush footprint to adjacent slices |
| **ROI-constrained Otsu thresholding** — Draw rectangle/oval, auto-threshold within | Semi-automatic segmentation that's fast and intuitive. Rare in web tools. | Medium | Otsu is straightforward; "on" class detection via boundary sampling is the nuance |
| **Region growing** — Seeded flood-fill with intensity constraints | Key semi-automatic tool. Present in ITK-SNAP/3D Slicer, absent from web viewers. | High | Global 3D region grow is computationally expensive; needs WebWorker or server-side |
| **Min/max painting constraint** — Restrict painting to voxel value range | Prevents painting over anatomy that shouldn't be labeled. Experienced users expect this. | Low | Simple threshold gate on paint operations |
| **Auto-detection of segmentation files** — `_segmentation` naming convention | Reduces friction when opening paired images. | Low | Simple filename matching; dialog with pre-selection |
| **Modality-aware presets** — Show CT presets only for CT, hide for MR | Reduces clutter; shows awareness of clinical context. | Low | Read modality from DICOM tag or NIfTI header heuristic |
| **DICOM-SEG export** — Save segmentations in DICOM-SEG format | Enables round-tripping with clinical PACS systems. Rare in lightweight tools. | High | Requires dcmqi or equivalent; complex DICOM-SEG encoding |
| **Server-side processing offload** — Heavy operations (region grow) on Python backend | Enables algorithms that would be too slow in pure JS. Unique to this architecture. | Medium | API design for async operations; progress reporting |
| **Single-view mode toggle** — Expand one plane to full window | Focus on the plane being edited. Common in desktop tools, less common in web viewers. | Low | Layout toggle with A/C/S buttons |

---

## Anti-Features

Features to explicitly NOT build. These are scope traps or architectural mismatches for v1.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **3D volume rendering** | Massive complexity (WebGL shaders, transfer functions, ray casting). Separate product. Desktop tools do this well. | Stick to 2D MPR views. Consider as v2+ if demand exists. |
| **PACS integration / DICOMweb** | Requires networking, auth, WADO-RS. Turns a local tool into an enterprise product. | Serve from local filesystem. Users can mount network drives if needed. |
| **User accounts / authentication** | Single-user local tool. Auth adds complexity for zero value. | No auth. Single user assumed. |
| **Real-time collaboration** | Operational transforms on voxel data is a research project, not a feature. | Single user editing only. |
| **AI/ML-powered auto-segmentation** | Requires model serving infrastructure, GPU, model management. Separate concern. | Provide good semi-automatic tools (region grow, Otsu). Let users bring their own pre-computed masks. |
| **Measurement tools** (rulers, angles, area) | Nice-to-have but not core to segmentation workflow. OHIF does this well already. | Defer to v2. Focus on segmentation editing tools. |
| **Annotation tools** (arrows, text, markers) | Radiology reporting feature, not segmentation. Different product. | Out of scope entirely. |
| **Registration / co-registration** | Aligning two volumes is complex (ITK registration pipelines). | Assume volumes and segmentations are already in the same space. |
| **Multi-volume simultaneous viewing** | Layout complexity, memory doubling, synchronization challenges. | One main volume + one segmentation overlay. |
| **Mobile/tablet support** | Touch interaction for voxel-level painting is impractical. Desktop browser is the target. | Desktop-only. No responsive design compromises. |
| **Plugin/extension system** | Premature abstraction. Build the core well first. | Monolithic v1. Consider extensibility in v2 architecture. |
| **Multi-frame DICOM** | Edge case format (ultrasound, some MR sequences). Adds parsing complexity. | Single-frame DICOM only. Document the limitation. |
| **Polygon/lasso segmentation tool** | More complex to implement correctly than paintbrush; less commonly used for initial segmentation. | Paintbrush + ROI tools cover 80% of manual segmentation needs for v1. |

---

## Feature Dependencies

```
Volume Catalog ─────> Volume Loading ─────> MPR Rendering ─────> Slice Navigation
                                                │
                                                v
                                        Window/Level Adjustment
                                                │
                                                v
                                    Segmentation Overlay Display
                                           │         │
                                           v         v
                                    Label Management   Overlay Transparency
                                           │
                                           v
                              ┌─────────────┼─────────────────┐
                              v             v                 v
                        Paintbrush    ROI Tools          Region Grow
                              │         (rect/oval)          │
                              v             │                v
                     Multi-slice Paint      v          Server-side Processing
                              │      Otsu Threshold
                              v             │
                         Min/Max Constraint  │
                              │             │
                              v             v
                           Undo/Redo ◄──────┘
                              │
                              v
                        Save Segmentation
                              │
                              v
                    ┌─────────┴─────────┐
                    v                   v
              NIfTI Export       DICOM-SEG Export
```

Key dependency chains:
- **Rendering must come first**: MPR rendering is the foundation everything else is built on
- **Overlay before editing**: Segmentation display must work before editing tools make sense
- **Label management before painting**: Must know WHAT label to paint before painting
- **Undo wraps all editing**: Undo system should be designed early, as all editing tools feed into it
- **Region grow depends on server-side processing**: Too computationally expensive for browser-only; needs API endpoint

---

## MVP Recommendation

Based on the PRD's Active requirements and competitive analysis, the MVP should include all table stakes plus the core differentiating editing tools. The PRD already captures this well.

**Prioritize (Phase 1 - Core Viewer):**
1. Volume catalog and metadata display (DICOM + NIfTI)
2. Volume loading into browser memory
3. MPR rendering with correct anisotropic spacing
4. Slice navigation (slider-based)
5. Window/level (auto + manual + presets)
6. Zoom and pan
7. 4-panel and single-view layouts

**Prioritize (Phase 2 - Segmentation Editing):**
1. Segmentation file loading with auto-detection
2. Overlay display with transparency control
3. Label management (add, rename, recolor, change integer value)
4. Paintbrush tool (single + multi-slice)
5. Eraser (right-click)
6. Min/max painting constraint
7. Undo (3 levels)
8. Save As (.nii.gz)

**Prioritize (Phase 3 - Semi-Automatic Tools):**
1. Rectangle and oval ROI tools
2. Otsu thresholding within ROI (shift+draw)
3. Region growing (server-side processing)
4. DICOM-SEG export

**Defer:**
- Crosshair synchronization across views: useful but not blocking for v1 segmentation workflow
- Polygon/lasso tools: paintbrush covers the use case for v1
- Measurement tools: not core to segmentation
- 3D rendering: entirely separate product concern

---

## Competitive Gap Analysis

| Feature | ITK-SNAP | 3D Slicer | OHIF | Papaya | NiiVue | **NextEd (planned)** |
|---------|----------|-----------|------|--------|--------|---------------------|
| Web-based | No | No | Yes | Yes | Yes | **Yes** |
| MPR views | Yes | Yes | Yes | Yes | Yes | **Yes** |
| Manual segmentation | Yes | Yes | Extension | No | No | **Yes** |
| Semi-auto segmentation | Yes (active contour, region grow) | Yes (many) | Limited | No | No | **Yes (Otsu, region grow)** |
| Label management | Yes | Yes | Limited | No | No | **Yes** |
| NIfTI support | Yes | Yes | No | Yes | Yes | **Yes** |
| DICOM support | Yes | Yes | Yes | Yes | Yes | **Yes** |
| No install required | No | No | Yes | Yes | Yes | **Yes** |
| Save segmentation | Yes | Yes | Limited | No | No | **Yes** |

**NextEd's unique position:** The only web-based tool with a real segmentation editing workflow. OHIF has viewing + measurements but limited editing. ITK-SNAP has great editing but requires desktop installation. NextEd bridges this gap.

---

## Sources

- ITK-SNAP feature set: training knowledge from documentation and usage (MEDIUM confidence)
- 3D Slicer capabilities: training knowledge from extensive documentation (MEDIUM confidence)
- OHIF Viewer / Cornerstone.js: training knowledge from project documentation (MEDIUM confidence)
- Papaya viewer: training knowledge (MEDIUM confidence)
- NiiVue: training knowledge (LOW confidence -- newer project, may have added features since training cutoff)
- Competitive landscape analysis: training knowledge synthesis (MEDIUM confidence)

**Note:** Web search and fetch tools were unavailable during this research session. All findings are based on training data which may be 6-18 months stale. The feature sets of actively developed projects (OHIF, Cornerstone3D, NiiVue) should be re-verified before making final architecture decisions. The core feature categories (table stakes vs differentiators) are unlikely to have shifted significantly, as medical imaging tool expectations evolve slowly.
