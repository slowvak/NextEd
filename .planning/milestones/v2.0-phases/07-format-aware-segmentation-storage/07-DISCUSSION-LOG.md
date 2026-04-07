# Phase 07: Format-Aware Segmentation Storage - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-06
**Phase:** 07-format-aware-segmentation-storage
**Areas discussed:** DICOM-SEG metadata, File placement

---

## DICOM-SEG Metadata

| Option | Description | Selected |
|--------|-------------|----------|
| Minimal valid (Recommended) | Study/Series UIDs linked, segment names from labels, generic category codes. Enough for round-trip in 3D Slicer / OHIF. | |
| Rich clinical | Map label names to SNOMED/SCT anatomy codes where possible. More interoperable but requires lookup table. | |
| You decide | Claude picks the right level based on highdicom requirements | ✓ |

**User's choice:** You decide
**Notes:** Claude has discretion on metadata depth — should target valid, round-trip-compatible output.

---

## File Placement

| Option | Description | Selected |
|--------|-------------|----------|
| Same directory as source (Recommended) | DICOM-SEG written alongside source series folder. Consistent with NIfTI behavior. | ✓ |
| Inside source series folder | DICOM-SEG goes inside same folder as source .dcm files. | |
| Dedicated output directory | Configurable output path. Clean separation but breaks locality. | |

**User's choice:** Same directory as source
**Notes:** Consistent with NIfTI segmentation placement behavior.

---

## Watcher SEG Interaction

| Option | Description | Selected |
|--------|-------------|----------|
| Save endpoint handles catalog (Recommended) | Save endpoint updates catalog + broadcasts directly. Watcher uses suppress list to ignore self-written files. | ✓ |
| Naming convention filter | DICOM-SEG files written with predictable prefix, watcher skips by pattern. | |
| You decide | Claude picks cleanest approach | |

**User's choice:** Save endpoint handles catalog
**Notes:** User clarified that DICOM files do not always have `.dcm` extensions — some are extensionless (e.g., `IM00022`), some capitalized (`.DCM`). This makes extension-based filtering unreliable and reinforces the suppress-list approach.

---

## Claude's Discretion

- DICOM-SEG metadata richness (minimal valid vs clinical coding)
- highdicom API usage patterns
- Save modal UX adaptations

## Deferred Ideas

- Broader watcher fix for extensionless DICOM detection
- DICOM-SEG loading (reading back as overlays)
