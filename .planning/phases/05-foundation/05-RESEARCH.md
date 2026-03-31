# Phase 5: Foundation - Research

**Researched:** 2026-03-30
**Domain:** FastAPI API versioning, DICOM catalog enrichment, loader refactoring
**Confidence:** HIGH

## Summary

Phase 5 is a low-risk refactoring phase that prepares the server for v2.0 features. It involves three changes: (1) moving all API endpoints under `/api/v1/` prefix, (2) adding `study_instance_uid` and `series_instance_uid` fields to the DICOM volume list response, and (3) retaining DICOM file paths in the server catalog for downstream WADO-RS and DICOM-SEG features.

The existing codebase already groups DICOM files by `SeriesInstanceUID` during discovery and stores file paths as a JSON-encoded list in `VolumeMetadata.path`. The changes are additive -- no existing functionality is removed, and no new dependencies are needed. The primary risk is the API URL migration breaking the client if not coordinated.

**Primary recommendation:** Use FastAPI's `APIRouter(prefix=...)` to move all routes under `/api/v1/`, update `api.js` and hardcoded fetch calls in `main.js` simultaneously, and add UID fields to `VolumeMetadata` and the DICOM discovery pipeline.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| API-01 | All server endpoints versioned under /api/v1/ prefix | Router prefix change in volumes.py, segmentations.py, and main.py inline routes. Client API_BASE update. See Architecture Patterns. |
| API-02 | DICOM loader retains file paths for downstream WADO-RS and DICOM-SEG | Current loader already passes file paths through discovery; need to store them explicitly on VolumeMetadata or in a parallel registry. See Architecture Patterns. |
| API-03 | Volume list includes study_instance_uid and series_instance_uid for DICOM volumes | Add fields to VolumeMetadata model; populate from discover_dicom_series which already reads SeriesInstanceUID. Need to also read StudyInstanceUID. See Architecture Patterns. |
</phase_requirements>

## Project Constraints (from CLAUDE.md)

- **Tech stack (server):** Python with FastAPI -- required
- **Tech stack (client):** Vanilla JavaScript, no framework
- **Package management:** uv (not pip) for Python environment
- **Data locality:** Server runs locally alongside data
- **Performance:** Full volume in browser memory; client-side slice rendering
- **Build tool:** Vite for client
- **No new dependencies needed for this phase**

## Standard Stack

### Core (no changes from v1.0)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| FastAPI | >=0.115 | HTTP API framework | Already in use; APIRouter prefix is the versioning mechanism |
| Pydantic | (bundled with FastAPI) | Data models | VolumeMetadata model gets new Optional fields |
| pydicom | >=2.4 | DICOM tag reading | Already used in discover_dicom_series; need StudyInstanceUID extraction |

### No New Dependencies

This phase adds no new packages. All changes use existing FastAPI routing and Pydantic model features.

## Architecture Patterns

### Current API Route Layout

```
main.py:
  @app.get("/api/volumes")          -- inline, volume list
  @app.get("/api/volumes/{id}/labels")  -- inline, label CRUD
  @app.put("/api/volumes/{id}/labels")  -- inline, label CRUD

api/volumes.py:
  router = APIRouter(prefix="/api/volumes")
  GET  /{volume_id}/metadata
  GET  /{volume_id}/data

api/segmentations.py:
  router = APIRouter(prefix="/api")
  GET  /volumes/{volume_id}/segmentations
  POST /volumes/{volume_id}/segmentations
  GET  /segmentations/{seg_id}/data

client/src/main.js:
  Hardcoded: /api/volumes/{id}/labels  (lines 87, 121)
  Hardcoded: /api/volumes/{id}/segmentations (line 295)

client/src/api.js:
  const API_BASE = '/api'
  GET ${API_BASE}/volumes
  GET ${API_BASE}/volumes/${id}/metadata
  GET ${API_BASE}/volumes/${id}/data
```

### Pattern 1: API Versioning via Router Prefix

**What:** Change all route prefixes from `/api/` to `/api/v1/`.
**How:**

```python
# api/volumes.py -- change prefix
router = APIRouter(prefix="/api/v1/volumes", tags=["volumes"])

# api/segmentations.py -- change prefix
router = APIRouter(prefix="/api/v1", tags=["segmentations"])

# main.py -- move inline routes to use /api/v1/ prefix
@app.get("/api/v1/volumes", response_model=list[VolumeMetadata])
async def list_volumes():
    return _catalog

@app.get("/api/v1/volumes/{volume_id}/labels")
# ...
@app.put("/api/v1/volumes/{volume_id}/labels")
# ...
```

**Alternative approach -- cleaner:** Move the inline routes from `main.py` into the volumes router or a dedicated router. This avoids scattering route definitions and makes the version prefix a single-point change. However, the inline routes in `main.py` reference `_catalog` and `_segmentation_catalog` directly, which would require dependency injection or module-level imports to access from a router module.

**Recommended approach:** Keep it simple -- just update the prefix strings. Moving routes to routers is a bigger refactor that can happen later.

### Pattern 2: VolumeMetadata Model Extension

**What:** Add optional fields for DICOM UIDs and file paths.

```python
class VolumeMetadata(BaseModel):
    # ... existing fields ...
    study_instance_uid: str | None = None
    series_instance_uid: str | None = None
    dicom_file_paths: list[str] | None = None  # internal use, excluded from JSON response
```

**Key decision -- exposing file paths in API response:** The `dicom_file_paths` field is for internal server use (WADO-RS, DICOM-SEG). It should NOT appear in the volume list JSON response sent to the client (exposes server filesystem paths). Options:

1. **Separate internal registry** (recommended): Keep file paths in `_path_registry` (already exists in `api/volumes.py`). For DICOM volumes, the path is already a JSON-encoded list of files. No model change needed for file path retention -- it is already retained.
2. **Pydantic `Field(exclude=True)`**: Add to model but exclude from serialization. Works but mixes internal and API concerns.

**Current state analysis:** The `_path_registry` in `api/volumes.py` already stores `(path, format)` per volume. For DICOM volumes, `path` is `json.dumps(s["files"])` -- a JSON string containing all file paths. File paths are already retained. API-02 may already be satisfied by existing code; the requirement is to make this explicit and verifiable.

### Pattern 3: DICOM UID Extraction in Discovery

**What:** Read `StudyInstanceUID` alongside `SeriesInstanceUID` during discovery and propagate to VolumeMetadata.

```python
# In discover_dicom_series():
study_uid = str(getattr(ds, "StudyInstanceUID", "")).strip()

series_map[uid] = {
    "series_uid": uid,
    "study_uid": study_uid,  # NEW
    # ... existing fields ...
}
```

The `series_uid` is already extracted (used as the grouping key). `StudyInstanceUID` needs to be read from the DICOM header -- it is a standard tag present in virtually all DICOM files. The value is the same for all files in a study, so reading it from the first file of each series is sufficient.

### Pattern 4: Client API Migration

**What:** Update all client-side API URLs from `/api/` to `/api/v1/`.

```javascript
// api.js -- single change
const API_BASE = '/api/v1';

// main.js -- hardcoded URLs (3 locations)
// Line ~87:  /api/volumes/${volume.id}/labels
// Line ~121: /api/volumes/${volume.id}/labels
// Line ~295: /api/volumes/${volume.id}/segmentations
// Change all to: /api/v1/volumes/...
```

**Vite proxy:** The `vite.config.js` proxies `/api` to `localhost:8000`. Since `/api/v1/` starts with `/api`, the proxy will continue to work without changes.

### Anti-Patterns to Avoid

- **Separate versioned app mounts:** Don't create `v1_app = FastAPI()` and mount it as a sub-application. This breaks middleware, lifespan, and shared state. Just change router prefixes.
- **Keeping old routes alive alongside new ones:** The requirements say "old unversioned paths return 404 or redirect." Don't maintain dual routing -- just change the prefixes. The old paths will 404 naturally.
- **Storing pydicom Datasets in memory:** Don't keep loaded Datasets in the catalog for file path retention. They are large and rarely needed. File paths (strings) are sufficient.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| API versioning | Custom URL rewriting middleware | FastAPI APIRouter prefix parameter | Built-in, zero overhead, well-documented |
| Optional model fields | Custom serialization logic | Pydantic `Optional[str] = None` | Standard Pydantic pattern |

## Common Pitfalls

### Pitfall 1: Forgetting Hardcoded URLs in main.js

**What goes wrong:** The `api.js` module uses `API_BASE` which is easy to update, but `main.js` has 3 hardcoded `/api/volumes/...` fetch calls that bypass `API_BASE`. Missing these causes 404 errors for labels and segmentation save.
**Why it happens:** main.js grew organically; not all fetch calls were routed through api.js.
**How to avoid:** Search for all `/api/` occurrences in client source. Update every one. Consider moving stray fetch calls into api.js functions.
**Warning signs:** Labels not loading, segmentation save failing after API prefix change.

### Pitfall 2: Cache File Compatibility

**What goes wrong:** The `.nexted_cache.json` file stores serialized VolumeMetadata. Adding new fields (`study_instance_uid`, `series_instance_uid`) to the model means old cache files won't have these fields. If the code expects them, deserialization could fail.
**Why it happens:** Pydantic strict mode or missing defaults.
**How to avoid:** New fields MUST have `None` as default. Pydantic will fill missing fields with defaults when loading old cache. Verify `_load_from_cache` handles the new fields gracefully.
**Warning signs:** Server crash on startup with existing cache file.

### Pitfall 3: Volume List Endpoint Location

**What goes wrong:** The `GET /api/volumes` endpoint is defined inline in `main.py`, not in the volumes router. It is easy to forget this route when updating prefixes, since it is not in `api/volumes.py`.
**Why it happens:** The route was placed in main.py because it directly references `_catalog`.
**How to avoid:** Inventory ALL route definitions before making prefix changes. There are routes in 3 places: `main.py` (3 routes), `api/volumes.py` (2 routes), `api/segmentations.py` (3 routes).
**Warning signs:** Volume list loads at old URL but metadata/data endpoints 404.

### Pitfall 4: DICOM File Path Already Retained

**What goes wrong:** Developer builds an elaborate file path storage mechanism, not realizing file paths are already stored in `_path_registry` as a JSON-encoded list.
**Why it happens:** The requirement says "retain file paths" which implies they are currently lost. In reality, they are stored but in a non-obvious format (JSON string in the `path` field).
**How to avoid:** Verify current behavior first. The `_path_registry` already has what is needed. The task is to make this explicit and verifiable (e.g., via a debug endpoint), not to rebuild storage.

## Code Examples

### Complete Route Inventory (all 8 endpoints to update)

```
# main.py (3 inline routes):
GET  /api/volumes                          -> /api/v1/volumes
GET  /api/volumes/{volume_id}/labels       -> /api/v1/volumes/{volume_id}/labels
PUT  /api/volumes/{volume_id}/labels       -> /api/v1/volumes/{volume_id}/labels

# api/volumes.py (2 routes via router with prefix="/api/volumes"):
GET  /api/volumes/{volume_id}/metadata     -> /api/v1/volumes/{volume_id}/metadata
GET  /api/volumes/{volume_id}/data         -> /api/v1/volumes/{volume_id}/data

# api/segmentations.py (3 routes via router with prefix="/api"):
GET  /api/volumes/{volume_id}/segmentations     -> /api/v1/volumes/{volume_id}/segmentations
POST /api/volumes/{volume_id}/segmentations     -> /api/v1/volumes/{volume_id}/segmentations
GET  /api/segmentations/{seg_id}/data           -> /api/v1/segmentations/{seg_id}/data
```

### VolumeMetadata with New Fields

```python
class VolumeMetadata(BaseModel):
    id: str
    name: str
    path: str
    format: str
    dimensions: list[int] | None = None
    voxel_spacing: list[float] | None = None
    dtype: str | None = None
    modality: str | None = None
    window_center: float | None = None
    window_width: float | None = None
    data_min: float | None = None
    data_max: float | None = None
    # v2.0 additions
    study_instance_uid: str | None = None
    series_instance_uid: str | None = None
```

### discover_dicom_series UID Extraction

```python
# In discover_dicom_series(), inside the series_map creation block:
study_uid = str(getattr(ds, "StudyInstanceUID", "")).strip()

series_map[uid] = {
    "series_uid": uid,
    "study_uid": study_uid,   # ADD THIS
    "name": name,
    "files": [],
    # ... rest unchanged
}

# In _discover_dicom_series() in main.py, propagate to entry dict:
entries.append({
    "name": s["name"],
    "path": json.dumps(s["files"]),
    "format": "dicom_series",
    "dimensions": s["dimensions"],
    "voxel_spacing": s["voxel_spacing"],
    "dtype": "float32",
    "modality": s.get("modality", "unknown"),
    "study_instance_uid": s.get("study_uid"),       # ADD
    "series_instance_uid": s.get("series_uid"),      # ADD
})

# In _register_entries(), propagate to VolumeMetadata:
meta = VolumeMetadata(
    # ... existing fields ...
    study_instance_uid=entry.get("study_instance_uid"),
    series_instance_uid=entry.get("series_instance_uid"),
)
```

### Debug Endpoint for File Path Verification (API-02)

```python
@app.get("/api/v1/debug/volumes/{volume_id}/paths")
async def debug_volume_paths(volume_id: str):
    """Debug endpoint to verify DICOM file paths are retained."""
    from server.api.volumes import _path_registry
    if volume_id not in _path_registry:
        raise HTTPException(status_code=404)
    path, fmt = _path_registry[volume_id]
    if fmt == "dicom_series":
        return {"format": fmt, "file_count": len(json.loads(path)), "files": json.loads(path)}
    return {"format": fmt, "path": path}
```

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | pytest >=8.0 |
| Config file | None (default discovery, conftest.py in server/tests/) |
| Quick run command | `cd server && uv run pytest tests/ -x -q` |
| Full suite command | `cd server && uv run pytest tests/ -v` |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| API-01 | All endpoints respond under /api/v1/ prefix | integration | `cd server && uv run pytest tests/test_api_versioning.py -x` | No -- Wave 0 |
| API-01 | Old /api/ paths return 404 | integration | `cd server && uv run pytest tests/test_api_versioning.py::test_old_paths_404 -x` | No -- Wave 0 |
| API-02 | DICOM file paths retained in registry | unit | `cd server && uv run pytest tests/test_dicom_paths.py -x` | No -- Wave 0 |
| API-03 | Volume list includes study/series UIDs for DICOM | unit | `cd server && uv run pytest tests/test_dicom_uids.py -x` | No -- Wave 0 |

### Sampling Rate

- **Per task commit:** `cd server && uv run pytest tests/ -x -q`
- **Per wave merge:** `cd server && uv run pytest tests/ -v`
- **Phase gate:** Full suite green before verify

### Wave 0 Gaps

- [ ] `server/tests/test_api_versioning.py` -- covers API-01 (TestClient checks for /api/v1/ routes and /api/ 404s)
- [ ] `server/tests/test_dicom_paths.py` -- covers API-02 (verify _path_registry retains DICOM file lists)
- [ ] `server/tests/test_dicom_uids.py` -- covers API-03 (verify VolumeMetadata has study/series UIDs)

Note: Integration tests for API-01 require FastAPI TestClient which needs the app importable. The existing conftest.py sets up sys.path correctly.

## Open Questions

1. **Should inline routes in main.py be moved to routers?**
   - What we know: 3 routes in main.py reference `_catalog` and `_segmentation_catalog` directly. Moving them requires circular import handling or dependency injection.
   - What's unclear: Whether the planner should scope this refactor into Phase 5 or defer.
   - Recommendation: Keep routes in main.py for Phase 5 (just update prefixes). Router consolidation can happen in a future cleanup.

2. **Should `path` field be excluded from volume list JSON response?**
   - What we know: `VolumeMetadata.path` is currently serialized to the client. For DICOM volumes it contains a JSON-encoded file list (server filesystem paths). This is a minor information leak.
   - What's unclear: Whether the client uses `path` for anything.
   - Recommendation: Defer -- not in Phase 5 requirements. Flag for future cleanup.

## Sources

### Primary (HIGH confidence)
- Existing codebase analysis (all server and client files read directly)
- FastAPI documentation on APIRouter prefix (training data, stable API)
- Pydantic Optional field defaults (training data, stable API)

### Secondary (MEDIUM confidence)
- .planning/research/ARCHITECTURE.md -- v2.0 architecture design
- .planning/research/PITFALLS.md -- known pitfalls catalog
- .planning/research/SUMMARY.md -- v2.0 research summary

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new dependencies, well-understood FastAPI patterns
- Architecture: HIGH -- all code read, changes are mechanical prefix updates + model field additions
- Pitfalls: HIGH -- identified from codebase inspection (hardcoded URLs, cache compat, route inventory)

**Research date:** 2026-03-30
**Valid until:** 2026-04-30 (stable domain, no external dependency changes)
