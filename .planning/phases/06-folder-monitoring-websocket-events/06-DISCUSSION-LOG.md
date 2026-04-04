# Phase 06: Folder Monitoring & WebSocket Events - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-04
**Phase:** 06-folder-monitoring-websocket-events
**Areas discussed:** Watcher library, WebSocket protocol, Client reconnection, DICOM debounce
**Mode:** --auto (all decisions auto-selected)

---

## Watcher Library

| Option | Description | Selected |
|--------|-------------|----------|
| watchdog (Python) | Standard cross-platform filesystem watcher, well-maintained | auto |
| Polling (manual) | Timer-based directory polling, no dependency | |

**User's choice:** [auto] watchdog (Python) — recommended default
**Notes:** watchdog is the de facto Python filesystem watcher. Polling would work but is less responsive and wastes CPU.

---

## WebSocket Protocol

| Option | Description | Selected |
|--------|-------------|----------|
| FastAPI native WebSocket | Built-in WebSocket support, no extra deps | auto |
| python-socketio | Socket.IO protocol with rooms/namespaces | |

**User's choice:** [auto] FastAPI native WebSocket — recommended default
**Notes:** FastAPI has built-in WebSocket support. Socket.IO adds unnecessary complexity for a single-user local tool.

---

## Client Reconnection

| Option | Description | Selected |
|--------|-------------|----------|
| Exponential backoff + visual indicator | 1s/2s/4s/8s... capped at 30s, small status indicator | auto |
| Simple fixed-interval retry | Retry every N seconds | |
| No auto-reconnect | Manual refresh required | |

**User's choice:** [auto] Exponential backoff + visual indicator — recommended default
**Notes:** WS-04 explicitly requires auto-reconnect with exponential backoff.

---

## DICOM Series Debounce

| Option | Description | Selected |
|--------|-------------|----------|
| Timer-based quiet window (2-3s) | Reset timer on each new file, register after quiet period | auto |
| File count heuristic | Wait until expected file count matches | |
| Immediate + update | Register immediately, update metadata as more files arrive | |

**User's choice:** [auto] Timer-based quiet window (2-3s) — recommended default
**Notes:** WATCH-03 specifies 2-3s quiet window. File count heuristic requires knowing expected count. Immediate+update would cause UI churn.

---

## Claude's Discretion

- Server-side watcher architecture (thread vs asyncio integration)
- Debounce timer implementation details
- Event batching strategy
- Connection manager class structure

## Deferred Ideas

None.
