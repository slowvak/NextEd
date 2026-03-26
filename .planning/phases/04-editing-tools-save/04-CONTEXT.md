# Phase 04: Editing Tools & Save - Context

**Gathered:** 2026-03-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Implementing segmentation paint/erase tools, multi-slice drawing, constraints, undo history, and file saving.
This provides the core object-editing functionality on top of the existing Phase 03 label and overlay components.

</domain>

<decisions>
## Implementation Decisions

### Brush Mechanics
- **D-01:** Paintbrush shape is circular and features an adjustable size/radius. Matches ITK-SNAP conventions for smooth anatomical boundaries.

### Undo History Memory
- **D-02:** Undo history stores only the diffs/sparse bitmaps of modified voxels rather than full 3D volume copies. Crucial for memory efficiency (up to 3 levels of undo per EDIT-09).

### Save Workflow UI
- **D-03:** "Save As" workflow is initiated via a dedicated 'Save' button in the left tool panel, which opens a modal popup prompting for the filename.

### Constrained Painting UI
- **D-04:** The min/max pixel value range constraint (EDIT-04) is controlled via a dual-handle slider in the left tool panel.

### Per-Label Visibility
- **D-05:** Visibility toggles (eye icons) are added to the Phase 03 label list. State controls which labels are skipped during the `blendSegmentationOverlay()` canvas step (visually achieving the CSS toggle effect the user requested without compromising the single-canvas architecture).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` — Phase 4 covers EDIT-01 through EDIT-10, SAVE-01 through SAVE-03, KEYS-01.
- `.planning/ROADMAP.md` — Phase dependencies and success criteria.

### Prior Phase Context
- `.planning/phases/02-core-viewer/02-CONTEXT.md` — Viewer interaction model, crosshair mechanics, and anisotropic rendering properties.
- `.planning/phases/03-segmentation-display-labels/03-CONTEXT.md` — Segmentation overlay blending (`blendSegmentationOverlay()`) and single-canvas performance architecture.

### Code Context
- `client/src/viewer/ViewerPanel.js` — Target for brush drawing events and overlay compositing modifications.
- `client/src/viewer/ViewerState.js` — Target for undo stack and active tool tracking.
</canonical_refs>
