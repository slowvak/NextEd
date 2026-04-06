"""Thread-safe suppress list for the file watcher.

Prevents the watcher from re-detecting files that the server itself
just wrote (e.g., DICOM-SEG files from the save endpoint).
"""

from __future__ import annotations

import threading
import time


class WatcherSuppressList:
    """Thread-safe set of paths the watcher should ignore temporarily.

    Used by the save endpoint to prevent the watcher from re-detecting
    DICOM-SEG files that the server itself just wrote.
    """

    def __init__(self, ttl: float = 5.0):
        self._paths: dict[str, float] = {}  # path -> expiry timestamp
        self._lock = threading.Lock()
        self._ttl = ttl

    def add(self, path: str) -> None:
        """Add a path to suppress. It will auto-expire after TTL seconds."""
        with self._lock:
            self._paths[path] = time.monotonic() + self._ttl

    def should_suppress(self, path: str) -> bool:
        """Check if a path should be suppressed. Cleans up expired entries."""
        with self._lock:
            expiry = self._paths.get(path)
            if expiry is None:
                return False
            if time.monotonic() > expiry:
                del self._paths[path]
                return False
            return True

    def remove(self, path: str) -> None:
        """Explicitly remove a path from the suppress list."""
        with self._lock:
            self._paths.pop(path, None)
