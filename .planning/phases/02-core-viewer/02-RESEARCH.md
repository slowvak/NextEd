# Phase 2: Core Viewer - Research

**Researched:** 2026-03-24
**Domain:** Client-side medical image rendering, Canvas 2D API, NIfTI orientation, window/level, multi-plane viewer
**Confidence:** HIGH

## Summary

Phase 2 transforms the binary volume data received from Phase 1's server into a fully interactive multi-plane radiology viewer. The core challenge is building a 4-panel layout (axial, coronal, sagittal, empty) with correct anatomical orientation, anisotropic voxel spacing compensation, crosshair synchronization between views, and real-time window/level adjustment -- all using vanilla JavaScript and Canvas 2D API.

The critical technical risk is NIfTI orientation handling. The server must reorient volumes to RAS+ canonical orientation using nibabel's `as_closest_canonical()` before sending data to the client, so the client can rely on a consistent axis mapping: axis 0 = Right (sagittal slicing), axis 1 = Anterior (coronal slicing), axis 2 = Superior (axial slicing). Without this server-side normalization, the client would need to implement arbitrary affine-based slicing, which is significantly more complex and error-prone.

The rendering pipeline is straightforward once orientation is solved: extract a 2D slice from the 3D TypedArray via index arithmetic, apply a window/level lookup table (LUT) for fast grayscale mapping, write to an ImageData RGBA buffer, putImageData to the canvas, and CSS-scale the canvas to compensate for anisotropic voxel spacing. A pre-computed 65536-entry LUT makes window/level changes nearly free -- only the LUT is rebuilt, not the per-pixel math. Auto-windowing uses `numpy.percentile(data, [5, 95])` on the server side, sent as metadata to the client.

**Primary recommendation:** Normalize all volumes to RAS+ on the server before binary transfer. Build the client viewer as a reusable ViewerPanel class that renders one plane, instantiate three for the 4-panel layout, synchronize crosshairs via a shared state object, and use a LUT-based window/level pipeline for 60fps scrolling performance.

## Project Constraints (from CLAUDE.md)

- **Package management:** Always use `uv`, never `pip`
- **Tech stack (client):** Vanilla JS + HTML5 Canvas (no React/Vue/Svelte)
- **Tech stack (server):** Python with FastAPI
- **Performance:** Full volume in browser memory; client-side slice rendering
- **GSD Workflow:** Do not make direct repo edits outside a GSD workflow unless the user explicitly asks

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| VIEW-01 | 4-panel layout: axial (upper-left), coronal (upper-right), sagittal (lower-left), blank (lower-right) | CSS Grid 2x2 layout with 3 canvas panels + empty div; ViewerPanel class per plane |
| VIEW-02 | Each view starts at center slice of its dimension (z/2, y/2, x/2) | On volume load, initialize slice indices to Math.floor(dim/2) for each axis |
| VIEW-03 | Each view has a slider for slice navigation | HTML range input per panel, min=0, max=dim-1, bound to slice index |
| VIEW-04 | Single-view toggle via A/C/S buttons; + button returns to 4-panel | CSS class toggle: hide 3 panels, expand 1 to full grid area; + button restores grid |
| VIEW-05 | Full volume held in browser memory; slices rendered client-side from ArrayBuffer | Volume stored as Float32Array/Int16Array; slice extraction via index math on flat buffer |
| VIEW-06 | Correct handling of anisotropic voxel spacing in rendering | CSS aspect ratio scaling on canvas: render at voxel resolution, CSS-scale display accounting for spacing ratios |
| VIEW-07 | Crosshair synchronization -- clicking in one view updates slice position in other views | Shared ViewerState with [x,y,z] cursor; click converts canvas coords to voxel coords, updates other panels |
| WLVL-01 | Auto window/level on open using 5th-95th percentile values | Server computes np.percentile(data, [5, 95]) and sends as metadata; client sets initial W/L from these |
| WLVL-02 | Manual W/L via ctrl+drag (up=brighter, down=darker, right=wider, left=narrower) | Ctrl+mousemove handler: deltaY adjusts level, deltaX adjusts width; rebuild LUT on change |
| WLVL-03 | W/L presets: Brain (W=80,L=40), Bone (W=3000,L=500), Lung (W=1000,L=-500), Abd (W=450,L=125) | Preset buttons that set window/width values; derivation: window=max-min, level=(max+min)/2 |
| WLVL-04 | Presets shown only when modality is CT; hidden for MR | Conditional DOM display based on volume metadata modality field |
</phase_requirements>

## Standard Stack

### Core (Phase 2 additions to Phase 1)

| Library | Version | Purpose | Why Standard | Confidence |
|---------|---------|---------|--------------|------------|
| Vanilla JS + Canvas 2D | ES2022+ | Slice rendering, UI | Direct pixel control via putImageData, no framework overhead for canvas ops | HIGH |
| Vite | 8.x | Dev server + build | Already scaffolded in Phase 1 | HIGH |

### Server-Side Changes (Phase 2)

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| nibabel | 5.4.x | RAS+ reorientation | `as_closest_canonical()` normalizes orientation before binary transfer |
| numpy | 2.4.x | Percentile calculation | `np.percentile(data, [5, 95])` for auto-windowing metadata |

No new dependencies required for Phase 2. All libraries are already in the Phase 1 stack.

## Architecture Patterns

### Phase 2 Project Structure (client additions)

```
client/
  src/
    main.js                 # Updated: init viewer after volume open
    api.js                  # From Phase 1
    viewer/
      ViewerState.js        # Shared state: cursor [x,y,z], W/L, active panel
      ViewerPanel.js        # Single canvas panel: renders one plane, handles input
      FourPanelLayout.js    # 4-panel grid manager, A/C/S/+ toggle
      windowLevel.js        # LUT generation, W/L presets, ctrl+drag handler
      sliceExtractor.js     # Extract 2D slice from flat 3D TypedArray by axis
    ui/
      volumeList.js         # From Phase 1
    utils/
      arrayOps.js           # TypedArray helpers
  style.css                 # 4-panel grid layout CSS
```

### Pattern 1: Server-Side RAS+ Normalization

**What:** Before sending volume binary data, the server reorients the volume to RAS+ canonical orientation using nibabel. This means the client always receives data where axis 0 = R-L (sagittal), axis 1 = P-A (coronal), axis 2 = I-S (axial).

**Why:** Without this, the client must interpret the affine matrix to determine which array axis corresponds to which anatomical plane. That is complex, error-prone, and the single most common source of orientation bugs in medical image viewers. Server-side normalization eliminates the problem at the source.

**Example (server update to volume data endpoint):**
```python
import nibabel as nib
import numpy as np

def load_and_normalize_nifti(filepath):
    img = nib.load(str(filepath))
    # Reorient to RAS+ canonical
    canonical = nib.as_closest_canonical(img)
    data = np.ascontiguousarray(canonical.get_fdata(dtype=np.float32))
    # Spacing from canonical header
    spacing = [float(s) for s in canonical.header.get_zooms()[:3]]
    # Compute auto-windowing percentiles
    p5, p95 = np.percentile(data, [5, 95])
    metadata = {
        "dimensions": list(canonical.shape[:3]),
        "voxel_spacing": spacing,  # now in RAS+ axis order
        "dtype": "float32",
        "window_center": float((p5 + p95) / 2),
        "window_width": float(p95 - p5),
        "percentile_5": float(p5),
        "percentile_95": float(p95),
    }
    return data, metadata
```

**Confidence:** HIGH. nibabel's `as_closest_canonical()` is the standard approach used by neuroimaging pipelines. Verified via nibabel 5.4.x documentation.

### Pattern 2: LUT-Based Window/Level Rendering

**What:** Pre-compute a lookup table (LUT) that maps every possible raw voxel value to a display byte (0-255). When rendering a slice, look up each voxel value in the LUT instead of computing the linear transform per pixel.

**Why:** For int16 data (range -32768 to +32767), the LUT has 65536 entries (256KB). Building the LUT is O(65536). Applying it to a 512x512 slice is 262,144 simple array lookups -- much faster than 262,144 multiply-clamp operations. When the user adjusts W/L via ctrl+drag, only the LUT is rebuilt (sub-millisecond), not every pixel.

**Example:**
```javascript
// Build LUT: maps raw int16 value to display uint8
function buildWindowLevelLUT(center, width) {
    const lut = new Uint8Array(65536);
    const halfWidth = width / 2;
    const minVal = center - halfWidth;
    const maxVal = center + halfWidth;
    for (let i = 0; i < 65536; i++) {
        // Map index to signed int16 value: 0-32767 -> 0-32767, 32768-65535 -> -32768 to -1
        const raw = i < 32768 ? i : i - 65536;
        if (raw <= minVal) {
            lut[i] = 0;
        } else if (raw >= maxVal) {
            lut[i] = 255;
        } else {
            lut[i] = Math.round(((raw - minVal) / width) * 255);
        }
    }
    return lut;
}

// Apply LUT to a slice (hot path)
function renderSliceWithLUT(sliceData, lut, rgba) {
    const len = sliceData.length;
    for (let i = 0; i < len; i++) {
        // For Int16Array: convert signed to unsigned index
        const idx = sliceData[i] < 0 ? sliceData[i] + 65536 : sliceData[i];
        const val = lut[idx];
        const j = i << 2; // i * 4
        rgba[j] = val;
        rgba[j + 1] = val;
        rgba[j + 2] = val;
        rgba[j + 3] = 255;
    }
}
```

**For Float32 data:** LUT cannot directly index floats. Two approaches:
1. **Quantize on load:** Convert float32 to int16 on the server or client (scale to fit int16 range). This enables LUT indexing.
2. **Direct computation:** For float data, compute the linear W/L transform per pixel. This is still fast (~2ms for 512x512) and acceptable.

**Recommendation:** Serve all volume data as float32 from the server (as Phase 1 already does). Use direct per-pixel computation for float32 data with the LUT optimization available if int16 data is served directly in a future optimization pass. The per-pixel path for float32 is simple and fast enough.

**Confidence:** HIGH. LUT-based windowing is the standard approach in ImageJ, Cornerstone.js, and every performant medical viewer.

### Pattern 3: Slice Extraction from Flat 3D TypedArray

**What:** Given a flat Float32Array holding a 3D volume in row-major (C) order with shape [dimX, dimY, dimZ] in RAS+ convention, extract a 2D slice for a given axis and index.

**After RAS+ normalization, the array layout (C-order) is:**
- Array index = x + y * dimX + z * dimX * dimY
- where x = R-L axis, y = A-P axis, z = I-S axis

**Slice extraction:**
```javascript
// volume: Float32Array, shape [dimX, dimY, dimZ] in C-order
// After RAS+ normalization from nibabel + numpy C-contiguous:
// index(x,y,z) = x + y*dimX + z*dimX*dimY

function extractAxialSlice(volume, z, dimX, dimY) {
    // Axial = fixed z, varies x (cols) and y (rows)
    // Returns dimX * dimY pixels, displayed as dimX wide, dimY tall
    const offset = z * dimX * dimY;
    // This is a contiguous block -- can use subarray (no copy)
    return volume.subarray(offset, offset + dimX * dimY);
}

function extractCoronalSlice(volume, y, dimX, dimY, dimZ) {
    // Coronal = fixed y, varies x (cols) and z (rows)
    // Returns dimX * dimZ pixels
    const slice = new Float32Array(dimX * dimZ);
    for (let z = 0; z < dimZ; z++) {
        const srcOffset = y * dimX + z * dimX * dimY;
        for (let x = 0; x < dimX; x++) {
            slice[z * dimX + x] = volume[srcOffset + x];
        }
    }
    return slice;
}

function extractSagittalSlice(volume, x, dimX, dimY, dimZ) {
    // Sagittal = fixed x, varies y (cols) and z (rows)
    // Returns dimY * dimZ pixels
    const slice = new Float32Array(dimY * dimZ);
    for (let z = 0; z < dimZ; z++) {
        for (let y = 0; y < dimY; y++) {
            slice[z * dimY + y] = volume[x + y * dimX + z * dimX * dimY];
        }
    }
    return slice;
}
```

**Key insight:** Axial slices are contiguous in memory (use `subarray` -- zero-copy). Coronal and sagittal require strided access (allocate new array or iterate). This is inherent to row-major storage and cannot be avoided without storing 3 copies of the volume in different axis orders (wasteful for the typical 200MB volume).

**Confidence:** HIGH. This is basic 3D array indexing in C-order. Verified against numpy's C-contiguous layout.

### Pattern 4: Anisotropic Voxel Display via CSS Scaling

**What:** Render slices at native voxel resolution on the canvas, then use CSS to scale the display to correct for non-square voxels.

**Why:** Coronal view shows X (R-L) horizontally and Z (I-S) vertically. If spacingX = 0.5mm and spacingZ = 2.5mm, each pixel in Z represents 5x more physical space than in X. Without correction, structures appear squashed vertically.

**Example:**
```javascript
function setCanvasAspectRatio(canvas, sliceWidth, sliceHeight, spacingH, spacingV, maxDisplaySize) {
    // Canvas internal resolution = voxel dimensions
    canvas.width = sliceWidth;
    canvas.height = sliceHeight;

    // Physical aspect ratio
    const physicalWidth = sliceWidth * spacingH;
    const physicalHeight = sliceHeight * spacingV;
    const aspectRatio = physicalWidth / physicalHeight;

    // Fit within maxDisplaySize while preserving physical aspect ratio
    let displayWidth, displayHeight;
    if (aspectRatio > 1) {
        displayWidth = maxDisplaySize;
        displayHeight = maxDisplaySize / aspectRatio;
    } else {
        displayHeight = maxDisplaySize;
        displayWidth = maxDisplaySize * aspectRatio;
    }

    canvas.style.width = `${displayWidth}px`;
    canvas.style.height = `${displayHeight}px`;

    // CRITICAL: disable smoothing for medical images (nearest-neighbor)
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
}
```

**Per-view spacing mapping (after RAS+ normalization):**
| View | Horizontal Axis | Vertical Axis | Canvas Width | Canvas Height | H-Spacing | V-Spacing |
|------|----------------|---------------|--------------|---------------|-----------|-----------|
| Axial | X (R-L) | Y (A-P) | dimX | dimY | spacingX | spacingY |
| Coronal | X (R-L) | Z (I-S) | dimX | dimZ | spacingX | spacingZ |
| Sagittal | Y (A-P) | Z (I-S) | dimY | dimZ | spacingY | spacingZ |

**Confidence:** HIGH. CSS scaling is the standard approach (used by Papaya, NiiVue for 2D modes).

### Pattern 5: Crosshair Synchronization via Shared State

**What:** A central ViewerState object holds the current 3D cursor position [x, y, z]. When the user clicks on any panel, the click is converted to voxel coordinates, ViewerState is updated, and all panels re-render to reflect the new position.

**Example:**
```javascript
class ViewerState {
    constructor(dims) {
        // Start at center (VIEW-02)
        this.cursor = [
            Math.floor(dims[0] / 2),
            Math.floor(dims[1] / 2),
            Math.floor(dims[2] / 2),
        ];
        this.windowCenter = 0;
        this.windowWidth = 1;
        this.listeners = [];
    }

    setCursor(x, y, z) {
        this.cursor = [
            Math.max(0, Math.min(x, this.dims[0] - 1)),
            Math.max(0, Math.min(y, this.dims[1] - 1)),
            Math.max(0, Math.min(z, this.dims[2] - 1)),
        ];
        this.notify();
    }

    subscribe(fn) { this.listeners.push(fn); }
    notify() { this.listeners.forEach(fn => fn(this)); }
}
```

**Click-to-voxel conversion per panel (after RAS+ normalization):**
| Panel | Click X maps to | Click Y maps to | Slice axis | Slice index from |
|-------|----------------|----------------|------------|-----------------|
| Axial | voxel X | voxel Y | Z | cursor[2] |
| Coronal | voxel X | voxel Z | Y | cursor[1] |
| Sagittal | voxel Y | voxel Z | X | cursor[0] |

When clicking in the Axial view: update cursor[0] = clickX, cursor[1] = clickY. The other views use cursor[2] (axial slice), cursor[1] (coronal slice), cursor[0] (sagittal slice) from the shared state. Sliders are bound to the same cursor values.

**Confidence:** HIGH. Standard observer pattern for linked multi-panel viewers.

### Pattern 6: Ctrl+Drag Window/Level Adjustment

**What:** When the user holds Ctrl and drags on a canvas, horizontal movement adjusts window width and vertical movement adjusts window level (center).

**Example:**
```javascript
function setupWindowLevelDrag(canvas, state) {
    let isDragging = false;
    let lastX, lastY;

    canvas.addEventListener('mousedown', (e) => {
        if (e.ctrlKey || e.metaKey) {
            isDragging = true;
            lastX = e.clientX;
            lastY = e.clientY;
            e.preventDefault();
        }
    });

    canvas.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        const dx = e.clientX - lastX;  // right = wider
        const dy = e.clientY - lastY;  // down = darker (higher level)

        // Scale sensitivity by current W/L range
        const widthSensitivity = state.windowWidth / 300;
        const levelSensitivity = state.windowWidth / 300;

        state.windowWidth = Math.max(1, state.windowWidth + dx * widthSensitivity);
        state.windowCenter = state.windowCenter - dy * levelSensitivity;

        lastX = e.clientX;
        lastY = e.clientY;
        state.notify();  // triggers re-render of all panels
    });

    window.addEventListener('mouseup', () => { isDragging = false; });
}
```

**Note on WLVL-02 spec:** "up=brighter" means moving mouse up decreases the level (center), making the image appear brighter. "right=wider" means moving mouse right increases the window width. The dy direction is inverted because screen Y increases downward.

**Confidence:** HIGH. This is the standard Ctrl+drag convention used by ITK-SNAP, 3D Slicer, and Cornerstone.js.

### Pattern 7: 4-Panel Layout with Single-View Toggle

**What:** CSS Grid with 2x2 layout. A/C/S buttons expand one panel to fill the grid; + button returns to 4-panel.

**Example:**
```css
.viewer-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 1fr 1fr;
    width: 100%;
    height: 100%;
    gap: 2px;
    background: #000;
}

.viewer-grid.single-view .viewer-panel {
    display: none;
}

.viewer-grid.single-view .viewer-panel.active {
    display: block;
    grid-column: 1 / -1;
    grid-row: 1 / -1;
}
```

```javascript
function toggleSingleView(panelId) {
    const grid = document.querySelector('.viewer-grid');
    if (panelId === null) {
        // Return to 4-panel
        grid.classList.remove('single-view');
        grid.querySelectorAll('.viewer-panel').forEach(p => p.classList.remove('active'));
    } else {
        grid.classList.add('single-view');
        grid.querySelectorAll('.viewer-panel').forEach(p => {
            p.classList.toggle('active', p.id === panelId);
        });
    }
    // Resize canvases after layout change
    requestAnimationFrame(() => resizeAllPanels());
}
```

**Confidence:** HIGH. Standard CSS Grid pattern.

### Anti-Patterns to Avoid

- **Client-side affine interpretation:** Do NOT send the raw affine matrix to the client and try to interpret it in JavaScript. Normalize to RAS+ on the server. Client affine math is the top cause of orientation bugs.
- **Allocating new arrays per frame:** Do NOT create new Float32Array or Uint8ClampedArray on every slice render. Pre-allocate ImageData and reuse it. Only coronal/sagittal slice extraction needs allocation (amortize with a reusable buffer).
- **Bilinear smoothing on medical images:** Always set `ctx.imageSmoothingEnabled = false`. Medical image pixels have discrete meaning; smoothing destroys diagnostic detail and creates phantom values.
- **Rendering all 4 panels on every interaction:** Only re-render the panel whose slice index changed. For crosshair clicks, re-render all 3 image panels (the blank panel never needs rendering).
- **Putting volume data in reactive state:** Keep the Float32Array as a plain module-level or class-level variable. Only put metadata (cursor position, W/L values, active tool) in the observer-pattern state.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| NIfTI orientation normalization | Client-side affine interpreter | nibabel `as_closest_canonical()` server-side | Affine math is subtle; nibabel handles all edge cases (oblique, non-standard axis orders, flipped axes) |
| Percentile calculation for auto-windowing | Client-side histogram | `numpy.percentile()` on server, send as metadata | numpy is fast and handles edge cases (NaN, inf); doing this on 100M+ values in JS is slow |
| Canvas aspect ratio math | Manual pixel interpolation | CSS width/height scaling | Browser-native scaling is faster and handles sub-pixel rendering correctly |

## Common Pitfalls

### Pitfall 1: Orientation Wrong After RAS+ Normalization

**What goes wrong:** Even after `as_closest_canonical()`, the displayed image appears flipped or mirrored compared to what users expect from ITK-SNAP.
**Why it happens:** Medical imaging convention typically displays axial with the patient's left on the viewer's right (radiological convention). Depending on the axis flip pattern after canonicalization, the display may need an additional horizontal flip to match radiological convention.
**How to avoid:** After normalization, check that `nib.aff2axcodes(canonical.affine)` returns `('R', 'A', 'S')`. If it returns `('L', 'A', 'S')` or another variant, the data may need axis flipping. Use a gold-standard test dataset (e.g., MNI152 template) where anatomical landmarks are known.
**Warning signs:** Left-right appears swapped compared to ITK-SNAP. A known left-sided lesion appears on the right.

### Pitfall 2: Array Memory Layout Mismatch (Fortran vs C Order)

**What goes wrong:** Slices appear garbled -- correct data but wrong pixel arrangement.
**Why it happens:** nibabel returns data in Fortran order by default (column-major). JavaScript TypedArrays interpret bytes as row-major (C order). If the server sends Fortran-order bytes and the client assumes C-order, every slice extraction will be wrong.
**How to avoid:** Always call `np.ascontiguousarray()` on the volume data before `.tobytes()` on the server. This converts Fortran order to C order. The Phase 1 research already specifies this, but it must be enforced.
**Warning signs:** Axial slice looks correct but coronal and sagittal are scrambled, or all views show diagonal stripe patterns.

### Pitfall 3: Float32 Window/Level Overflow

**What goes wrong:** Auto-windowed image appears mostly black or white for float32 data.
**Why it happens:** Float32 values may have extreme outliers (e.g., a few voxels at 1e+30 from padding). The 5th-95th percentile handles most cases, but if padding is exactly 0 and real data starts at 100, the 5th percentile might be 0 (from background) rather than the tissue range.
**How to avoid:** For auto-windowing, compute percentiles on non-zero voxels (or voxels above a small threshold) to exclude background padding. Provide the raw percentiles as metadata so the client can refine later.
**Warning signs:** Image opens as mostly black with a few bright spots, or entirely white.

### Pitfall 4: Slider Range Off-By-One

**What goes wrong:** Scrolling to the last slice index causes a blank image or crash.
**Why it happens:** Slider max set to `dim` instead of `dim - 1`, or slice extraction calculates offset past array bounds.
**How to avoid:** Slider range is always `[0, dim - 1]`. Slice extraction function should bounds-check the index.
**Warning signs:** Blank last slice, or JavaScript console error about array index out of bounds.

### Pitfall 5: Canvas Not Resized After Single-View Toggle

**What goes wrong:** Switching to single-view mode shows a tiny canvas in a large container, or the image is distorted.
**Why it happens:** The canvas internal dimensions and CSS dimensions are set during initial layout. After toggle, the container size changes but the canvas is not updated.
**How to avoid:** After any layout change (toggle, window resize), recalculate canvas CSS dimensions using the `setCanvasAspectRatio` function with the new available space. Use a ResizeObserver on the container for automatic handling.
**Warning signs:** Canvas stays at half-width in single-view mode.

### Pitfall 6: Ctrl+Drag Conflicts with Browser Zoom

**What goes wrong:** Ctrl+scroll zooms the browser page instead of scrolling slices. Ctrl+drag might trigger browser text selection or context menu.
**How to avoid:** Call `e.preventDefault()` on mousedown/mousemove when Ctrl is held. Do NOT intercept Ctrl+scroll (that should remain browser zoom for accessibility). Window/level is specifically Ctrl+drag only, not Ctrl+scroll. Test on macOS where Cmd is often used instead of Ctrl -- check both `e.ctrlKey` and `e.metaKey`.
**Warning signs:** Ctrl+drag causes text selection or does nothing.

## Code Examples

### Complete Slice Render Pipeline (Float32)

```javascript
// Source: First-principles from Canvas 2D API + medical imaging conventions

// Pre-allocate reusable buffers per panel
class ViewerPanel {
    constructor(canvas, axis, state) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.ctx.imageSmoothingEnabled = false;
        this.axis = axis; // 'axial' | 'coronal' | 'sagittal'
        this.state = state;
        this.imageData = null; // lazily created when dimensions known
    }

    setVolume(volume, dims, spacing) {
        this.volume = volume; // Float32Array
        this.dims = dims;     // [dimX, dimY, dimZ]
        this.spacing = spacing; // [spX, spY, spZ]

        const [w, h, spH, spV] = this.getSliceDims();
        this.canvas.width = w;
        this.canvas.height = h;
        this.imageData = this.ctx.createImageData(w, h);

        // Set CSS display size for anisotropic correction
        this.updateDisplaySize();
    }

    getSliceDims() {
        const [dx, dy, dz] = this.dims;
        const [sx, sy, sz] = this.spacing;
        switch (this.axis) {
            case 'axial':    return [dx, dy, sx, sy];
            case 'coronal':  return [dx, dz, sx, sz];
            case 'sagittal': return [dy, dz, sy, sz];
        }
    }

    render() {
        if (!this.volume || !this.imageData) return;
        const [cx, cy, cz] = this.state.cursor;
        const rgba = this.imageData.data;
        const wc = this.state.windowCenter;
        const ww = this.state.windowWidth;
        const halfW = ww / 2;
        const minV = wc - halfW;
        const vol = this.volume;
        const [dx, dy, dz] = this.dims;

        let sliceIdx, width, height;
        switch (this.axis) {
            case 'axial':
                sliceIdx = cz; width = dx; height = dy;
                for (let row = 0; row < dy; row++) {
                    const srcBase = sliceIdx * dx * dy + row * dx;
                    const dstBase = row * dx * 4;
                    for (let col = 0; col < dx; col++) {
                        const raw = vol[srcBase + col];
                        const scaled = ((raw - minV) / ww) * 255;
                        const val = scaled < 0 ? 0 : scaled > 255 ? 255 : scaled;
                        const j = dstBase + col * 4;
                        rgba[j] = rgba[j+1] = rgba[j+2] = val;
                        rgba[j+3] = 255;
                    }
                }
                break;
            case 'coronal':
                sliceIdx = cy; width = dx; height = dz;
                for (let z = 0; z < dz; z++) {
                    const srcBase = sliceIdx * dx + z * dx * dy;
                    const dstBase = z * dx * 4;
                    for (let col = 0; col < dx; col++) {
                        const raw = vol[srcBase + col];
                        const scaled = ((raw - minV) / ww) * 255;
                        const val = scaled < 0 ? 0 : scaled > 255 ? 255 : scaled;
                        const j = dstBase + col * 4;
                        rgba[j] = rgba[j+1] = rgba[j+2] = val;
                        rgba[j+3] = 255;
                    }
                }
                break;
            case 'sagittal':
                sliceIdx = cx; width = dy; height = dz;
                for (let z = 0; z < dz; z++) {
                    for (let y = 0; y < dy; y++) {
                        const raw = vol[sliceIdx + y * dx + z * dx * dy];
                        const scaled = ((raw - minV) / ww) * 255;
                        const val = scaled < 0 ? 0 : scaled > 255 ? 255 : scaled;
                        const j = (z * dy + y) * 4;
                        rgba[j] = rgba[j+1] = rgba[j+2] = val;
                        rgba[j+3] = 255;
                    }
                }
                break;
        }
        this.ctx.putImageData(this.imageData, 0, 0);
    }
}
```

### Server-Side Auto-Windowing Metadata

```python
# Source: numpy.percentile docs + medical imaging convention
import numpy as np

def compute_auto_window(data: np.ndarray) -> dict:
    """Compute auto window/level from 5th-95th percentile.

    Excludes zero-padding to avoid skewing toward background.
    """
    # Mask out likely background (zeros in padded regions)
    nonzero = data[data != 0] if np.count_nonzero(data) > 0 else data
    p5 = float(np.percentile(nonzero, 5))
    p95 = float(np.percentile(nonzero, 95))
    return {
        "window_center": (p5 + p95) / 2,
        "window_width": max(p95 - p5, 1),  # avoid zero width
        "percentile_5": p5,
        "percentile_95": p95,
    }
```

### W/L Preset Values

```javascript
// Source: Standard radiology window/level presets
// Convention: {name, center (level), width (window)}
const CT_PRESETS = [
    { name: 'Brain',  center: 40,   width: 80   },
    { name: 'Bone',   center: 500,  width: 3000 },
    { name: 'Lung',   center: -500, width: 1000 },
    { name: 'Abd',    center: 125,  width: 450  },
];

// WLVL-03 spec says: Brain (0-80), Bone (-1000 to +2000), Lung (-1000 to 0), Abd (-100 to +350)
// Converting min-max to center-width:
// Brain: center = (0+80)/2 = 40, width = 80
// Bone:  center = (-1000+2000)/2 = 500, width = 3000
// Lung:  center = (-1000+0)/2 = -500, width = 1000
// Abd:   center = (-100+350)/2 = 125, width = 450
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| WebGL-based slice rendering | Canvas 2D `putImageData` sufficient for 2D slices | N/A (both valid) | WebGL adds complexity without benefit for pure 2D slice display; Canvas 2D achieves <5ms per 512x512 frame |
| Client-side NIfTI parsing (nifti-reader-js) | Server-side parsing + binary transfer | N/A (architecture choice) | Server handles all format complexity; client receives clean typed arrays |
| OffscreenCanvas for worker rendering | Main-thread rendering sufficient for slice display | 2023+ | OffscreenCanvas is useful for heavy compositing but overkill for single-slice putImageData |

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Manual browser testing (primary); pytest for server-side changes |
| Config file | server/pyproject.toml `[tool.pytest]` (from Phase 1) |
| Quick run command | `cd server && uv run pytest tests/ -x -q` (server); manual browser test (client) |
| Full suite command | `cd server && uv run pytest tests/ -v` |

### Phase Requirements to Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| VIEW-01 | 4-panel layout visible | manual | Open browser, verify 4-panel grid | manual-only (DOM/visual) |
| VIEW-02 | Each view starts at center slice | manual + unit | Verify initial cursor = [dimX/2, dimY/2, dimZ/2] | Wave 0 (JS unit test) |
| VIEW-03 | Sliders navigate slices | manual | Move slider, verify slice updates | manual-only |
| VIEW-04 | A/C/S single-view toggle; + returns | manual | Click buttons, verify layout changes | manual-only |
| VIEW-05 | Full volume in browser memory | manual | DevTools: verify ArrayBuffer present + correct size | manual-only |
| VIEW-06 | Anisotropic voxel spacing correct | manual + unit | Load anisotropic data, verify sphere appears round | Wave 0 (aspect ratio calc test) |
| VIEW-07 | Crosshair sync across views | manual | Click in axial, verify coronal+sagittal update | manual-only |
| WLVL-01 | Auto W/L on open (5th-95th percentile) | integration | `uv run pytest tests/test_api.py::test_auto_window_metadata -x` | Wave 0 |
| WLVL-02 | Ctrl+drag W/L adjustment | manual | Ctrl+drag on canvas, verify image brightness/contrast changes | manual-only |
| WLVL-03 | W/L presets (Brain, Bone, Lung, Abd) | manual | Click preset button, verify image changes | manual-only |
| WLVL-04 | Presets shown only for CT | manual | Load CT vs MR volume, verify preset visibility | manual-only |

### Sampling Rate
- **Per task commit:** `cd server && uv run pytest tests/ -x -q` (server changes)
- **Per wave merge:** `cd server && uv run pytest tests/ -v` + manual browser verification of all views
- **Phase gate:** Full suite green + manual verification of all 5 success criteria

### Wave 0 Gaps
- [ ] Server test for RAS+ normalization: `server/tests/test_orientation.py` -- load synthetic NIfTI with non-RAS orientation, verify `as_closest_canonical` produces RAS output
- [ ] Server test for auto-windowing metadata: add percentile fields to volume metadata endpoint response
- [ ] JS unit tests for slice extraction math: verify axial/coronal/sagittal extraction on a small known array (can use Node.js test runner or inline assertions)

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Python 3.12 | Server runtime | Yes | 3.12.2 | -- |
| uv | Package management | Yes | 0.10.2 | -- |
| Node.js | Client build/dev | Yes | 25.6.1 | -- |
| npm | Client packages | Yes | 11.9.0 | -- |
| Modern browser | Canvas 2D API, CSS Grid | Yes (dev machine) | -- | -- |

**Missing dependencies with no fallback:** None.
**Missing dependencies with fallback:** None.

## Open Questions

1. **Radiological vs neurological display convention**
   - What we know: Radiologists expect left-right flipped display (patient's left = viewer's right). Neuroimaging tools sometimes use neurological convention (left = left).
   - What's unclear: Which convention the target users (researchers and radiologists) expect.
   - Recommendation: Default to radiological convention (flip X axis in axial and coronal views). This matches ITK-SNAP's default. Can add a toggle later if needed.

2. **Crosshair visual rendering**
   - What we know: VIEW-07 requires crosshair synchronization. The requirement says "clicking in one view updates the crosshair position in other views."
   - What's unclear: Whether crosshairs should be drawn as visible lines on the canvas or if just the slice position updating is sufficient.
   - Recommendation: Draw thin crosshair lines (1px, yellow or green) on each panel showing the intersection of the other two slice planes. This is the standard radiology viewer behavior and provides clear visual feedback.

3. **DICOM volume RAS+ normalization**
   - What we know: Phase 1 DICOM loader assembles slices by ImagePositionPatient. The resulting axis order depends on the scan acquisition.
   - What's unclear: Whether the DICOM loader output needs the same RAS+ normalization as NIfTI.
   - Recommendation: Yes. After assembling the DICOM volume, compute an affine matrix from ImageOrientationPatient + ImagePositionPatient + PixelSpacing, create a nibabel-compatible Nifti1Image, and apply `as_closest_canonical()`. This ensures consistent axis order regardless of input format.

## Sources

### Primary (HIGH confidence)
- [nibabel image_orientation documentation](https://nipy.org/nibabel/image_orientation.html) -- as_closest_canonical, aff2axcodes usage
- [MDN CanvasRenderingContext2D.putImageData()](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/putImageData) -- Canvas 2D API
- [MDN ImageData](https://developer.mozilla.org/en-US/docs/Web/API/ImageData) -- ImageData constructor and Uint8ClampedArray backing
- [numpy.percentile documentation](https://numpy.org/doc/stable/reference/generated/numpy.percentile.html) -- percentile calculation
- [SUNY Upstate Radiology - Window/Level](https://www.upstate.edu/radiology/education/rsna/intro/display.php) -- standard W/L conventions

### Secondary (MEDIUM confidence)
- [Understanding 3D medical image orientation for programmers](https://medium.com/@ashkanpakzad/understanding-3d-medical-image-orientation-for-programmers-fcf79c7beed0) -- orientation concepts
- [Understanding coordinate systems and DICOM](https://theaisummer.com/medical-image-coordinates/) -- RAS vs LPS conventions
- [NCB PMC Magician's Corner - Image Wrangling](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8017408/) -- percentile-based windowing in medical imaging

### Tertiary (LOW confidence)
- Crosshair synchronization pattern -- inferred from Cornerstone.js and Weasis documentation descriptions, not from reading source code

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH -- no new libraries needed; Canvas 2D API and nibabel are well-documented and stable
- Architecture: HIGH -- patterns (LUT windowing, CSS aspect ratio, RAS+ normalization, shared-state crosshairs) are established in the medical imaging domain
- Pitfalls: HIGH -- orientation and anisotropy pitfalls are the most documented issues in the domain (PITFALLS.md)
- Slice extraction math: HIGH -- basic 3D array indexing, verified against C-order conventions

**Research date:** 2026-03-24
**Valid until:** 2026-04-24 (stable domain, no fast-moving dependencies)
