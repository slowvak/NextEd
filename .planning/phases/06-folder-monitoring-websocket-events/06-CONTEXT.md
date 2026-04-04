# Phase 06: Folder Monitoring & WebSocket Events - Context

**Gathered:** 2026-04-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Real-time volume catalog updates: the server watches configured directories for filesystem changes (new/removed NIfTI and DICOM files) and pushes events to connected clients via WebSocket. Users see volumes appear and disappear in the browser without restarting the server or refreshing the page.

</domain>

<decisions>
## Implementation Decisions

### Filesystem Watcher
- **D-01:** Use Python `watchdog` library for filesystem event monitoring. It is the standard cross-platform file watcher for Python, well-maintained, and handles recursive directory watching out of the box.
- **D-02:** The watcher monitors the same paths provided at server startup (CLI args or `source_directory` from config). No separate watcher configuration UI needed.

### DICOM Series Debounce
- **D-03:** DICOM series arriving as multiple files are debounced with a 2-3 second quiet window (timer resets on each new file event in the same directory). After the quiet window expires, the directory is scanned and the series is registered as a single volume entry. This satisfies WATCH-03.
- **D-04:** NIfTI files (single-file volumes) do not need debouncing — they are registered immediately on creation event.

### WebSocket Protocol
- **D-05:** Use FastAPI's built-in WebSocket support (`@app.websocket()`). No additional library (e.g., socket.io) needed. This keeps the dependency footprint minimal and matches the existing stack.
- **D-06:** WebSocket endpoint at `/api/v1/ws`. Event payload is JSON with `type` field (`volume_added`, `volume_removed`, `segmentation_added`) and a `data` field containing relevant metadata (volume ID, name, format, etc.).
- **D-07:** Server maintains a set of active WebSocket connections and broadcasts events to all connected clients.

### Client Reconnection
- **D-08:** Client reconnects automatically with exponential backoff (1s, 2s, 4s, 8s... capped at 30s). Satisfies WS-04.
- **D-09:** A small visual indicator in the UI shows connection status (connected/reconnecting). Minimal — not a modal or blocking banner.

### Client Volume List Updates
- **D-10:** On `volume_added` event, the client adds the volume to the existing list without re-fetching the full volume list. On `volume_removed`, the client removes the volume from the list. This is a lightweight DOM update, not a full re-render.

### Claude's Discretion
- Server-side architecture for the watcher (thread vs asyncio integration) — researcher/planner decide based on watchdog's async capabilities
- Exact debounce timer implementation (threading.Timer, asyncio task, etc.)
- Whether to batch multiple rapid events into a single WebSocket message or send individually
- Connection manager class structure

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requirements
- `.planning/REQUIREMENTS.md` — Phase 6 covers WATCH-01, WATCH-02, WATCH-03, WS-01, WS-02, WS-03, WS-04
- `.planning/ROADMAP.md` — Phase 6 success criteria (4 criteria defined)

### Prior Phase Artifacts
- `.planning/phases/05-foundation/05-01-SUMMARY.md` — API versioning pattern (/api/v1/ prefix), volume registration pipeline
- `server/main.py` — Current startup scan logic, catalog structure, volume registration flow
- `server/api/volumes.py` — Volume list endpoint, `register_volume()` function, metadata registry

### Existing Code (Key Integration Points)
- `server/main.py:_scan_directory()` — Current directory scanning logic to reuse/adapt for watcher callbacks
- `server/main.py:_register_entries()` — Entry registration pipeline the watcher will invoke
- `server/api/volumes.py:register_volume()` — Function to register a new volume in the catalog
- `client/src/api.js` — `fetchVolumes()` function, API_BASE constant
- `client/src/main.js:init()` — Client initialization, volume list rendering
- `client/src/ui/volumeList.js` — Volume list DOM rendering (add/remove operations needed here)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `_scan_directory()` in server/main.py: Recursively discovers NIfTI and DICOM entries. Watcher callbacks can reuse the per-file classification logic.
- `_register_entries()` in server/main.py: Registers discovered entries into the catalog. Watcher can call this for newly found files.
- `register_volume()` in server/api/volumes.py: Adds a volume to the in-memory registry. The watcher's "add" path ends here.
- `renderVolumeList()` in client/src/ui/volumeList.js: Renders the volume list. Needs to support incremental add/remove operations.

### Established Patterns
- In-memory catalog (`_catalog` list in main.py) — no database, all state in memory
- FastAPI router pattern — each feature area gets its own router module
- Volume IDs are deterministic hashes of file paths
- Client fetches data via `fetch()` calls to `/api/v1/` endpoints

### Integration Points
- Server: New watcher module starts alongside uvicorn, feeds events into existing catalog
- Server: New WebSocket endpoint added as a FastAPI route (likely new router module)
- Client: New WebSocket connection manager module, hooks into volume list rendering
- Client: `init()` in main.js opens WebSocket after initial volume list load

</code_context>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 06-folder-monitoring-websocket-events*
*Context gathered: 2026-04-04*
