# Architecture Patterns

**Domain:** Web-based medical image viewer/editor
**Researched:** 2026-03-24

## Recommended Architecture

NextEd follows a **thick-client / thin-server** pattern common to performant medical image viewers (OHIF, NiiVue, Papaya). The server is a catalog + data pipeline; the browser holds the full volume and does all rendering and editing locally.

```
+------------------------------------------------------------------+
|  BROWSER (Thick Client)                                          |
|                                                                  |
|  +------------------+  +-------------------------------------+   |
|  | Volume Manager   |  | Viewer Panel (4-up / single)        |   |
|  | - ArrayBuffer    |  | +----------+ +----------+           |   |
|  |   (main vol)     |  | | Axial    | | Coronal  |           |   |
|  | - ArrayBuffer    |  | | Canvas   | | Canvas   |           |   |
|  |   (seg mask)     |  | +----------+ +----------+           |   |
|  | - metadata       |  | +----------+ +----------+           |   |
|  | - W/L state      |  | | Sagittal | | (empty)  |           |   |
|  +--------+---------+  | | Canvas   | |          |           |   |
|           |             | +----------+ +----------+           |   |
|           v             +----------+----------------------+---+   |
|  +------------------+              |                      |       |
|  | Slice Renderer   |   +----------v---------+  +--------v----+  |
|  | - extracts 2D    |   | Segmentation       |  | Tool Engine |  |
|  |   from 3D array  |   | Overlay Renderer   |  | - paint     |  |
|  | - applies W/L    |   | - composites mask  |  | - ROI       |  |
|  | - writes to      |   |   onto image       |  | - region    |  |
|  |   canvas         |   | - label colors     |  |   grow      |  |
|  +------------------+   | - transparency      |  | - eraser    |  |
|                         +--------------------+   | - undo stack|  |
|                                                  +-------------+  |
+------------------------------+------------------------------------+
                               |
                    HTTP/REST  | (JSON metadata, binary volume data)
                               |
+------------------------------v------------------------------------+
|  SERVER (FastAPI)                                                 |
|                                                                   |
|  +-------------------+  +--------------------+                    |
|  | Catalog Service   |  | Volume Loader      |                   |
|  | - walk folder tree|  | - nibabel (NIfTI)  |                   |
|  | - index NIfTI     |  | - pydicom (DICOM)  |                   |
|  | - group DICOM by  |  | - numpy reshape    |                   |
|  |   series UID      |  | - serve as binary  |                   |
|  | - store metadata  |  +--------------------+                   |
|  +-------------------+                                            |
|                          +--------------------+                   |
|                          | Save Service       |                   |
|                          | - receive mask     |                   |
|                          | - write .nii.gz    |                   |
|                          | - write DICOM-SEG  |                   |
|                          +--------------------+                   |
|                                                                   |
|  +-------------------+  +--------------------+                    |
|  | Image Processing  |  | Static File Server |                   |
|  | - Otsu threshold  |  | - serves JS client |                   |
|  | - region grow     |  +--------------------+                    |
|  | - histogram stats |                                            |
|  +-------------------+                                            |
+-------------------------------------------------------------------+
```

### Component Boundaries

| Component | Responsibility | Communicates With | Location |
|-----------|---------------|-------------------|----------|
| **Catalog Service** | Walk folder tree on startup, index NIfTI/DICOM files, group DICOM by series UID, expose metadata via REST | Volume Loader (triggers on-demand load) | Server |
| **Volume Loader** | Read NIfTI via nibabel, read DICOM via pydicom, assemble 3D numpy array, serialize to binary for transfer | Catalog Service (receives load request), Client (sends binary data) | Server |
| **Image Processing Service** | Otsu thresholding, region growing, histogram percentile calculation | Client (receives ROI/seed data, returns results) | Server |
| **Save Service** | Receive segmentation mask from client, write as .nii.gz or DICOM-SEG with correct headers | Client (receives mask + metadata) | Server |
| **Volume Manager** | Hold main volume + segmentation mask as typed arrays in browser memory, manage metadata, W/L state | Slice Renderer, Tool Engine, Segmentation Overlay | Client |
| **Slice Renderer** | Extract 2D slice from 3D typed array for given axis/index, apply window/level transform, render to HTML Canvas | Volume Manager (reads data), Canvas elements (writes pixels) | Client |
| **Segmentation Overlay Renderer** | Composite segmentation mask slice onto rendered image with label colors and transparency | Volume Manager (reads mask), Slice Renderer (composited after base image), Label Manager | Client |
| **Tool Engine** | Handle mouse/keyboard events, dispatch to active tool (paint, ROI, eraser), manage undo stack (3 levels) | Volume Manager (modifies mask data), Slice Renderer (triggers re-render), Image Processing Service (delegates Otsu/region grow) | Client |
| **Label Manager** | Track label integer values, names, colors; handle add/edit/delete | Tool Engine (provides active label), Segmentation Overlay (provides color map) | Client |
| **Viewer Panel** | Layout management (4-up vs single view), slider controls, canvas sizing | Slice Renderer (hosts canvases), Tool Engine (forwards events) | Client |

### Data Flow

**Volume Loading Flow:**
```
User clicks "Open" in volume list
  -> Client GET /api/volumes/{id}/data
  -> Server: Volume Loader reads file via nibabel/pydicom
  -> Server: numpy array -> raw bytes (little-endian, row-major)
  -> HTTP response: binary blob + metadata header (JSON)
  -> Client: ArrayBuffer stored in Volume Manager
  -> Client: TypedArray view created (Int16Array for CT, Float32Array for MR)
  -> Client: histogram computed, 5th-95th percentile -> initial W/L
  -> Client: center slices rendered in 4-up view
```

**Segmentation Loading Flow:**
```
After main volume loads, dialog prompts for segmentation
  -> Client GET /api/volumes/{id}/segmentation-candidates
  -> Server returns list of matching files (auto-detect _segmentation naming)
  -> User confirms selection
  -> Client GET /api/segmentations/{path}/data
  -> Server reads mask file, returns as Uint8Array binary
  -> Client stores in Volume Manager alongside main volume
  -> Client: unique label values extracted, Label Manager populated
  -> Client: overlay composited onto current slices
```

**Slice Rendering Flow (hot path -- must be fast):**
```
User moves slice slider (or scrolls)
  -> New slice index set
  -> Slice Renderer: extract 2D slice from 3D TypedArray
     For axial (Z): slice = volume[z * xDim * yDim ... (z+1) * xDim * yDim]
     For coronal (Y): stride across Z, sample at fixed Y
     For sagittal (X): stride across Z and Y, sample at fixed X
  -> Apply W/L: pixelValue -> displayValue (0-255 grayscale)
     displayValue = clamp((pixelValue - (level - width/2)) / width * 255, 0, 255)
  -> Write to ImageData buffer (RGBA, grayscale -> R=G=B=val, A=255)
  -> If segmentation loaded:
     Extract corresponding mask slice (same axis/index)
     For each pixel where mask > 0:
       Blend label color with alpha from transparency slider
  -> ctx.putImageData(imageData, 0, 0)
```

**Paint Tool Flow:**
```
User clicks/drags on canvas with paintbrush active
  -> Tool Engine: convert canvas (x,y) to volume voxel coordinates
     Account for: canvas scaling, anisotropic voxel spacing, current axis
  -> Tool Engine: check voxel value against min/max range slider
  -> If within range: set mask voxel to current label value
  -> If multi-slice painting (n>1): repeat for n adjacent slices
  -> Push previous mask state to undo stack (store affected region only)
  -> Trigger re-render of affected slice(s)
```

**Otsu ROI Flow (shift+draw):**
```
User shift+draws rectangle/oval on canvas
  -> Tool Engine: collect voxel coordinates within ROI
  -> Extract pixel values from main volume for those coordinates
  -> Send to server: POST /api/processing/otsu {voxel_values, roi_outline_values}
     OR compute client-side (Otsu is simple enough for JS)
  -> Server/client: compute Otsu threshold, create binary mask
  -> Determine "on" class: whichever bitmask value (0/1) has fewer members on ROI outline
  -> Apply: set mask voxels where on==true to current label value
  -> Push to undo stack, re-render
```

**Region Grow Flow:**
```
User clicks seed point with region grow tool active
  -> Tool Engine: convert to voxel coordinates
  -> Send to server: POST /api/processing/region-grow
     {seed: [x,y,z], volume_id, parameters: {tolerance, ...}}
  -> Server: numpy-based flood fill in 3D (much faster than JS for large volumes)
  -> Server returns: affected voxel coordinates or binary mask delta
  -> Client applies result to segmentation mask
  -> User clicks "OK" to confirm (or cancel to discard)
```

**Save Flow:**
```
User clicks "Save As"
  -> Dialog with suggested filename
  -> Client: POST /api/segmentations/save
     {mask_data: Uint8Array (binary), metadata: {affine, dims, spacing, ...},
      filename, format: "nifti" | "dicom-seg"}
  -> Server: reconstruct numpy array from binary
  -> Server: write via nibabel (nifti) or pydicom (DICOM-SEG)
  -> Server returns success/failure
```

## Patterns to Follow

### Pattern 1: Binary Transfer for Volume Data
**What:** Transfer volumes as raw binary ArrayBuffers over HTTP, not JSON-encoded arrays.
**When:** Always, for both main volumes and segmentation masks.
**Why:** A 512x512x400 int16 volume is ~200MB. JSON encoding would double+ the size and parsing would take seconds. Binary transfer with appropriate Content-Type headers is standard practice.
**Example:**
```python
# Server (FastAPI)
@app.get("/api/volumes/{volume_id}/data")
async def get_volume_data(volume_id: str):
    vol = load_volume(volume_id)  # numpy array
    metadata = {
        "dtype": str(vol.dtype),
        "shape": list(vol.shape),
        "spacing": list(spacing),
        "affine": affine.tolist(),
    }
    # Return binary with metadata in header
    return Response(
        content=vol.tobytes(order='C'),
        media_type="application/octet-stream",
        headers={"X-Volume-Metadata": json.dumps(metadata)}
    )
```

```javascript
// Client
const response = await fetch(`/api/volumes/${volumeId}/data`);
const metadata = JSON.parse(response.headers.get('X-Volume-Metadata'));
const buffer = await response.arrayBuffer();
const volume = new Int16Array(buffer); // or Float32Array based on dtype
```

### Pattern 2: Typed Array Slice Extraction Without Copying
**What:** Use typed array views and manual indexing to extract 2D slices from the flat 3D array without allocating new arrays per frame.
**When:** Every slice render (the hot path).
**Why:** Allocating a new array on every scroll event causes GC pressure and jank. Pre-allocate the output ImageData and write directly.
**Example:**
```javascript
// Pre-allocated output buffer (reused across renders)
const imageData = ctx.createImageData(width, height);
const rgba = imageData.data; // Uint8ClampedArray

function renderAxialSlice(volume, z, xDim, yDim, windowCenter, windowWidth) {
    const offset = z * xDim * yDim;
    const halfWidth = windowWidth / 2;
    const minVal = windowCenter - halfWidth;
    for (let i = 0; i < xDim * yDim; i++) {
        const raw = volume[offset + i];
        const scaled = ((raw - minVal) / windowWidth) * 255;
        const val = scaled < 0 ? 0 : scaled > 255 ? 255 : scaled;
        const j = i * 4;
        rgba[j] = rgba[j+1] = rgba[j+2] = val;
        rgba[j+3] = 255;
    }
    ctx.putImageData(imageData, 0, 0);
}
```

### Pattern 3: Anisotropic Voxel Handling via CSS Transform
**What:** Render slices at native pixel resolution, then scale the canvas display via CSS to account for non-square voxels.
**When:** Coronal and sagittal views where Z-spacing often differs from X/Y-spacing.
**Why:** Rendering at display resolution wastes cycles on interpolation. Rendering at voxel resolution and letting the browser scale via CSS is faster and pixel-accurate.
**Example:**
```javascript
// Canvas internal resolution = voxel dimensions
canvas.width = xDim;   // e.g. 512
canvas.height = zDim;  // e.g. 400

// CSS display size accounts for anisotropic spacing
const aspectRatio = (xDim * xSpacing) / (zDim * zSpacing);
canvas.style.width = `${displayHeight * aspectRatio}px`;
canvas.style.height = `${displayHeight}px`;
```

### Pattern 4: Sparse Undo Stack
**What:** Store only the changed region (bounding box of affected voxels + their previous values), not full volume snapshots.
**When:** Every editing operation (paint, ROI, region grow).
**Why:** Full segmentation mask at 512x512x400 uint8 = ~100MB. Three undo levels of full copies = 300MB. Sparse storage keeps undo under 1MB typically.
**Example:**
```javascript
class UndoEntry {
    constructor(bbox, previousValues) {
        this.bbox = bbox; // {x0, y0, z0, x1, y1, z1}
        this.previousValues = previousValues; // Uint8Array of just the bbox region
    }
}
const undoStack = []; // max 3 entries
```

### Pattern 5: Server-Side Heavy Computation, Client-Side Light Computation
**What:** Otsu threshold can run client-side (simple histogram operation on a small ROI). Region grow must run server-side (3D flood fill on potentially millions of voxels).
**When:** Deciding where to place computation.
**Why:** Region grow on a 512x512x400 volume in JavaScript is painfully slow. numpy + scipy on the server handles it in seconds. Otsu on a small rectangular ROI (maybe 100x100 pixels) is trivial in JS.
**Boundary rule:** If the operation touches < 100K voxels and is algorithmically simple, do it client-side. Otherwise, server-side.

## Anti-Patterns to Avoid

### Anti-Pattern 1: Server-Side Slice Rendering
**What:** Having the server render 2D slice images (PNG/JPEG) and send them to the client per scroll event.
**Why bad:** Network latency makes scrolling feel sluggish. Even localhost adds 5-20ms per request. At 30fps scrolling that is unacceptable. The whole point of loading the volume into browser memory is to avoid this.
**Instead:** Transfer the full 3D volume once. Render slices client-side from the in-memory typed array.

### Anti-Pattern 2: JSON-Encoded Volume Data
**What:** Serializing voxel arrays as JSON (e.g., `[[1, 2, 3], [4, 5, 6], ...]`).
**Why bad:** 200MB binary becomes 600MB+ JSON. Parsing takes 10+ seconds. No typed array backing.
**Instead:** Binary ArrayBuffer transfer with metadata in headers or a separate metadata endpoint.

### Anti-Pattern 3: Canvas Per Slice (DOM Accumulation)
**What:** Creating a new canvas element for each slice the user views.
**Why bad:** Memory leak. DOM bloat. GC storms.
**Instead:** Reuse 3 (or 4) canvas elements. Redraw their content when slice index changes.

### Anti-Pattern 4: Full Volume Transfer for Segmentation Save
**What:** Sending the entire main volume back to the server when saving a segmentation.
**Why bad:** The main volume has not changed. Only the segmentation mask needs to be sent back.
**Instead:** Send only the Uint8Array segmentation mask plus the metadata needed to reconstruct the NIfTI header (affine, dimensions, spacing). The server can reconstruct the header from the original volume's metadata.

### Anti-Pattern 5: Storing Volume Data in Reactive State
**What:** Putting the 200MB TypedArray into a reactive state system (React state, Vue reactive, Svelte store).
**Why bad:** Reactive systems track changes by reference equality or deep comparison. A 200MB array in reactive state causes the framework to do unnecessary work on every state change.
**Instead:** Store volume data in a plain module-level variable or class instance outside the reactive system. Only put metadata (current slice index, W/L values, active tool) in reactive state.

## Key Architectural Decisions

### Decision 1: Where to compute Otsu threshold
**Recommendation: Client-side.** Otsu operates on a small ROI (a few thousand pixels). The algorithm is a simple histogram + threshold calculation. Sending data to the server and waiting for a response adds unnecessary latency. Implement in ~30 lines of JavaScript.

### Decision 2: Where to compute Region Grow
**Recommendation: Server-side.** Region grow is a 3D flood fill that can touch millions of voxels. Python + numpy + scipy.ndimage is well-suited. The client sends the seed point and parameters; the server returns the resulting mask region. This does mean the server needs access to the main volume data (which it already has on disk).

However, there is a subtlety: the server loaded the volume from disk and sent it to the client. For region grow, the server needs to re-read the volume (or cache it). **Recommendation: Cache the most recently loaded volume in server memory** (one volume at a time, since this is single-user). This avoids re-reading a ~200MB file from disk for each region grow operation.

### Decision 3: Volume data transfer format
**Recommendation: Raw binary with metadata header.** Use `application/octet-stream` with a custom `X-Volume-Metadata` JSON header. This avoids a two-request dance and keeps the transfer atomic.

Alternative considered: multipart response with JSON metadata part + binary data part. This is more "correct" but harder to parse on the client. The custom header approach is simpler and sufficient for single-user local use.

### Decision 4: Client framework choice
**Recommendation: Vanilla JavaScript with Web Components or a minimal framework (Svelte/SolidJS).** The critical rendering path is raw Canvas 2D API calls. React/Vue add overhead that is counterproductive for pixel-level canvas rendering. Svelte compiles away its runtime, making it the best choice if a framework is wanted for UI panels (volume list, tool panel, label manager) while keeping canvas rendering in plain JS.

Do NOT use React for this project. React's reconciliation cycle adds latency to canvas updates, and putting canvas rendering inside React components is an anti-pattern for this type of application.

### Decision 5: Canvas rendering API
**Recommendation: Canvas 2D API with `putImageData`.** WebGL is overkill for 2D slice display and adds complexity without benefit (no 3D rendering in v1). The Canvas 2D `putImageData` path is direct: write pixel values to an ImageData buffer, put it on the canvas. This is the approach used by Papaya and simple NIfTI viewers. OHIF/Cornerstone use WebGL because they also do 3D rendering -- NextEd v1 does not need this.

## Component Build Order (Dependencies)

The build order is dictated by which components other components depend on.

```
Phase 1: Foundation (no dependencies)
  1. Catalog Service (server) -- can be built and tested independently
  2. Volume Loader (server) -- depends on catalog for file paths
  3. REST API shell (FastAPI routes) -- depends on catalog + loader

Phase 2: Core Viewer (depends on Phase 1)
  4. Volume Manager (client) -- depends on REST API to fetch data
  5. Slice Renderer (client) -- depends on Volume Manager
  6. Viewer Panel / Layout (client) -- depends on Slice Renderer
  7. Slice navigation (sliders) -- depends on Viewer Panel

Phase 3: Segmentation Display (depends on Phase 2)
  8. Segmentation loading flow -- depends on Volume Manager
  9. Label Manager -- depends on segmentation data
  10. Segmentation Overlay Renderer -- depends on Label Manager + Slice Renderer
  11. Transparency control -- depends on Overlay Renderer

Phase 4: Editing Tools (depends on Phase 3)
  12. Tool Engine (event dispatch, active tool state) -- depends on Viewer Panel
  13. Paintbrush tool -- depends on Tool Engine + Volume Manager
  14. Eraser (right-click paint) -- trivial extension of paintbrush
  15. Undo stack -- depends on Tool Engine
  16. ROI tools (rectangle, oval) -- depends on Tool Engine
  17. Otsu within ROI (shift+draw) -- depends on ROI tools
  18. Region grow (server + client) -- depends on Tool Engine + server processing endpoint

Phase 5: Polish (depends on Phases 2-4)
  19. Window/Level presets and ctrl+drag adjustment -- depends on Slice Renderer
  20. Modality detection + appropriate preset display -- depends on metadata
  21. Save As flow -- depends on segmentation mask + server save endpoint
  22. Min/max pixel value range for painting -- depends on Tool Engine
```

**Rationale:** Each phase produces a testable, demonstrable artifact. Phase 1 gives a working API you can curl. Phase 2 gives a viewer you can scroll through. Phase 3 adds overlay visualization. Phase 4 adds editing. Phase 5 adds quality-of-life features. No phase depends on a later phase.

## Scalability Considerations

| Concern | At 512x512x200 (small) | At 512x512x400 (typical) | At 512x512x1000+ (large CT) |
|---------|------------------------|--------------------------|------------------------------|
| Volume transfer | ~100MB, 1-2s local | ~200MB, 2-4s local | ~500MB+, 5-10s local |
| Browser memory | ~200MB (vol+seg+buffers) | ~400MB | ~1GB -- approaching browser tab limits |
| Slice render time | <1ms (putImageData) | <1ms | <2ms |
| Region grow (server) | <1s | 1-3s | 3-10s |
| Undo stack (sparse) | <1MB | <5MB | <10MB |

For v1 targeting typical 512x512x400 data, no special scalability measures are needed. If later supporting very large volumes, consider: chunked loading, Web Workers for off-main-thread rendering, or WebGL for GPU-accelerated compositing.

## Sources

- Training data knowledge of OHIF Viewer architecture (uses Cornerstone.js rendering library + WebGL) -- MEDIUM confidence
- Training data knowledge of NiiVue (WebGL-based NIfTI viewer, holds volume in GPU texture) -- MEDIUM confidence
- Training data knowledge of Papaya (Canvas 2D API, in-browser NIfTI rendering) -- MEDIUM confidence
- Direct reasoning from project requirements and data size constraints -- HIGH confidence
- Canvas 2D API and TypedArray performance characteristics -- HIGH confidence (well-established web platform APIs)
- nibabel, pydicom, numpy capabilities -- HIGH confidence (mature, stable Python libraries)

**Note:** Web search was unavailable during this research. Architecture recommendations are based on training data knowledge of established medical imaging viewer patterns and first-principles analysis of the project requirements. The core architectural pattern (thick client, binary transfer, Canvas 2D rendering) is well-established and unlikely to have changed.
