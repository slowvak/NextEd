<!-- GSD:project-start source:PROJECT.md -->
## Project

**NextEd — Web-Based Medical Image Editor**

A web-based medical image viewer and segmentation editor for researchers and radiologists. It consists of a Python/FastAPI image server that catalogs NIfTI and DICOM volumes from a filesystem, and a JavaScript web client that loads volumes into browser memory for fast multi-plane viewing and segmentation editing. Think ITK-SNAP, but accessible through a browser.

**Core Value:** Researchers and radiologists can view and segment medical image volumes entirely in the browser — no desktop install, no file transfer friction — with tools comparable to ITK-SNAP's core workflow.

### Constraints

- **Tech stack (server)**: Python with FastAPI — required for pydicom, nibabel, numpy ecosystem
- **Tech stack (client)**: JavaScript with framework suited to pixel-level canvas rendering
- **Data locality**: Server runs locally alongside data — no cloud upload
- **Performance**: Full volume in browser memory; client-side slice rendering for fast scroll-through
- **Package management**: uv (not pip) for Python environment
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## Why NOT These Alternatives
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
<!-- GSD:stack-end -->
