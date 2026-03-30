---
phase: 04
slug: editing-tools-save
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-26
---

# Phase 04 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (client) / pytest 7.x (server) |
| **Config file** | client/vite.config.js / server/pytest.ini |
| **Quick run command** | `cd client && npm run test` / `cd server && pytest` |
| **Full suite command** | `(cd client && npm run test) && (cd server && pytest)` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick test suite for the modified component layer
- **After every plan wave:** Run full suite command
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. Vitest and Pytest are already installed and configured from Phase 01/02.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Fluid canvas painting performance | EDIT-01, EDIT-02 | Framerate and input latency are visual/tactile UX properties | Open a volume and rapidly paint across the canvas; verify NO lag between cursor and paint application. |
| Multi-slice correct depth application | EDIT-02 | Visual confirmation of Z-depth accumulation | Set multi-slice to 3, paint on Axial slice 50, then scroll to slice 49 and 51 to verify paint exists. |
| Undo/Redo memory stability | EDIT-09 | Heap snapshots are hard to assert in automated tests automatically across environments | After 3 large paint strokes, undo all 3 and verify browser memory footprint does not accumulate 3x 100MB volumes. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
