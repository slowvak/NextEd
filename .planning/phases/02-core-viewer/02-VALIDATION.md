---
phase: 2
slug: core-viewer
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-24
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 8.x (backend), vitest (frontend) |
| **Config file** | server/pyproject.toml, client/vitest.config.js |
| **Quick run command** | `cd server && uv run pytest tests/ -x -q` |
| **Full suite command** | `cd server && uv run pytest tests/ -v && cd ../client && npx vitest run` |
| **Estimated runtime** | ~20 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd server && uv run pytest tests/ -x -q`
- **After every plan wave:** Run full suite
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 20 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 2-01-01 | 01 | 1 | VIEW-05 | unit | `cd server && uv run pytest tests/test_volume_serve.py -k test_ras_normalization` | ❌ W0 | ⬜ pending |
| 2-01-02 | 01 | 1 | WLVL-01 | unit | `cd server && uv run pytest tests/test_volume_serve.py -k test_percentile_metadata` | ❌ W0 | ⬜ pending |
| 2-02-01 | 02 | 2 | VIEW-01,02,03 | unit | `cd client && npx vitest run --grep "slice extraction"` | ❌ W0 | ⬜ pending |
| 2-02-02 | 02 | 2 | VIEW-06 | unit | `cd client && npx vitest run --grep "anisotropic"` | ❌ W0 | ⬜ pending |
| 2-02-03 | 02 | 2 | WLVL-01,02 | unit | `cd client && npx vitest run --grep "window level"` | ❌ W0 | ⬜ pending |
| 2-03-01 | 03 | 3 | VIEW-04 | unit | `cd client && npx vitest run --grep "single view toggle"` | ❌ W0 | ⬜ pending |
| 2-03-02 | 03 | 3 | VIEW-07 | unit | `cd client && npx vitest run --grep "crosshair sync"` | ❌ W0 | ⬜ pending |
| 2-03-03 | 03 | 3 | WLVL-03,04 | unit | `cd client && npx vitest run --grep "preset"` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `server/tests/test_volume_serve.py` — stubs for RAS+ normalization and percentile metadata
- [ ] `client/src/__tests__/viewer.test.js` — stubs for slice extraction, anisotropic rendering, W/L
- [ ] `client/src/__tests__/crosshair.test.js` — stubs for crosshair sync, view toggle

*Existing infrastructure from Phase 1 covers framework install.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Canvas renders correct anatomical orientation | VIEW-01, VIEW-06 | Visual verification of anatomy | Open CT volume, verify axial shows correct L/R, coronal shows correct A/P |
| Crosshairs update visually across views | VIEW-07 | Canvas visual state | Click in axial view, verify coronal and sagittal crosshairs move |
| Ctrl+drag W/L feels responsive | WLVL-02 | Interaction feel | Ctrl+drag in any view, verify brightness/contrast changes smoothly |
| 4-panel to single-view transition | VIEW-04 | Layout animation/swap | Click A button, verify axial fills window; click +, verify 4-panel returns |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 20s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
