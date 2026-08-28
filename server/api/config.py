# Copyright Bradley J Erickson, 2026.
from fastapi import APIRouter, HTTPException, Request
import json
import os
from pathlib import Path
from pydantic import BaseModel
from typing import Dict, List, Any

router = APIRouter(prefix="/api/v1/config", tags=["config"])

# Path resolves to: server/api/config.py -> parent -> parent -> parent == root
_CONFIG_PATH = Path(__file__).resolve().parent.parent.parent / "config.json"

DEFAULT_CONFIG = {
    "source_directory": "",
    "window_level_presets": {
        "Brain": {"center": 40, "width": 80},
        "Bone": {"center": 500, "width": 2000},
        "Lung": {"center": -600, "width": 1500},
        "Abd": {"center": 40, "width": 400}
    },
    "default_labels": {
        "1": "Label 1",
        "2": "Label 2",
        "3": "Label 3",
        "4": "Label 4",
        "5": "Label 5"
    },
    "ai": {
        "server": "http://localhost:8050",
        "models": []
    },
    "filters": {
        "kernel_2d": "3x3",
        "kernel_3d": "3x3x3",
        "refine_search_size": 5
    }
}

def get_config_data() -> dict:
    if not _CONFIG_PATH.exists():
        # Initialize default config file
        with open(_CONFIG_PATH, "w") as f:
            json.dump(DEFAULT_CONFIG, f, indent=2)
        return DEFAULT_CONFIG
    
    try:
        with open(_CONFIG_PATH, "r") as f:
            data = json.load(f)
            # Merge with default config to ensure all keys exist
            merged = DEFAULT_CONFIG.copy()
            merged.update(data)
            return merged
    except Exception as e:
        print(f"Error reading config: {e}")
        return DEFAULT_CONFIG

def set_config_data(new_config: dict):
    with open(_CONFIG_PATH, "w") as f:
        json.dump(new_config, f, indent=2)

@router.get("")
async def get_config():
    return get_config_data()

@router.put("")
async def update_config(request: Request):
    new_config = await request.json()
    set_config_data(new_config)
    return {"status": "success"}


# The old /browse-folder endpoint shelled out to osascript (and fell back to
# tkinter) to pop a native folder dialog. That only ever worked while this
# server ran as a host process on the user's own Mac; containerized there is no
# osascript, no display and no tkinter, so it returned "" and the UI's Browse
# button did nothing. A server-side listing works in both cases and over a
# network besides.

# Browsing is confined to this root. The compose file sets it to the same host
# directory it mounts; the default keeps a bare `python main.py` run usable.
_BROWSE_ROOT = Path(os.getenv("BROWSE_ROOT", str(Path.home()))).resolve()


@router.get("/list-dir")
async def list_dir(path: str | None = None):
    """List the subdirectories of `path`, for the folder picker.

    `path` arrives straight from the browser, so it is resolved and then
    required to sit inside _BROWSE_ROOT — otherwise any caller could walk the
    whole filesystem. Symlinks resolve before the check, so one pointing out of
    the root is rejected too.
    """
    target = Path(path).resolve() if path else _BROWSE_ROOT
    if target != _BROWSE_ROOT and _BROWSE_ROOT not in target.parents:
        raise HTTPException(status_code=403, detail=f"Path is outside {_BROWSE_ROOT}")
    if not target.is_dir():
        raise HTTPException(status_code=404, detail="Not a directory")
    try:
        dirs = sorted(
            (p.name for p in target.iterdir() if p.is_dir() and not p.name.startswith(".")),
            key=str.lower,
        )
    except PermissionError:
        raise HTTPException(status_code=403, detail="Permission denied")
    return {
        "path": str(target),
        "parent": str(target.parent) if target != _BROWSE_ROOT else None,
        "root": str(_BROWSE_ROOT),
        "dirs": dirs,
    }
