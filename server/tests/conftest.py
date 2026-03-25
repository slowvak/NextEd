"""Shared test fixtures for server tests."""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

# Ensure server package is importable from tests
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))
