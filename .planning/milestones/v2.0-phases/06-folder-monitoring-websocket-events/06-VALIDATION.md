---
phase: 6
slug: folder-monitoring-websocket-events
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-04
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework (server)** | pytest (available at /Users/bje/miniconda3/bin/pytest) |
| **Framework (client)** | vitest 3.x |
| **Config file** | Implicit in package.json (vitest), needs pytest config for server |
| **Quick run command (server)** | `pytest tests/test_watcher.py tests/test_ws.py -x` |
| **Quick run command (client)** | `cd client && npm run test` |
| **Full suite command** | `cd client && npm run test && cd ../server && pytest tests/ -x` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick commands (server + client)
- **After every plan wave:** Run full suite command
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 01 | 1 | WATCH-01 | unit | `pytest tests/test_watcher.py::test_nifti_created -x` | No -- W0 | pending |
| 06-01-02 | 01 | 1 | WATCH-02 | unit | `pytest tests/test_watcher.py::test_volume_deleted -x` | No -- W0 | pending |
| 06-01-03 | 01 | 1 | WATCH-03 | unit | `pytest tests/test_debouncer.py::test_dicom_debounce -x` | No -- W0 | pending |
| 06-02-01 | 02 | 1 | WS-01 | integration | `pytest tests/test_ws.py::test_volume_added_broadcast -x` | No -- W0 | pending |
| 06-02-02 | 02 | 1 | WS-02 | integration | `pytest tests/test_ws.py::test_volume_removed_broadcast -x` | No -- W0 | pending |
| 06-03-01 | 03 | 2 | WS-03 | unit (JS) | `cd client && npx vitest run src/__tests__/wsClient.test.js` | No -- W0 | pending |
| 06-03-02 | 03 | 2 | WS-04 | unit (JS) | `cd client && npx vitest run src/__tests__/wsClient.test.js` | No -- W0 | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [ ] `server/tests/test_watcher.py` — stubs for WATCH-01, WATCH-02
- [ ] `server/tests/test_debouncer.py` — stubs for WATCH-03
- [ ] `server/tests/test_ws.py` — stubs for WS-01, WS-02 (FastAPI TestClient WebSocket)
- [ ] `client/src/__tests__/wsClient.test.js` — stubs for WS-03, WS-04
- [ ] Server pytest config: add `[tool.pytest.ini_options]` to pyproject.toml or create pytest.ini
- [ ] Install `httpx` and `pytest-asyncio` for FastAPI WebSocket testing: `uv pip install httpx pytest-asyncio`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Volume appears in browser within seconds | WATCH-01 | Requires running server + browser | Start server, copy NIfTI to watched dir, observe volume list |
| Volume disappears from browser | WATCH-02 | Requires running server + browser | Start server, delete volume file, observe volume list |
| DICOM series appears as single entry | WATCH-03 | Multi-file copy + timing | Copy DICOM folder, wait 3s, verify single entry |
| WebSocket reconnects on disconnect | WS-04 | Requires network interruption | Open browser, stop/restart server, verify auto-reconnect |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
