"""Tests for WatcherSuppressList: TTL expiry, thread safety, add/remove."""

from __future__ import annotations

import threading
import time

from server.watcher.suppress import WatcherSuppressList


def test_suppress_add_and_check():
    """Added path is suppressed."""
    sl = WatcherSuppressList(ttl=5.0)
    sl.add("/tmp/test.dcm")
    assert sl.should_suppress("/tmp/test.dcm") is True


def test_suppress_unknown_path():
    """Unknown path is not suppressed."""
    sl = WatcherSuppressList(ttl=5.0)
    assert sl.should_suppress("/tmp/unknown.dcm") is False


def test_suppress_expired():
    """Expired path is no longer suppressed."""
    sl = WatcherSuppressList(ttl=0.1)
    sl.add("/tmp/test.dcm")
    time.sleep(0.2)
    assert sl.should_suppress("/tmp/test.dcm") is False


def test_suppress_remove():
    """Explicitly removed path is no longer suppressed."""
    sl = WatcherSuppressList(ttl=5.0)
    sl.add("/tmp/test.dcm")
    sl.remove("/tmp/test.dcm")
    assert sl.should_suppress("/tmp/test.dcm") is False


def test_suppress_thread_safety():
    """Concurrent add/check from multiple threads does not crash."""
    sl = WatcherSuppressList(ttl=1.0)
    errors: list[Exception] = []

    def worker(thread_id: int) -> None:
        try:
            for i in range(100):
                path = f"/tmp/thread{thread_id}_file{i}.dcm"
                sl.add(path)
                sl.should_suppress(path)
                if i % 3 == 0:
                    sl.remove(path)
        except Exception as e:
            errors.append(e)

    threads = [threading.Thread(target=worker, args=(tid,)) for tid in range(8)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert errors == [], f"Thread safety errors: {errors}"
