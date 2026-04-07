---
phase: 5
slug: foundation
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-31
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (client), pytest (server) |
| **Config file** | `client/vitest.config.js`, `server/tests/` |
| **Quick run command** | `cd client && npx vitest run --reporter=verbose` |
| **Full suite command** | `cd client && npx vitest run && cd ../server && python -m pytest tests/` |
| **Estimated runtime** | ~10 seconds |

---

## Sampling Rate

- **After every task commit:** Run quick command
- **After every plan wave:** Run full suite command
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 05-01-01 | 01 | 1 | API-01 | integration | `curl -s http://localhost:8000/api/v1/volumes` | ❌ W0 | ⬜ pending |
| 05-01-02 | 01 | 1 | API-01 | integration | `curl -s -o /dev/null -w '%{http_code}' http://localhost:8000/api/volumes` | ❌ W0 | ⬜ pending |
| 05-01-03 | 01 | 1 | API-02 | unit | `grep -r "dicom_file_paths" server/catalog/models.py` | ❌ W0 | ⬜ pending |
| 05-01-04 | 01 | 1 | API-03 | unit | `grep -r "study_instance_uid" server/catalog/models.py` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Existing test infrastructure covers phase requirements
- [ ] Server endpoint tests can be verified via curl or pytest

*Existing infrastructure covers all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Client volume list loads with new API prefix | API-01 | Requires running dev server | Start both servers, open browser, verify volume list loads |
| DICOM volume shows study/series UIDs | API-03 | Requires DICOM test data | Open DICOM volume detail, check for UID fields |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
