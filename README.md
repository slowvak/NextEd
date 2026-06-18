# ΣIGMA — Segmentation & Image Guided Medical Annotation

**ΣIGMA** is a web-based medical image viewer and segmentation editor for researchers and radiologists. It supports DICOM and NIfTI volumes — no desktop install required.

---

## Features

- **Folder-based catalog** — point ΣIGMA at a folder and it discovers all volumes automatically (each volume typically maps to a CT or MRI series); relative path and DICOM series date/time are shown alongside each entry
- **4-panel viewer** — Axial, Coronal, Sagittal, and 3D views rendered side-by-side; the lower-right panel toggles between Oblique and 3D with the `3D`/`Obl` button
- **3D view** — marching cubes surface rendering (per segmentation label, via Web Worker) and ray-cast volume fog; switch modes with the `Vol`/`Surf` button; Ctrl-drag to adjust threshold range independently of the 2D window/level
- **Single-panel mode** — click `A`, `C`, or `S` in the corner of any panel to expand it; press `4` to return to the 4-panel layout
- **Synchronized crosshairs** — scroll the mouse wheel to move through slices; crosshairs update across all panels
- **Segmentation editing** — paint, erase, and label segmentation masks directly in the browser
- **Label management** — toggle per-label visibility (synced to the 3D view), hide labels with no data using **Hide Empty**, and assign colors per label
- **Built-in help** — click `?` in the toolbar for a full tool reference

---

## Quick Start (Docker)

The fastest way to run ΣIGMA with AI inference is with Docker Compose. Both the image server and the AI inference server (SigmaServer) start together and are pre-wired to talk to each other.

**Prerequisites:** [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker Engine + Compose v2)

```bash
# Clone both repos side-by-side (they must share the same parent directory)
git clone https://github.com/slowvak/SIGMA.git
git clone https://github.com/slowvak/SigmaServer.git

# From the Sigma directory, point DATA_DIR at your image folder and start
cd SIGMA
DATA_DIR=/path/to/your/images docker compose up --build
```

Then open **http://localhost:5275** in your browser.

| Service | Container port | What it does |
|---------|---------------|-------------|
| client | 5275 | Nginx — serves the UI and proxies `/api/` to the image server |
| sigma-server | 8060 | FastAPI — catalogs and serves medical volumes |
| sigmaserver | 8050 | FastAPI — AI inference (model weights loaded from `../SigmaServer/models/`) |

> **No GPU?** The AI inference service will run on CPU. Inference will be slow for large models but everything else works normally.

---

## Getting Started

### Prerequisites

- [uv](https://github.com/astral-sh/uv) — Python package manager
- [Node.js + npm](https://nodejs.org) — for the frontend build tool

### Installation

```bash
# 1. Clone the repo
git clone https://github.com/slowvak/SIGMA.git
cd SIGMA

# 2. Set up the Python environment
uv venv
cd server
uv sync
cd ..

# 3. Install frontend dependencies
cd client
npm install
cd ..
```

### Running

```bash
./start.sh
```

This starts both the FastAPI backend and the Vite dev server. Open your browser to the URL shown in the terminal output.

---

## Usage

1. Click **Open Folder** to select a directory — ΣIGMA will scan it for DICOM and NIfTI volumes
2. Select a volume from the list on the left panel to open it
3. Use the toolbar tools to adjust window/level, paint segmentations, and manage labels
4. Click **Back to Volumes** to return to the volume list

> Click `?` in the upper-right corner for a full description of all tools and keyboard shortcuts.
