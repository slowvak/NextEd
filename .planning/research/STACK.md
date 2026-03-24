# Technology Stack

**Project:** NextEd - Web-Based Medical Image Viewer/Editor
**Researched:** 2026-03-24
**Overall confidence:** MEDIUM (versions from training data, not live-verified -- verify with `uv pip install` / `npm info` before pinning)

## Recommended Stack

### Backend: Python Server

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Python | >=3.11 | Runtime | 3.11+ for performance gains (faster startup, cheaper exceptions). 3.12 fine too. | HIGH |
| FastAPI | >=0.115 | HTTP API framework | Project requirement. Async by default, auto OpenAPI docs, excellent for streaming binary data. | HIGH |
| uvicorn | >=0.30 | ASGI server | Standard production server for FastAPI. Use `--reload` in dev. | HIGH |
| pydicom | >=2.4 | DICOM file I/O | The only serious Python DICOM library. Reads pixel data, tags, series grouping. | HIGH |
| nibabel | >=5.2 | NIfTI file I/O | Standard Python NIfTI reader. Loads .nii and .nii.gz, exposes header metadata (affine, voxel spacing). | HIGH |
| numpy | >=1.26 | Array operations | Backbone for all voxel data manipulation. Required by pydicom and nibabel anyway. | HIGH |
| scikit-image | >=0.22 | Image processing algorithms | Otsu thresholding (`skimage.filters.threshold_otsu`), region growing, morphological ops. Mature, well-tested. | HIGH |
| scipy | >=1.12 | Scientific computing | `scipy.ndimage` for connected-component labeling in region grow. Flood fill via `scipy.ndimage.label`. | HIGH |
| python-multipart | >=0.0.9 | Form data parsing | Required by FastAPI for file upload endpoints (Save As). | HIGH |
| highdicom | >=0.23 | DICOM-SEG writing | For saving segmentation as DICOM-SEG format. Only needed if DICOM-SEG export is implemented. | MEDIUM |
| uv | latest | Package management | Project requirement (not pip). | HIGH |

### Frontend: JavaScript Client

| Technology | Version | Purpose | Why | Confidence |
|------------|---------|---------|-----|------------|
| Vanilla JS + HTML5 Canvas | ES2022+ | Core rendering | **No framework.** This is a pixel-pushing application, not a CRUD app. React/Vue add overhead and fight you on canvas. Direct DOM + Canvas 2D API gives full control over pixel rendering, compositing, and mouse events. | HIGH |
| Vite | >=5.0 | Build tool / dev server | Fast HMR, ES module native, zero-config for vanilla JS. Proxy API requests to FastAPI in dev. | HIGH |
| pako | >=2.1 | Gzip decompression | Decompress .nii.gz data client-side if serving raw compressed volumes. Small, fast, no dependencies. | MEDIUM |

### Why NOT These Alternatives

| Technology | Why Not |
|------------|---------|
| **React / Vue / Svelte** | This app is 90% canvas pixel manipulation. Frameworks add complexity for DOM management you barely need. The viewer panels, sliders, and tool panel are simple enough for vanilla JS. Frameworks fight canvas -- they want to own the DOM, but your rendering loop owns the canvas. |
| **Cornerstone.js / OHIF** | Cornerstone is a full DICOM viewer framework with its own loader pipeline, metadata system, and rendering engine. It is designed for DICOM-web servers, not custom FastAPI backends serving raw volumes. Adopting it means conforming to its architecture, which conflicts with the "full volume in browser memory, render slices client-side" design. You would spend more time fighting Cornerstone's abstractions than building your own slice renderer (which is ~50 lines of Canvas 2D code). |
| **Three.js / WebGL** | Overkill for 2D slice rendering. WebGL adds GPU shader complexity for no benefit when you are drawing 2D slices with Canvas 2D `putImageData`. WebGL matters for 3D volume rendering, which is explicitly out of scope. |
| **nifti-reader-js** | Small library for parsing NIfTI headers in JS. Unnecessary here because the server parses NIfTI with nibabel and serves raw volume data as binary ArrayBuffer. The client does not need to parse NIfTI format -- it receives pre-processed voxel arrays. |
| **ITK-wasm** | WebAssembly build of ITK for browser-side image processing. Heavy (~10MB+ WASM), complex build pipeline. Your processing (Otsu, region grow) happens server-side in Python where scipy/scikit-image already excel. |
| **Papaya / BrainBrowser** | Legacy academic viewers, unmaintained. Not suitable as dependencies. |
| **Django** | Heavier than FastAPI, synchronous by default, ORM unnecessary for this file-based app. |
| **Flask** | No async, no auto-docs, no streaming response helpers. FastAPI is strictly better here. |
| **pip** | Project constraint: use uv. |

## Architecture: Why Vanilla JS for the Client

This deserves extra rationale because "no framework" is a strong recommendation.

**The application has two distinct UI zones:**

1. **Control UI** (volume list, tool panel, sliders, labels) -- Simple DOM elements. A framework helps here but vanilla JS handles it fine with ~200 lines of DOM manipulation.

2. **Viewer canvases** (the 4-panel display, segmentation overlay, painting) -- This is 80% of the application complexity. It involves:
   - Rendering slices from a typed array (`Float32Array` / `Int16Array`) to `ImageData` via window/level transform
   - Compositing segmentation overlay with alpha blending
   - Handling mouse events for painting, erasing, ROI drawing, window/level adjustment
   - Managing undo history as typed array snapshots

Frameworks add indirection between your code and the canvas. Every mouse event goes through synthetic event systems. State management libraries add overhead to what is fundamentally an imperative pixel loop. The canonical approach for medical image viewers in the browser is direct canvas manipulation.

**If the control UI becomes complex enough to want a framework later**, you can incrementally adopt one (e.g., mount a small Svelte component for the label editor). But start vanilla.

## Data Transfer Architecture

### Volume Transfer: Server to Client

The server should send volume data as raw binary `ArrayBuffer` over HTTP, not JSON-encoded arrays.

```
GET /api/volumes/{id}/data
Response: application/octet-stream
  - Header bytes: dtype (1 byte), ndim (1 byte), shape (3x uint32)
  - Payload: raw voxel data as typed array
```

**Why:** A 512x512x400 float32 volume is ~400MB. JSON encoding would balloon this. Raw binary transfer + `ArrayBuffer` on the client is the only viable approach.

**Compression:** Use HTTP gzip (`Content-Encoding: gzip`) for transfer compression. FastAPI + uvicorn handle this via `GZipMiddleware`. The client's `fetch()` decompresses automatically. This is simpler than manual pako decompression.

### Slice Rendering: Client-Side

```
1. Volume lives in Float32Array/Int16Array in browser memory
2. On slice change: extract 2D slice from 3D array (index math, not copy)
3. Apply window/level transform: pixel -> 0-255 grayscale
4. Write to ImageData via Uint8ClampedArray
5. ctx.putImageData() to canvas
6. If segmentation loaded: composite overlay with globalAlpha
```

This entire pipeline is ~50 lines of JS and runs in <5ms per slice on modern hardware.

## Client-Side File Organization

```
client/
  index.html              # Entry point
  src/
    main.js               # App initialization, API client
    viewer/
      ViewerPanel.js      # Single canvas panel (slice rendering, mouse events)
      FourPanelLayout.js  # 4-panel / single-panel layout manager
      windowLevel.js      # W/L transform, presets, ctrl+drag handler
    segmentation/
      overlay.js          # Segmentation overlay compositing
      labels.js           # Label management (colors, names, values)
      undo.js             # 3-level undo stack (typed array snapshots)
    tools/
      paintbrush.js       # Paint tool with multi-slice support
      eraser.js           # Right-click eraser (shares paintbrush logic)
      rectangle.js        # Rectangle ROI + shift-Otsu
      oval.js             # Oval ROI + shift-Otsu
      regionGrow.js       # Region grow (delegates to server API)
    ui/
      volumeList.js       # Volume browser panel
      toolPanel.js        # Left-side tool controls
      sliders.js          # Slice navigation, transparency, pixel range
      dialogs.js          # Segmentation file picker, save-as
    utils/
      arrayOps.js         # Typed array slice extraction, reshape
      colormap.js         # Label color generation
  vite.config.js          # Dev proxy to FastAPI
```

## Server-Side File Organization

```
server/
  main.py                 # FastAPI app, startup catalog
  catalog/
    scanner.py            # Walk folder tree, identify NIfTI/DICOM files
    models.py             # Pydantic models for volume metadata
    dicom_grouper.py      # Group DICOM files by series_instance_uid
  loaders/
    nifti_loader.py       # Load NIfTI volume + header with nibabel
    dicom_loader.py       # Assemble DICOM series into volume with pydicom
  processing/
    otsu.py               # Otsu threshold within ROI
    region_grow.py        # Seeded region growing
    histogram.py          # 5th-95th percentile for auto W/L
  api/
    volumes.py            # Volume list, metadata, data endpoints
    segmentation.py       # Save segmentation (NIfTI + DICOM-SEG)
  pyproject.toml          # uv project config
```

## Installation

```bash
# Server (using uv)
uv init server
cd server
uv add fastapi uvicorn[standard] pydicom nibabel numpy scipy scikit-image python-multipart
uv add highdicom  # only if DICOM-SEG export needed

# Client
npm create vite@latest client -- --template vanilla
cd client
npm install pako
```

## Development Workflow

```bash
# Terminal 1: Backend
cd server && uv run uvicorn main:app --reload --port 8000

# Terminal 2: Frontend
cd client && npm run dev
# vite.config.js proxies /api/* to localhost:8000
```

## Key Version Notes

**IMPORTANT:** All version numbers above are from training data (cutoff May 2025). Before pinning versions in `pyproject.toml` or `package.json`, verify current stable releases:

```bash
uv pip install --dry-run fastapi pydicom nibabel numpy scipy scikit-image
npm info vite version
npm info pako version
```

The recommendations (which libraries to use) are HIGH confidence. The exact version numbers are LOW confidence and should be verified.

## Sources

- Training data knowledge of Python medical imaging ecosystem (pydicom, nibabel, scipy, scikit-image are the canonical libraries -- this has been stable for 5+ years)
- Training data knowledge of FastAPI architecture patterns
- Training data knowledge of Canvas 2D API for medical image rendering
- No live sources were available (WebSearch/WebFetch denied); all version numbers need verification

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Backend framework | FastAPI | Django, Flask | FastAPI: async, streaming responses, auto-docs. Project requirement. |
| DICOM I/O | pydicom | SimpleITK | pydicom is lower-level, gives direct tag access needed for series grouping |
| NIfTI I/O | nibabel | SimpleITK, ITK | nibabel is purpose-built for NIfTI, lighter weight, Pythonic API |
| Image processing | scikit-image + scipy | OpenCV (cv2) | scikit-image has cleaner Python API, scipy.ndimage for connected components. OpenCV's Python bindings are clunky and it drags in a huge C++ library. |
| Frontend framework | Vanilla JS | React, Vue, Svelte | Canvas-heavy app; framework overhead not justified (see rationale above) |
| Build tool | Vite | Webpack, Parcel | Vite is fastest DX, ESM-native, minimal config |
| Viewer library | Custom canvas | Cornerstone.js, OHIF | Cornerstone assumes DICOM-web, fights custom backend architecture |
| DICOM-SEG output | highdicom | pydicom raw | highdicom handles DICOM-SEG standard compliance correctly; doing it manually with pydicom is error-prone |
| Package manager | uv | pip, poetry, pdm | Project requirement |
