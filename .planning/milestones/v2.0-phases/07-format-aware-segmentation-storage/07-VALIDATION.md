---
phase: 07
slug: format-aware-segmentation-storage
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-06
---

# Phase 07 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest (server), vitest (client) |
| **Config file** | server/pyproject.toml, client/vitest.config.js |
| **Quick run command** | `python -m pytest server/tests/ -x -q` |
| **Full suite command** | `python -m pytest server/tests/ -v && cd client && npx vitest run` |
| **Estimated runtime** | ~8 seconds |

---

## Sampling Rate

- **After every task commit:** Run `python -m pytest server/tests/ -x -q`
- **After every plan wave:** Run full suite command
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 8 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 07-01-01 | 01 | 1 | SEG-01, SEG-03, SEG-04 | unit+integration | `python -m pytest server/tests/test_dicom_seg.py -v` | ❌ W0 | ⬜ pending |
| 07-01-02 | 01 | 1 | SEG-02, SEG-03 | unit | `python -m pytest server/tests/test_segmentations.py -v` | ✅ exists | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `server/tests/test_dicom_seg.py` — stubs for SEG-01, SEG-04 (DICOM-SEG creation, label remapping)
- [ ] Test fixtures for DICOM source datasets (minimal synthetic DICOM files)

*Existing infrastructure covers NIfTI segmentation tests (SEG-02).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| DICOM-SEG opens in 3D Slicer | SEG-01 | External viewer validation | Save DICOM seg, open in 3D Slicer, verify overlay renders |
| DICOM-SEG opens in OHIF | SEG-01 | External viewer validation | Load via OHIF viewer, verify segments visible |
| Format auto-selection UX | SEG-03 | User perception | Save on DICOM volume → .dcm; save on NIfTI volume → .nii.gz |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 8s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
