# Phase 06: Folder Monitoring & WebSocket Events - Research

**Researched:** 2026-04-04
**Domain:** Filesystem watching, WebSocket real-time events, asyncio thread bridging
**Confidence:** HIGH

## Summary

This phase adds real-time volume discovery to NextEd: the server watches configured directories for filesystem changes and pushes events to browser clients via WebSocket. The technical domain spans three areas: (1) filesystem monitoring with Python's `watchdog` library, (2) WebSocket connection management with FastAPI's built-in support, and (3) bridging watchdog's observer thread into FastAPI's asyncio event loop.

The core challenge is architectural: watchdog runs an OS-native observer thread (FSEventsObserver on macOS) that fires callbacks synchronously, but FastAPI's WebSocket broadcast is async. The standard solution is `loop.call_soon_threadsafe()` to marshal events from the observer thread into an `asyncio.Queue`, which the async broadcast loop consumes. This is a well-established pattern with minimal complexity.

The DICOM series debounce requirement (WATCH-03) adds a second layer: multiple file creation events in the same directory must be coalesced into a single "volume added" event after a 2-3 second quiet window. This is a standard debounce timer pattern implemented with `asyncio.Task` cancellation/restart.

**Primary recommendation:** Use watchdog Observer in a daemon thread with `call_soon_threadsafe` bridging into an asyncio queue. FastAPI ConnectionManager broadcasts JSON events to all connected WebSocket clients. Client reconnects with exponential backoff using vanilla JS `WebSocket` API.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** Use Python `watchdog` library for filesystem event monitoring
- **D-02:** Watcher monitors the same paths provided at server startup (CLI args or `source_directory` from config). No separate watcher configuration UI
- **D-03:** DICOM series debounced with 2-3 second quiet window (timer resets on each new file in same directory). After quiet window, directory scanned and series registered as single volume
- **D-04:** NIfTI files registered immediately on creation event (no debounce)
- **D-05:** Use FastAPI's built-in WebSocket support (`@app.websocket()`). No socket.io or additional library
- **D-06:** WebSocket endpoint at `/api/v1/ws`. JSON payload with `type` field (`volume_added`, `volume_removed`, `segmentation_added`) and `data` field
- **D-07:** Server maintains a set of active WebSocket connections and broadcasts to all
- **D-08:** Client reconnects with exponential backoff (1s, 2s, 4s, 8s... capped at 30s)
- **D-09:** Small visual indicator for connection status (connected/reconnecting). Minimal, not modal
- **D-10:** On `volume_added`, client adds to list without re-fetching full list. On `volume_removed`, removes from list. Lightweight DOM update

### Claude's Discretion
- Server-side architecture for watcher (thread vs asyncio integration)
- Exact debounce timer implementation (threading.Timer, asyncio task, etc.)
- Whether to batch multiple rapid events into single WebSocket message or send individually
- Connection manager class structure

### Deferred Ideas (OUT OF SCOPE)
None
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| WATCH-01 | New NIfTI/DICOM volumes in watched folders auto-discovered and appear in volume list | watchdog Observer + `_discover_nifti_volumes`/`_discover_dicom_series` reuse |
| WATCH-02 | Volumes removed from list when files deleted | watchdog deletion events + catalog/registry cleanup |
| WATCH-03 | DICOM series debounced (2-3s quiet window) so volume appears once complete | asyncio debounce task pattern with per-directory timers |
| WS-01 | Server pushes `volume_added` events via WebSocket | ConnectionManager.broadcast() triggered by watcher |
| WS-02 | Server pushes `volume_removed` events via WebSocket | ConnectionManager.broadcast() triggered by watcher |
| WS-03 | Client volume list updates reactively without page reload | DOM manipulation in volumeList.js (add/remove individual items) |
| WS-04 | Client reconnects automatically with exponential backoff | Vanilla JS WebSocket with reconnect loop |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Package management:** Use `uv` not `pip` for Python environment
- **Tech stack (server):** Python with FastAPI
- **Tech stack (client):** Vanilla JavaScript, no framework
- **Build tool:** Vite for client
- **GSD Workflow:** All changes through GSD commands

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| watchdog | 6.0.0 (installed) | Filesystem event monitoring | The standard cross-platform Python file watcher. Uses FSEventsObserver on macOS (native, efficient). Already installed. |
| FastAPI WebSocket | built-in (0.120.1) | WebSocket server endpoint | Part of FastAPI core via Starlette. No additional dependency needed. |
| asyncio.Queue | stdlib | Thread-to-async bridge | Standard way to marshal events from watchdog's observer thread to async code. |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| (none needed) | - | - | All requirements satisfied by existing deps + stdlib |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| watchdog | watchfiles (formerly watchgod) | watchfiles is Rust-based, faster, but watchdog is already installed and the user locked D-01 |
| FastAPI WS | python-socketio | Socket.IO adds reconnect/rooms but user locked D-05 to use built-in WS |
| Manual reconnect | reconnecting-websocket npm | Adds dependency for trivial ~20 lines of JS; user wants vanilla |

**Installation:**
```bash
# watchdog already installed (6.0.0). No new server dependencies needed.
# No new client dependencies needed.
```

## Architecture Patterns

### Recommended Project Structure
```
server/
  watcher/
    __init__.py
    observer.py       # Watchdog observer setup, FileSystemEventHandler subclass
    debouncer.py      # DICOM series debounce logic
  api/
    ws.py             # WebSocket endpoint + ConnectionManager
client/
  src/
    wsClient.js       # WebSocket connection with reconnect logic
    ui/
      volumeList.js   # (existing) — add addVolume() and removeVolume() functions
      connectionStatus.js  # Small indicator component
```

### Pattern 1: Thread-to-Asyncio Bridge (watchdog -> FastAPI)
**What:** watchdog Observer runs in a daemon thread. Its event handler uses `loop.call_soon_threadsafe(queue.put_nowait, event)` to push filesystem events into an `asyncio.Queue`. An async task consumes the queue and triggers WebSocket broadcasts.
**When to use:** Always -- watchdog's Observer is inherently threaded.
**Example:**
```python
# Source: https://gist.github.com/mivade/f4cb26c282d421a62e8b9a341c7c65f6
import asyncio
from watchdog.observers import Observer
from watchdog.events import FileSystemEventHandler

class VolumeEventHandler(FileSystemEventHandler):
    def __init__(self, queue: asyncio.Queue, loop: asyncio.AbstractEventLoop):
        self._queue = queue
        self._loop = loop

    def on_created(self, event):
        if not event.is_directory:
            self._loop.call_soon_threadsafe(self._queue.put_nowait, ("created", event.src_path))

    def on_deleted(self, event):
        if not event.is_directory:
            self._loop.call_soon_threadsafe(self._queue.put_nowait, ("deleted", event.src_path))
```

### Pattern 2: FastAPI ConnectionManager for WebSocket Broadcast
**What:** A singleton class that tracks active WebSocket connections and broadcasts JSON messages.
**When to use:** For the `/api/v1/ws` endpoint.
**Example:**
```python
# Source: https://fastapi.tiangolo.com/advanced/websockets/
from fastapi import WebSocket, WebSocketDisconnect
import json

class ConnectionManager:
    def __init__(self):
        self.active_connections: list[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        self.active_connections.remove(websocket)

    async def broadcast(self, message: dict):
        data = json.dumps(message)
        dead = []
        for conn in self.active_connections:
            try:
                await conn.send_text(data)
            except Exception:
                dead.append(conn)
        for conn in dead:
            self.active_connections.remove(conn)

manager = ConnectionManager()

@app.websocket("/api/v1/ws")
async def websocket_endpoint(websocket: WebSocket):
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()  # Keep connection alive
    except WebSocketDisconnect:
        manager.disconnect(websocket)
```

### Pattern 3: Asyncio Debounce for DICOM Series
**What:** Per-directory asyncio.Task that resets on each new file event. After 2-3s of quiet, scans the directory and registers the series.
**When to use:** DICOM file creation events (WATCH-03).
**Example:**
```python
class DICOMDebouncer:
    def __init__(self, delay: float = 2.5):
        self._delay = delay
        self._pending: dict[str, asyncio.Task] = {}  # dir_path -> task

    async def file_added(self, file_path: str, callback):
        dir_path = str(Path(file_path).parent)
        # Cancel existing timer for this directory
        if dir_path in self._pending:
            self._pending[dir_path].cancel()
        # Start new timer
        self._pending[dir_path] = asyncio.create_task(
            self._delayed_scan(dir_path, callback)
        )

    async def _delayed_scan(self, dir_path: str, callback):
        await asyncio.sleep(self._delay)
        del self._pending[dir_path]
        await callback(dir_path)
```

### Pattern 4: Client WebSocket with Exponential Backoff
**What:** Vanilla JS WebSocket connection that reconnects automatically on close/error.
**When to use:** Client-side wsClient.js module.
**Example:**
```javascript
// client/src/wsClient.js
const WS_URL = `ws://${location.host}/api/v1/ws`;
const MAX_DELAY = 30000;
let ws = null;
let delay = 1000;
let listeners = [];

function connect() {
    ws = new WebSocket(WS_URL);
    ws.onopen = () => {
        delay = 1000; // Reset backoff
        notifyStatus('connected');
    };
    ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        listeners.forEach(fn => fn(msg));
    };
    ws.onclose = () => {
        notifyStatus('reconnecting');
        setTimeout(connect, delay);
        delay = Math.min(delay * 2, MAX_DELAY);
    };
}

export function onWsEvent(fn) { listeners.push(fn); }
export function initWebSocket() { connect(); }
```

### Anti-Patterns to Avoid
- **Polling instead of WebSocket:** Do not add a setInterval to re-fetch the volume list. WebSocket push is the requirement.
- **Re-fetching full volume list on events:** D-10 requires incremental DOM updates. Do not call `fetchVolumes()` on every event.
- **Starting observer in the asyncio event loop thread:** watchdog.Observer is a Thread subclass. Start it as a daemon thread alongside the server, not inside an async function.
- **Blocking the WebSocket receive loop:** The `receive_text()` call in the WS endpoint must not block. It exists only to detect disconnection. Do not add processing logic there.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Filesystem monitoring | Custom inotify/FSEvents wrapper | `watchdog` library | Cross-platform, handles edge cases (rename events, move events, recursive watching) |
| WebSocket protocol | Raw TCP socket handling | FastAPI `@app.websocket()` | Handles upgrade, framing, ping/pong automatically |
| Thread-safe event passing | Locks and shared lists | `asyncio.Queue` + `call_soon_threadsafe` | Designed for this exact use case, no race conditions |

## Common Pitfalls

### Pitfall 1: Volume ID Collision After Dynamic Add
**What goes wrong:** Current code assigns volume IDs as sequential integers (`str(i)`) in `_register_entries()`. Dynamically added volumes need unique IDs that don't collide with existing ones.
**Why it happens:** The startup registration loop uses enumerate index. A new volume added at runtime would need a different ID scheme.
**How to avoid:** Use a hash-based ID (e.g., MD5 of the file path) for all volumes, both startup and runtime. Or use a monotonically increasing counter stored at module level. The codebase already uses `hashlib` -- a path-based hash is cleanest.
**Warning signs:** Two volumes with the same ID, second one overwrites first in registries.

### Pitfall 2: Watchdog Fires Events for Partial Writes
**What goes wrong:** Large NIfTI files being copied trigger `on_created` before the write is complete. Attempting to load an incomplete .nii.gz file crashes nibabel.
**Why it happens:** The OS creates the file entry immediately; data writes happen over seconds.
**How to avoid:** For NIfTI, add a small delay (0.5-1s) after creation event before attempting registration, or verify the file is not still being written (check if file size is stable over two polls). Alternatively, catch load errors gracefully and retry.
**Warning signs:** "unexpected end of file" or corrupted header errors from nibabel.

### Pitfall 3: WebSocket Connection Not Proxied by Vite Dev Server
**What goes wrong:** In development, the client connects to `ws://localhost:5173/api/v1/ws` but Vite does not proxy WebSocket connections by default with the current config.
**Why it happens:** The current `vite.config.js` proxies `/api` to `localhost:8050` but does not include `ws: true`.
**How to avoid:** Update `vite.config.js` to add `ws: true` to the proxy config:
```javascript
proxy: {
  '/api': {
    target: 'http://localhost:8050',
    changeOrigin: true,
    ws: true,
  },
},
```
**Warning signs:** WebSocket connection fails in dev mode but works when client hits backend directly.

### Pitfall 4: Removing a Volume That Is Currently Open in the Viewer
**What goes wrong:** User has a volume open, its files get deleted, the volume is removed from the list. Viewer tries to access now-invalid data.
**Why it happens:** The `volume_removed` event removes from the catalog but the viewer still holds a reference to the data array.
**How to avoid:** When removing a volume, check if it is the currently active volume. If so, close the viewer / show an "unavailable" message. The client must handle this edge case.
**Warning signs:** Blank viewer panels, JS errors about undefined data.

### Pitfall 5: Observer Thread Not Cleaned Up on Server Shutdown
**What goes wrong:** Server shuts down (Ctrl+C) but the watchdog Observer thread keeps running, preventing clean exit.
**Why it happens:** Observer is a non-daemon thread by default.
**How to avoid:** Set `observer.daemon = True` before starting, or use FastAPI's `shutdown` event to call `observer.stop()` and `observer.join()`.
**Warning signs:** Process hangs on Ctrl+C, requires kill -9.

### Pitfall 6: Race Between Startup Scan and Watcher Start
**What goes wrong:** Files added between the initial scan completing and the watcher starting are missed entirely.
**Why it happens:** Sequential startup: scan first, then start watcher.
**How to avoid:** Start the watcher BEFORE the initial scan. Any events during scan will be processed after scan completes. Deduplicate by checking if the volume already exists in the catalog.
**Warning signs:** Files copied during server startup window do not appear.

## Code Examples

### Starting the Observer with FastAPI Lifespan
```python
# Source: FastAPI docs + watchdog patterns
import asyncio
from contextlib import asynccontextmanager
from watchdog.observers import Observer

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: create queue, start observer
    loop = asyncio.get_event_loop()
    queue = asyncio.Queue()
    handler = VolumeEventHandler(queue, loop)
    observer = Observer()
    observer.daemon = True
    for path in watched_paths:
        observer.schedule(handler, str(path), recursive=True)
    observer.start()

    # Start async consumer task
    consumer_task = asyncio.create_task(process_events(queue))

    yield

    # Shutdown: stop observer, cancel consumer
    observer.stop()
    observer.join(timeout=5)
    consumer_task.cancel()
```

### Incremental Volume List Update (Client)
```javascript
// Add a single volume to the DOM list
export function addVolumeToList(vol, container, onSelect) {
    // Remove "no volumes" placeholder if present
    const placeholder = container.querySelector('.volume-item:not([data-volume-id])');
    if (placeholder) placeholder.remove();

    const li = document.createElement('li');
    li.className = 'volume-item';
    li.setAttribute('role', 'option');
    li.dataset.volumeId = vol.id;
    // ... build DOM same as renderVolumeList per-item logic ...
    li.addEventListener('click', () => onSelect(vol));
    container.appendChild(li);
}

// Remove a volume from the DOM list by ID
export function removeVolumeFromList(volumeId, container) {
    const item = container.querySelector(`[data-volume-id="${volumeId}"]`);
    if (item) item.remove();
    if (container.children.length === 0) {
        const li = document.createElement('li');
        li.className = 'volume-item';
        li.textContent = 'No volumes found.';
        container.appendChild(li);
    }
}
```

### Catalog Cleanup on Volume Removal (Server)
```python
def unregister_volume(vol_id: str):
    """Remove a volume from all registries."""
    from server.api.volumes import _metadata_registry, _path_registry, _volume_cache
    _metadata_registry.pop(vol_id, None)
    _path_registry.pop(vol_id, None)
    _volume_cache.pop(vol_id, None)
    # Also remove from _catalog list in main.py
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| watchgod (polling-based) | watchdog 6.x (OS-native events) | watchdog has been stable; watchgod renamed to watchfiles | Use watchdog per D-01 |
| Socket.IO for Python WS | FastAPI built-in WebSocket (Starlette) | FastAPI 0.65+ | No extra dependency needed |
| `@app.on_event("startup")` | `lifespan` context manager | FastAPI 0.93+ (2023) | `on_event` deprecated; use `lifespan` for startup/shutdown |

**Deprecated/outdated:**
- `@app.on_event("startup")` / `@app.on_event("shutdown")`: Deprecated in favor of `lifespan` async context manager. Use lifespan for observer startup/shutdown.

## Open Questions

1. **Volume ID scheme for dynamic additions**
   - What we know: Current IDs are sequential integers from startup. This breaks for runtime additions.
   - What's unclear: Whether to switch ALL IDs to hash-based (breaking change for cache) or only use hashes for new dynamic volumes.
   - Recommendation: Switch to hash-based IDs for all volumes (MD5 of canonical path). This is a small refactor but ensures consistency. The existing cache will invalidate (acceptable -- it re-scans).

2. **Segmentation file watching**
   - What we know: D-06 mentions `segmentation_added` event type. Current code discovers companion segmentations during volume registration.
   - What's unclear: Whether watcher should also detect new segmentation files appearing after initial scan.
   - Recommendation: Include segmentation file detection in the watcher since the event type is already specified. Same pattern as volume detection -- check for `_seg` suffix.

3. **Event batching**
   - What we know: User left batching vs individual events to Claude's discretion.
   - Recommendation: Send individual events. Batching adds complexity (timeouts, batch size limits) for no user-visible benefit since volume additions are infrequent. The DICOM debounce already handles the one case where batching matters.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework (client) | vitest 3.x |
| Framework (server) | pytest (available at /Users/bje/miniconda3/bin/pytest) |
| Config file (client) | Implicit in package.json (`vitest run`) |
| Config file (server) | None -- needs pytest.ini or pyproject.toml section |
| Quick run command (client) | `cd client && npm run test` |
| Quick run command (server) | `pytest tests/ -x` |
| Full suite command | `cd client && npm run test && cd .. && pytest tests/ -x` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| WATCH-01 | NIfTI file creation triggers volume registration | unit | `pytest tests/test_watcher.py::test_nifti_created -x` | No -- Wave 0 |
| WATCH-02 | File deletion triggers volume removal | unit | `pytest tests/test_watcher.py::test_volume_deleted -x` | No -- Wave 0 |
| WATCH-03 | DICOM series debounced into single volume | unit | `pytest tests/test_debouncer.py::test_dicom_debounce -x` | No -- Wave 0 |
| WS-01 | volume_added event broadcast via WebSocket | integration | `pytest tests/test_ws.py::test_volume_added_broadcast -x` | No -- Wave 0 |
| WS-02 | volume_removed event broadcast via WebSocket | integration | `pytest tests/test_ws.py::test_volume_removed_broadcast -x` | No -- Wave 0 |
| WS-03 | Client list updates on WS event | unit (JS) | `cd client && npx vitest run src/__tests__/wsClient.test.js` | No -- Wave 0 |
| WS-04 | Client reconnects with exponential backoff | unit (JS) | `cd client && npx vitest run src/__tests__/wsClient.test.js` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `pytest tests/test_watcher.py tests/test_ws.py -x` (server) + `cd client && npm run test` (client)
- **Per wave merge:** Full suite
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/test_watcher.py` -- covers WATCH-01, WATCH-02
- [ ] `tests/test_debouncer.py` -- covers WATCH-03
- [ ] `tests/test_ws.py` -- covers WS-01, WS-02 (FastAPI TestClient WebSocket)
- [ ] `client/src/__tests__/wsClient.test.js` -- covers WS-03, WS-04
- [ ] Server pytest config: add `[tool.pytest.ini_options]` to pyproject.toml or create pytest.ini
- [ ] `httpx` and `pytest-asyncio` install for FastAPI WebSocket testing: `uv pip install httpx pytest-asyncio`

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| watchdog | WATCH-01/02/03 | Yes | 6.0.0 | -- |
| FastAPI WebSocket | WS-01/02 | Yes | 0.120.1 (built-in) | -- |
| Python asyncio | Thread bridge | Yes | stdlib | -- |
| pytest | Server tests | Yes | available | -- |
| vitest | Client tests | Yes | 3.x (in package.json) | -- |

**Missing dependencies with no fallback:** None

**Missing dependencies with fallback:** None

## Sources

### Primary (HIGH confidence)
- FastAPI WebSocket docs: https://fastapi.tiangolo.com/advanced/websockets/ -- ConnectionManager pattern, WebSocket endpoint
- Watchdog GitHub: https://github.com/gorakhargosh/watchdog -- Observer API, FSEventsObserver on macOS
- watchdog asyncio gist: https://gist.github.com/mivade/f4cb26c282d421a62e8b9a341c7c65f6 -- `call_soon_threadsafe` bridge pattern
- Existing codebase: server/main.py, server/api/volumes.py, client/src/ui/volumeList.js -- integration points verified

### Secondary (MEDIUM confidence)
- Vite proxy WS config: https://vite.dev/config/server-options -- `ws: true` for WebSocket proxying
- FastAPI lifespan docs -- verified `on_event` is deprecated in favor of lifespan context manager

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - watchdog 6.0.0 verified installed, FastAPI WS is built-in, no new deps
- Architecture: HIGH - thread-to-asyncio bridge is well-documented pattern, ConnectionManager is from official FastAPI docs
- Pitfalls: HIGH - identified from codebase analysis (ID collision, partial writes, vite proxy, shutdown cleanup)

**Research date:** 2026-04-04
**Valid until:** 2026-05-04 (stable domain, no fast-moving deps)
