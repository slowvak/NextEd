# Phase 07: Format-Aware Segmentation Storage - Context

**Gathered:** 2026-04-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Automatic format selection when saving segmentations: DICOM-SEG (via highdicom) for DICOM-sourced volumes, NIfTI `_seg.nii.gz` for NIfTI-sourced volumes. Label values are remapped to contiguous 1..N for DICOM-SEG compliance. The user does not choose the format — the server selects it based on the parent volume's source format.

</domain>

<decisions>
## Implementation Decisions

### Format Selection
- **D-01:** The save endpoint checks `VolumeMetadata.format` ("nifti" or "dicom_series") to decide output format. No client-side changes needed for format detection — the server already knows.
- **D-02:** NIfTI segmentation save path is unchanged from v1.0 (`_seg.nii.gz` via nibabel). Only the DICOM-SEG path is new.

### DICOM-SEG Output
- **D-03:** DICOM-SEG files are written to the same directory as the source DICOM series folder (consistent with NIfTI behavior where segs go next to the volume file).
- **D-04:** Label values are remapped from arbitrary integers to contiguous 1..N segment numbers in the DICOM-SEG output, with original label names preserved as segment descriptions. This satisfies SEG-04.
- **D-05:** DICOM-SEG files must reference the source Study Instance UID and Series Instance UID. These are already available in `VolumeMetadata` (added in Phase 5, API-03).
- **D-06:** A RAS+ to LPS coordinate transform is required when writing DICOM-SEG, since the server normalizes all volumes to RAS+ orientation but DICOM uses LPS. The affine matrix in `_volume_cache` provides the transform.

### DICOM-SEG Metadata Depth
- **D-07:** Claude's discretion on metadata richness — decide based on what highdicom requires for a valid, round-trip-compatible DICOM-SEG file that opens in 3D Slicer and OHIF. Minimal valid metadata is acceptable; rich clinical coding (SNOMED/SCT) is optional.

### Watcher Interaction
- **D-08:** The save endpoint handles catalog updates and broadcasts `segmentation_added` directly. The watcher uses a short-lived suppress list to avoid re-detecting DICOM-SEG files it just wrote. No duplicate catalog entries.

### DICOM File Extension Constraint
- **D-09:** DICOM files do not always have `.dcm` extensions — some are extensionless (e.g., `IM00022`), some use capitalized extensions (e.g., `.DCM`). The DICOM-SEG output file should use `.dcm` extension for clarity, but the watcher/loader must not assume all DICOM files have extensions. This is a known limitation of the current watcher's suffix-based detection (`_DICOM_SUFFIXES`); fixing the watcher's general DICOM detection is out of scope for this phase but the DICOM-SEG save path should not make it worse.

### Claude's Discretion
- DICOM-SEG metadata depth (minimal valid vs rich clinical coding) — D-07
- highdicom API usage patterns and Segment object construction
- Whether to use highdicom's `DimensionOrganizationSequence` or let it auto-generate
- Internal refactoring of `save_segmentation()` endpoint (branching strategy, helper functions)
- Save modal UX — whether to show the auto-selected format to the user or keep it invisible

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` — Phase 7 covers SEG-01, SEG-02, SEG-03, SEG-04

### Prior Phase Context
- `.planning/phases/04-editing-tools-save/04-CONTEXT.md` — Save As modal workflow (D-03), segmentation data format (uint8)
- `.planning/phases/06-folder-monitoring-websocket-events/06-CONTEXT.md` — WebSocket event protocol (D-06), segmentation_added event type

### Code (Current Save Pipeline)
- `server/api/segmentations.py` — Current save endpoint (NIfTI-only), segmentation data serving, cache
- `server/api/volumes.py` — `_path_registry` (path + format), `_volume_cache` (data + metadata with affine)
- `server/catalog/models.py` — `VolumeMetadata` (has format, study/series UIDs), `SegmentationMetadata`
- `server/main.py` — `_catalog`, `_segmentation_catalog`, volume discovery functions
- `server/loaders/nifti_loader.py` — Current NIfTI segmentation loader

### Code (Watcher - for suppress list integration)
- `server/watcher/observer.py` — VolumeEventHandler, event processing loop
- `server/api/ws.py` — ConnectionManager.broadcast()

### Code (Client Save Flow)
- `client/src/main.js` — Save As modal, POST to `/api/v1/volumes/{id}/segmentations?filename=X`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `server/api/segmentations.py:save_segmentation()` — Branch point for format-aware save. Currently NIfTI-only; needs DICOM-SEG branch.
- `_volume_cache[volume_id]` — Contains `(data, metadata, ...)` with affine matrix needed for DICOM-SEG coordinate transform.
- `VolumeMetadata.format` — Already distinguishes "nifti" vs "dicom_series". No new metadata fields needed.
- `VolumeMetadata.study_instance_uid` / `series_instance_uid` — Available for DICOM-SEG reference UIDs.
- `_path_registry[volume_id]` — `(path, fmt)` tuple provides format at save time.

### Established Patterns
- Save endpoint receives raw uint8 binary body, reshapes using volume dimensions
- NIfTI output uses nibabel (`nib.Nifti1Image` + `nib.save`)
- Segmentation catalog updated in-memory after save
- Client sends binary ArrayBuffer via fetch POST

### Integration Points
- `save_segmentation()` in `server/api/segmentations.py` — primary modification target
- Watcher's event handler needs suppress list to ignore self-written DICOM-SEG files
- WebSocket broadcast for `segmentation_added` event (already defined in Phase 6 protocol)

</code_context>

<specifics>
## Specific Ideas

- DICOM files may lack extensions (e.g., `IM00022`) or use capitalized `.DCM` — the DICOM-SEG output should use `.dcm` but the system must not assume extension presence for detection
- Round-trip compatibility with 3D Slicer and OHIF is the key validation target for DICOM-SEG output

</specifics>

<deferred>
## Deferred Ideas

- Broader watcher fix for extensionless DICOM detection — belongs in a future enhancement, not Phase 7
- DICOM-SEG loading (reading DICOM-SEG files back as segmentation overlays) — separate feature

</deferred>

---

*Phase: 07-format-aware-segmentation-storage*
*Context gathered: 2026-04-06*
