from fastapi import APIRouter, HTTPException, Request
import json
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
        "Bone": {"center": 500, "width": 3000},
        "Lung": {"center": -500, "width": 1000},
        "Abd": {"center": 125, "width": 450}
    },
    "default_labels": {
        "1": "Label 1",
        "2": "Label 2",
        "3": "Label 3",
        "4": "Label 4",
        "5": "Label 5"
    },
    "ai": {
        "server": "http://localhost:8080",
        "models": [
            {
                "id": "totalsegmentator",
                "name": "TotalSegmentator",
                "description": "104-structure CT segmentation (fast mode)",
                "modality": ["CT"],
                "endpoint": "/predict",
                "weights": "totalsegmentator_v2",
                "accepts_labels": False,
                "labels": []
            },
            {
                "id": "refine-seg",
                "name": "Refine Segmentation",
                "description": "Refines existing label boundaries using image features",
                "modality": [],
                "endpoint": "/predict",
                "weights": "refine_v1",
                "accepts_labels": True,
                "labels": []
            }
        ]
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
