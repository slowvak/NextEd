---
phase: 260504-fqg
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - server/main.py
autonomous: true
requirements:
  - QUICK-260504-fqg-01
must_haves:
  truths:
    - "When .sigma_cache.json exists and no scanned file is newer than the cache, _perform_scan loads volumes from the cache without calling _discover_all"
    - "When the cache is missing or any scanned file is newer than the cache, _perform_scan falls through to _discover_all and the existing key-based cache logic"
    - "Both _path_registry and _metadata_registry from server.api.volumes are cleared on every load path (fast path, key-based cache hit, fresh scan) so reloads do not retain stale entries"
    - "_catalog and _segmentation_catalog are cleared exactly once per _perform_scan, before any load path populates them"
    - "_cache_is_fresh handles OSError/PermissionError on individual paths without aborting the freshness check"
  artifacts:
    - path: "server/main.py"
      provides: "_cache_is_fresh helper and updated _perform_scan with mtime fast path"
      contains: "def _cache_is_fresh"
  key_links:
    - from: "_perform_scan"
      to: "_cache_is_fresh"
      via: "fast-path check before _discover_all"
      pattern: "_cache_is_fresh\\("
    - from: "_perform_scan fast path"
      to: "_load_from_cache"
      via: "direct JSON read of cached volumes when mtime check passes"
      pattern: "_load_from_cache\\("
    - from: "_perform_scan (all branches)"
      to: "server.api.volumes._path_registry / _metadata_registry"
      via: ".clear() called before each load"
      pattern: "_path_registry\\.clear|_metadata_registry\\.clear"
---

<objective>
Add an mtime-based cache fast path to `_perform_scan` in `server/main.py` so that, when nothing under the scan paths has been modified since the cache file was last written, startup skips the recursive filesystem traversal entirely and loads volumes directly from `.sigma_cache.json`.

Purpose: `_discover_all` currently traverses the full directory tree on every startup even when the cache is valid, which dominates startup time on large datasets. mtime comparison avoids the traversal in the steady-state.

Output: One helper (`_cache_is_fresh`) and a restructured `_perform_scan` body in `server/main.py`.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@server/main.py

<interfaces>
<!-- Functions in server/main.py the executor will call from the new fast path -->

```python
# Already defined in server/main.py:

_CACHE_FILENAME = ".sigma_cache.json"

def _load_from_cache(cached_volumes: list[dict]) -> tuple[
    list[VolumeMetadata],
    dict[str, list[SegmentationMetadata]],
    list[tuple[str, str, str]],
]:
    """Restore catalog from cached JSON entries (entry["volumes"] from cache file)."""
    ...

def _load_cache(cache_path: Path, expected_key: str) -> list[dict] | None:
    """Existing key-based loader. Reads JSON, validates 'key' field, returns
    cache['volumes'] on hit or None on miss."""
    ...

# Module-level globals mutated by _perform_scan:
_catalog: list[VolumeMetadata]
_segmentation_catalog: dict[str, list[SegmentationMetadata]]
_cache_path: Path | None  # set on every _perform_scan call

# From server.api.volumes (imported inside _perform_scan today):
_path_registry: dict       # vol_id -> (path, format)
_metadata_registry: dict   # vol_id -> VolumeMetadata
```

The fast path does NOT need key validation — mtime freshness is sufficient. It should
read the cache JSON directly and pass `cache.get("volumes", [])` to `_load_from_cache`.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add _cache_is_fresh helper and integrate mtime fast path into _perform_scan</name>
  <files>server/main.py</files>
  <action>
Implement two changes in `server/main.py`:

**A) Add `_cache_is_fresh` helper** (place it near `_load_cache`, before `_perform_scan`):

```python
def _cache_is_fresh(cache_path: Path, scan_paths: list[str]) -> bool:
    """Return True if cache_path exists and no file/dir under scan_paths is newer.

    Walks each scan path (file or directory tree) and compares mtime against
    the cache file's mtime. The cache file itself is skipped during traversal.
    OSError/PermissionError on individual entries is swallowed (that entry
    is treated as not-newer) so a single unreadable file does not force a rescan.
    """
    if not cache_path.exists():
        return False
    try:
        cache_mtime = cache_path.stat().st_mtime
    except OSError:
        return False

    for p in scan_paths:
        try:
            path = Path(p).expanduser().resolve()
        except OSError:
            continue
        if not path.exists():
            continue

        if path.is_file():
            try:
                if path.stat().st_mtime > cache_mtime:
                    return False
            except (OSError, PermissionError):
                continue
        elif path.is_dir():
            try:
                if path.stat().st_mtime > cache_mtime:
                    return False
            except (OSError, PermissionError):
                pass
            for item in path.rglob("*"):
                # Skip the cache file itself — writing it updates its own mtime
                try:
                    if item.resolve() == cache_path.resolve():
                        continue
                except OSError:
                    pass
                try:
                    if item.stat().st_mtime > cache_mtime:
                        return False
                except (OSError, PermissionError):
                    continue
    return True
```

**B) Restructure `_perform_scan`** so registry clearing happens up-front and an mtime fast path runs before `_discover_all`. Replace the existing `_perform_scan` body (everything after `_cache_path = cache_path`) with:

```python
    t0 = time.time()

    # Clear all catalogs/registries up front — every load path repopulates them.
    from server.api.volumes import _path_registry, _metadata_registry
    _catalog.clear()
    _segmentation_catalog.clear()
    _path_registry.clear()
    _metadata_registry.clear()

    # Fast path: cache exists and nothing under scan_paths is newer than the cache.
    # Skips _discover_all entirely.
    if paths and _cache_is_fresh(cache_path, paths):
        try:
            with open(cache_path) as f:
                cache = json.load(f)
            cached_volumes = cache.get("volumes", [])
            if cached_volumes:
                t1 = time.time()
                cat, seg_cat, _ = _load_from_cache(cached_volumes)
                _catalog.extend(cat)
                _segmentation_catalog.update(seg_cat)
                print(f"Cache up-to-date, loading {len(_catalog)} volume(s) (skipping scan) in {time.time() - t1:.2f}s")
                return len(_catalog)
        except Exception as e:
            print(f"Fast-path cache read failed ({e}), falling back to scan")
            # Fall through to full scan below. Re-clear in case partial load happened.
            _catalog.clear()
            _segmentation_catalog.clear()
            _path_registry.clear()
            _metadata_registry.clear()

    # Slow path: full discovery + key-based cache check
    print("Scanning for volumes...")
    entries = _discover_all(paths)

    if not entries:
        print("No volumes found in provided paths")
        return 0

    print(f"Discovered {len(entries)} volume(s) in {time.time() - t0:.1f}s")
    cache_key = _compute_cache_key(entries)
    cached = _load_cache(cache_path, cache_key)

    if cached is not None:
        print(f"Loading {len(cached)} volume(s) from cache...")
        t1 = time.time()
        cat, seg_cat, _ = _load_from_cache(cached)
        _catalog.extend(cat)
        _segmentation_catalog.update(seg_cat)
        print(f"Loaded {len(_catalog)} volume(s) from cache in {time.time() - t1:.2f}s")
    else:
        print("Registering volumes...")
        t1 = time.time()
        cat, seg_cat, path_reg = _register_entries(entries)
        _catalog.extend(cat)
        _segmentation_catalog.update(seg_cat)
        print(f"Registered {len(_catalog)} volume(s) in {time.time() - t1:.1f}s")
        _save_cache(cache_path, cache_key, _catalog, _segmentation_catalog, path_reg)

    return len(_catalog)
```

Notes about the changes vs the original code:
- `_catalog.clear()` and `_segmentation_catalog.clear()` now happen BEFORE any load path (was after `_discover_all`).
- `_path_registry.clear()` / `_metadata_registry.clear()` now happen on ALL load paths (was only the fresh-scan branch).
- The `print("Scanning for volumes...")` line moves below the fast-path so the fast path's "Cache up-to-date..." message is the only one printed when it fires.
- Use `cache.get("volumes", [])` directly — no key validation in the fast path, since mtime freshness already proves the cache matches the on-disk state. If the cache JSON has no volumes (unlikely), fall through to the slow path so a normal scan happens.
- Inner `except` re-clears registries to defend against a partially populated state if `_load_from_cache` raised mid-loop.

Do NOT introduce any new imports beyond what's already at the top of the file (`Path`, `time`, `json` are all imported). The `from server.api.volumes import ...` line stays inside `_perform_scan` for consistency with existing style.
  </action>
  <verify>
    <automated>cd /Users/bje/repos/Sigma && uv run python -c "
import time, json, tempfile, os
from pathlib import Path
from server import main as m

# Create a temp scan dir with one .nii.gz placeholder file (header read will fail, that's fine —
# we are testing the cache fast-path mechanics, not nibabel parsing)
with tempfile.TemporaryDirectory() as td:
    td_path = Path(td)
    cache_file = td_path / m._CACHE_FILENAME

    # 1) No cache → not fresh
    assert m._cache_is_fresh(cache_file, [str(td_path)]) is False, 'missing cache should be stale'

    # 2) Cache exists, no files newer → fresh
    cache_file.write_text(json.dumps({'key': 'x', 'volumes': []}))
    time.sleep(0.05)
    assert m._cache_is_fresh(cache_file, [str(td_path)]) is True, 'cache with no newer files should be fresh'

    # 3) Touch a new file under scan path → stale
    new_file = td_path / 'foo.nii'
    new_file.write_bytes(b'')
    # Force mtime newer than cache
    future = time.time() + 10
    os.utime(new_file, (future, future))
    assert m._cache_is_fresh(cache_file, [str(td_path)]) is False, 'newer file should make cache stale'

    # 4) Cache file's own mtime should not invalidate itself
    os.utime(new_file, (cache_file.stat().st_mtime - 5, cache_file.stat().st_mtime - 5))
    assert m._cache_is_fresh(cache_file, [str(td_path)]) is True, 'cache should ignore itself in traversal'

print('OK: _cache_is_fresh behaviour correct')
print('OK: server.main imports cleanly with new code')
"</automated>
  </verify>
  <done>
    - `_cache_is_fresh(cache_path, scan_paths)` exists in `server/main.py` and returns False when cache missing, True when no scanned file is newer, False when any scanned file is newer, and ignores the cache file itself during traversal.
    - `_perform_scan` clears `_catalog`, `_segmentation_catalog`, `_path_registry`, and `_metadata_registry` before any load path populates them.
    - When `_cache_is_fresh` is True and cache JSON parses, `_perform_scan` loads volumes via `_load_from_cache` and returns without invoking `_discover_all`. The console prints `Cache up-to-date, loading N volume(s) (skipping scan)`.
    - When the fast-path check fails (missing/stale/unreadable cache), behaviour matches the original implementation: `_discover_all` runs, `_compute_cache_key` is computed, `_load_cache` is consulted, and on key-cache miss `_register_entries` + `_save_cache` run.
    - `server.main` imports cleanly and the verification snippet's four assertions all pass.
  </done>
</task>

</tasks>

<verification>
- `uv run python -c "import server.main"` succeeds (no syntax errors, no missing names).
- The verify snippet above passes all four `_cache_is_fresh` assertions.
- Manual smoke test (optional, not blocking): start the server twice in a row against a directory that already has `.sigma_cache.json`; the second start prints `Cache up-to-date, loading N volume(s) (skipping scan)` and shows no `Scanning for volumes...` line.
</verification>

<success_criteria>
- `server/main.py` defines `_cache_is_fresh` and `_perform_scan` invokes it before `_discover_all`.
- All five "truths" listed in `must_haves` are observable in the file: registry clearing is unified up-front, fast path returns early, fallback path is unchanged, errors don't abort freshness check.
- Verify command exits 0.
</success_criteria>

<output>
After completion, create `.planning/quick/260504-fqg-add-mtime-based-cache-fast-path-to-perfo/260504-fqg-SUMMARY.md`
</output>
