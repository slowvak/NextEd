---
phase: 08
slug: dicomweb-wado-rs
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-06
---

# Phase 08 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest (via uv) |
| **Config file** | server/pyproject.toml |
| **Quick run command** | `cd server && uv run python -m pytest tests/test_wado.py -x -q` |
| **Full suite command** | `cd server && uv run python -m pytest tests/ -x -q` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd server && uv run python -m pytest tests/test_wado.py -x -q`
- **After every plan wave:** Run `cd server && uv run python -m pytest tests/ -x -q`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 08-01-01 | 01 | 1 | WADO-01 | integration | `pytest tests/test_wado.py::test_retrieve_series_multipart -x` | ❌ W0 | ⬜ pending |
| 08-01-01 | 01 | 1 | WADO-01 | unit | `pytest tests/test_wado.py::test_retrieve_series_404 -x` | ❌ W0 | ⬜ pending |
| 08-01-01 | 01 | 1 | WADO-01 | unit | `pytest tests/test_wado.py::test_retrieve_missing_file -x` | ❌ W0 | ⬜ pending |
| 08-01-02 | 01 | 1 | WADO-02 | integration | `pytest tests/test_wado.py::test_metadata_json_format -x` | ❌ W0 | ⬜ pending |
| 08-01-02 | 01 | 1 | WADO-02 | unit | `pytest tests/test_wado.py::test_metadata_bulk_data_uri -x` | ❌ W0 | ⬜ pending |
| 08-01-02 | 01 | 1 | WADO-02 | unit | `pytest tests/test_wado.py::test_metadata_404 -x` | ❌ W0 | ⬜ pending |
| 08-01-01 | 01 | 1 | WADO-01 | unit | `pytest tests/test_wado.py::test_nifti_invisible -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `server/tests/test_wado.py` — stubs for WADO-01, WADO-02
- [ ] Test fixtures: minimal DICOM files with pixel data, registered in mock registries

*Existing test infrastructure (pytest, TestClient) covers framework needs.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| External viewer (OHIF/3D Slicer) can retrieve series via WADO-RS | WADO-01 | Requires running external viewer | Start server, configure viewer with WADO-RS URL, verify series loads |
| Multipart response parses correctly in real HTTP client | WADO-01 | Full HTTP stack needed | Use curl with multipart parsing or httpx to verify boundaries |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 5s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
