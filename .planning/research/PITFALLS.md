# Domain Pitfalls

**Domain:** Web-based medical image viewer/editor (NIfTI + DICOM)
**Researched:** 2026-03-24
**Confidence:** MEDIUM (based on established domain knowledge from mature projects like Cornerstone.js, OHIF, Papaya, niivue; web search unavailable for latest findings)

---

## Critical Pitfalls

Mistakes that cause rewrites, data corruption, or clinical/research errors.

### Pitfall 1: NIfTI Orientation / Affine Mishandling

**What goes wrong:** Slices display flipped, mirrored, or in the wrong anatomical plane. Left-right confusion is the most dangerous variant -- a segmentation labeled "left kidney" is actually the right kidney. This is the single most common bug in medical image viewers and has caused real clinical harm in other software.

**Why it happens:** NIfTI files encode orientation through a 4x4 affine matrix (`sform` or `qform`) that maps voxel indices (i,j,k) to patient coordinates (typically RAS or LPS). Developers frequently:
- Assume voxel array axis 0 = axial, axis 1 = coronal, axis 2 = sagittal (wrong -- it depends on the affine)
- Ignore the `qform`/`sform` code priority rules (sform_code > 0 takes priority; fall back to qform; fall back to analyze-era assumptions)
- Confuse RAS (NIfTI convention: Right-Anterior-Superior) with LPS (DICOM convention: Left-Posterior-Superior), flipping left-right
- Forget that oblique acquisitions have non-axis-aligned affine matrices (off-diagonal elements are nonzero)
- Index the data array in C-order vs Fortran-order incorrectly when the volume is read by nibabel (which returns Fortran-order by default)

**Consequences:** Segmentations painted on the wrong anatomy. Coordinates exported from the tool do not match other software. Researchers publish incorrect laterality.

**Warning signs:**
- Segmentation from ITK-SNAP looks flipped when loaded in your viewer
- Crosshair coordinates do not match known anatomy landmarks
- Coronal and sagittal views appear swapped or mirrored for some datasets but not others

**Prevention:**
1. Use a "gold standard" test dataset with a known asymmetric marker (e.g., a single bright voxel at a known RAS coordinate) and verify it displays in the correct position in all three planes
2. Always derive display orientation from the affine matrix, never hardcode axis assumptions
3. Compute the "closest axis" for each voxel dimension from the affine to determine which anatomical plane each array axis most closely represents
4. For oblique volumes, either resample to axis-aligned (simple but lossy) or handle oblique slicing (complex but correct)
5. Test with at least: (a) standard axial CT, (b) NIfTI saved from nibabel with RAS orientation, (c) NIfTI re-oriented to a non-standard axis order (e.g., SLA), (d) DICOM-converted NIfTI from dcm2niix

**Detection:** Automated test that loads a synthetic volume with a single marked voxel at known (i,j,k) = known (R,A,S) and asserts correct pixel position in each view.

**Phase relevance:** Must be correct from the very first slice-rendering milestone. Retrofitting orientation handling into a viewer that assumed axis order is a rewrite.

---

### Pitfall 2: Browser Memory Exhaustion from Volume Data

**What goes wrong:** The browser tab crashes, goes blank, or becomes unresponsive when loading a volume. A 512x512x400 volume at 2 bytes/voxel (int16) = ~200 MB. Add a uint8 segmentation mask (~100 MB), undo buffers (up to 3 x 100 MB), plus working copies for windowing/display = easily 700 MB - 1 GB per session. Many browsers and systems will choke.

**Why it happens:**
- Developers allocate JavaScript arrays instead of TypedArrays (10x memory overhead for regular arrays)
- Multiple copies of volume data exist unintentionally (raw transfer buffer + parsed array + display-ready copy)
- Undo is implemented by deep-copying the entire segmentation volume (3 undos = 3 x 100 MB)
- ArrayBuffer from fetch response is not freed because a reference is retained
- The volume is decoded on the main thread, blocking UI during decompression of .nii.gz

**Consequences:** Tab crash on large volumes, especially on machines with 8 GB RAM. Unresponsive UI during load.

**Warning signs:**
- Chrome DevTools Memory tab shows >1 GB heap for a single volume
- Performance degrades noticeably after loading 2-3 volumes in the same session without refresh
- Undo becomes slow or crashes

**Prevention:**
1. Use TypedArrays exclusively (Int16Array for image data, Uint8Array for masks)
2. Transfer volume data as raw binary (ArrayBuffer), not JSON-encoded arrays
3. Decompress .nii.gz in a Web Worker so the main thread stays responsive
4. Implement undo as delta/diff storage (only store changed voxels per undo step, not full volume copies) -- for a paintbrush on one slice, this is ~512x512 bytes worst case vs 100 MB for a full copy
5. Explicitly null out references to intermediate buffers after parsing
6. Set a volume size warning threshold (e.g., >500 MB estimated) and show the user a confirmation dialog

**Detection:** Load a 512x512x400 int16 volume + segmentation, paint on 10 slices, undo 3 times. Monitor memory in DevTools. Should stay under 800 MB.

**Phase relevance:** Architecture decision from Phase 1 (data transfer format and memory layout). Undo strategy must be decided before implementing editing tools.

---

### Pitfall 3: Voxel Spacing Anisotropy Ignored in Display and Tools

**What goes wrong:** Coronal and sagittal views appear stretched or squashed. Paintbrush creates circles in axial view but ovals in coronal. Region grow expands further in Z than X/Y. The viewer "works" for isotropic MRI data but looks wrong for CT where Z spacing (slice thickness) is often 1-5 mm while X/Y is 0.5-1 mm.

**Why it happens:** Developers implement all views assuming cubic voxels. They render each voxel as one pixel in all planes, so a voxel that is 0.5 x 0.5 x 2.5 mm appears square instead of 5x elongated in the Z direction.

**Consequences:** Anatomical proportions are distorted. Measurements are wrong. Segmentation tools behave inconsistently across planes. Researchers accustomed to ITK-SNAP (which handles this correctly) will immediately notice and distrust the tool.

**Warning signs:**
- A sphere in the data (e.g., a round lesion) appears as an ellipse in coronal/sagittal views
- Paintbrush radius does not visually match across views
- Users report "everything looks squished" on CT data

**Prevention:**
1. Always scale display pixels by the voxel spacing ratio when rendering non-axial planes. For sagittal view, each pixel row represents Z spacing and each column represents Y spacing, so aspect ratio = spacing_z / spacing_y
2. Apply aspect ratio correction at the canvas rendering level using `ctx.drawImage()` with explicit width/height, or use CSS `transform: scale()`
3. For painting tools, convert brush radius from mm to voxels per-axis before applying
4. Test with a deliberately anisotropic dataset (e.g., spacing 1.0 x 1.0 x 5.0 mm)

**Detection:** Load dataset with known anisotropic spacing. Verify a spherical structure appears round in all three views.

**Phase relevance:** Must be implemented in the initial slice rendering phase. Adding it later requires reworking all canvas drawing code and all tool coordinate math.

---

### Pitfall 4: DICOM Parsing Edge Cases and Series Grouping Failures

**What goes wrong:** DICOM volumes load with slices in the wrong order, missing slices, mixed series, or wrong pixel values. This corrupts the 3D volume silently -- the data looks like valid images but the anatomy is scrambled.

**Why it happens:**
- Slice ordering by InstanceNumber (0020,0013) instead of ImagePositionPatient (0020,0032). InstanceNumber is unreliable and can be duplicated or non-sequential across series
- Series grouping by SeriesInstanceUID alone is insufficient. Some scanners put multiple temporal phases or different reconstructions in the same series
- RescaleSlope (0028,1053) and RescaleIntercept (0028,1052) not applied, so CT Hounsfield units are wrong (raw stored values instead of calibrated)
- Assuming all slices in a series have the same dimensions, spacing, or orientation (localizer/scout images can sneak in)
- PhotometricInterpretation not handled (MONOCHROME1 vs MONOCHROME2 inversion)
- BitsAllocated/BitsStored/HighBit handled incorrectly for 12-bit data packed in 16-bit words
- Transfer syntax not checked -- compressed DICOM (JPEG, JPEG2000, RLE) passed to a parser expecting raw

**Consequences:** Scrambled anatomy, wrong Hounsfield values (breaks windowing presets), missing or duplicated slices, inverted contrast.

**Warning signs:**
- Discontinuities visible when scrolling through slices (anatomy "jumps")
- CT window/level presets look wrong (e.g., bone window shows soft tissue range)
- Volume slice count does not match expected number from DICOM metadata
- Some DICOM datasets load fine but others show garbled data

**Prevention:**
1. Sort slices by the Z component of ImagePositionPatient (0020,0032) projected onto the ImageOrientationPatient normal vector, not by InstanceNumber
2. Validate consistent slice spacing -- flag datasets with variable spacing as potential problems
3. Always apply RescaleSlope and RescaleIntercept: `pixel_value = raw * slope + intercept`
4. Sub-group series by ImageOrientationPatient + slice dimensions to separate localizers and different reconstructions
5. Handle PhotometricInterpretation: invert pixel values for MONOCHROME1
6. Use pydicom's pixel_array property (which handles BitsAllocated/Stored/HighBit) rather than reading raw bytes manually
7. Check TransferSyntaxUID early and reject or decompress compressed formats with clear error messages

**Detection:** Test suite with known-good DICOM series covering: standard CT, series with localizer mixed in, MONOCHROME1, 12-bit data, non-unit RescaleSlope.

**Phase relevance:** Server-side cataloging and volume loading phase. These must be correct before any client rendering can be trusted.

---

### Pitfall 5: Canvas Rendering Performance Bottleneck

**What goes wrong:** Scrolling through slices is laggy (>50ms per frame). Windowing adjustment (ctrl+drag) stutters. The viewer feels unresponsive compared to desktop tools, especially on large slices.

**Why it happens:**
- Re-computing windowed pixel values on the CPU for every frame. For a 512x512 slice, that is 262,144 pixels to window, clamp, and convert to RGBA every scroll event
- Using `putImageData()` which cannot be hardware-accelerated, instead of rendering to a texture
- Applying segmentation overlay by iterating pixels in JavaScript instead of using compositing
- Not using requestAnimationFrame, so multiple scroll events trigger multiple redundant renders
- Drawing all four panels on every interaction even when only one changed

**Consequences:** Users accustomed to 60fps scrolling in ITK-SNAP will find the tool unusable. Radiologists expect instant scroll response -- even 100ms latency is noticeable and frustrating.

**Warning signs:**
- Visible delay between mouse scroll and slice update
- CPU usage spikes to 100% on one core during scrolling
- Chrome Performance tab shows long "Scripting" blocks in the frame timeline

**Prevention:**
1. Pre-compute a windowed LUT (lookup table) of 65536 entries mapping raw int16 values to uint8 display values. Updating window/level only regenerates the LUT (cheap), not every pixel
2. Use `createImageBitmap()` + `drawImage()` pipeline instead of `putImageData()` for hardware acceleration potential
3. Alternatively, use WebGL for slice rendering: upload the raw slice as a texture, apply windowing in a fragment shader. This is the approach Cornerstone.js and niivue use for good reason
4. Throttle render calls with requestAnimationFrame -- never render more than once per frame
5. Only re-render the panel that changed (dirty flagging)
6. Composite segmentation overlay using canvas globalAlpha and `drawImage()` of a pre-rendered overlay, not pixel-by-pixel blending

**Detection:** Profile scrolling through 400 slices. Frame time should be <16ms (60fps). Measure with Chrome DevTools Performance recorder.

**Phase relevance:** Core rendering architecture decision. Must be decided in Phase 1 before any rendering code is written. Switching from Canvas2D to WebGL later is a near-complete rewrite of rendering.

---

### Pitfall 6: Segmentation Overlay Compositing Errors

**What goes wrong:** Segmentation masks appear offset from the underlying image, labels bleed into adjacent pixels, or overlay colors interact incorrectly with windowed image values. Mask boundaries appear "jagged" in unexpected ways.

**Why it happens:**
- Overlay rendered at a different resolution or coordinate system than the base image
- Nearest-neighbor interpolation not enforced for the segmentation layer (browser applies bilinear smoothing via `imageSmoothingEnabled`, which blurs discrete label boundaries and creates phantom intermediate label values)
- Transparency compositing done in sRGB space instead of linear, causing incorrect color blending at edges
- Segmentation array indexed with wrong axis order compared to the image volume (especially after orientation transforms)

**Consequences:** Painted labels do not align with the anatomy they were painted on. Label colors look wrong at boundaries. Users cannot trust that what they see matches what will be saved.

**Warning signs:**
- Segmentation appears shifted by 1 pixel relative to the anatomy
- Label boundaries look "smoothed" or show intermediate colors not in the palette
- Loading a segmentation made in ITK-SNAP shows it offset

**Prevention:**
1. Always set `ctx.imageSmoothingEnabled = false` when rendering segmentation overlays -- labels are categorical, not continuous
2. Use identical coordinate transforms for image and segmentation rendering
3. Verify segmentation dimensions match image dimensions at load time and reject mismatches with a clear error
4. Render segmentation to a separate offscreen canvas and composite via `globalAlpha` and `drawImage()` -- this keeps the compositing clean and easily adjustable
5. Test with a segmentation that has a single labeled voxel at a known position and verify it overlays the correct pixel

**Detection:** Paint a single voxel, scroll away and back, verify it is on the same pixel. Load a known segmentation from ITK-SNAP and verify alignment.

**Phase relevance:** Overlay rendering phase. Must be correct before segmentation editing tools are built on top.

---

## Moderate Pitfalls

### Pitfall 7: Volume Data Transfer Format Bloat

**What goes wrong:** Loading a volume takes 10-30 seconds even on localhost because the server serializes volume data as JSON or base64-encoded arrays instead of raw binary.

**Why it happens:** Developers default to JSON APIs for everything. A 200 MB int16 volume becomes ~600 MB as JSON array of numbers, or ~270 MB as base64 -- plus the parsing overhead on both ends.

**Prevention:**
1. Serve volume data as raw binary ArrayBuffer via a binary endpoint (e.g., `GET /volumes/{id}/data` returning `application/octet-stream`)
2. Include metadata (dimensions, dtype, spacing, affine) in a separate JSON response or HTTP headers
3. On the client, use `fetch()` with `.arrayBuffer()` and wrap in the appropriate TypedArray
4. For .nii.gz, consider streaming the gzipped data to the client and decompressing in a Web Worker using pako or DecompressionStream API, rather than decompressing server-side and sending raw (saves transfer time on non-localhost deployments)

**Detection:** Time volume load from click to display. Target: <2 seconds for a 200 MB volume on localhost.

**Phase relevance:** API design in Phase 1. Changing transfer format later means changing both server endpoints and client parsing.

---

### Pitfall 8: Undo Implementation as Full Volume Snapshots

**What goes wrong:** Undo works for the first action, but the second or third undo causes a crash or extreme memory spike. Each undo level stores a complete copy of the segmentation volume.

**Why it happens:** The naive undo implementation (push a copy of the entire array onto an undo stack) is simple and correct, but 3 undo levels x 100 MB = 300 MB of undo storage alone.

**Prevention:**
1. Store undo as sparse diffs: record only the (x, y, z, old_value) tuples that changed
2. For paintbrush operations, the diff is bounded by the brush footprint x slice count -- typically <100 KB per operation
3. For region grow (which can change many voxels), consider storing the bounding box of affected region and only snapshotting that sub-volume
4. Implement undo as a stack of reverse-diffs: to undo, apply the stored changes in reverse

**Detection:** Paint on 10 slices, undo 3 times, check memory usage. Should not grow by more than a few MB.

**Phase relevance:** Must be designed before implementing any editing tool. All tools must record their diffs through a common undo interface.

---

### Pitfall 9: Window/Level Calculation Errors for Non-Standard Data

**What goes wrong:** Window/level presets produce wrong results. Auto-windowing shows a mostly black or mostly white image. Negative pixel values (CT Hounsfield units, which range from -1024 to +3071) are handled incorrectly.

**Why it happens:**
- Treating pixel data as unsigned when it is signed (CT data is typically int16 with negative values for air/lung)
- Auto-windowing percentile calculation on the entire volume including background padding (e.g., zeros outside the FOV dominate the histogram)
- LUT indexed with raw pixel value without offset for negative values (array index -500 does not work)

**Prevention:**
1. Determine signedness from NIfTI header (datatype field) or DICOM PixelRepresentation tag and use the correct TypedArray (Int16Array vs Uint16Array)
2. For auto-windowing percentile calculation, mask out background (e.g., exclude voxels below -900 HU for CT or above a padding threshold)
3. For the LUT, offset negative values: `lut_index = pixel_value - min_possible_value`
4. Test with CT data (has negatives, needs RescaleIntercept) and MR data (typically unsigned, wider dynamic range)

**Detection:** Load a CT chest scan. Lung window preset should show lung detail. Brain window should show soft tissue. If the entire image is white or black with a preset, windowing is broken.

**Phase relevance:** Rendering phase, immediately after basic slice display works.

---

### Pitfall 10: Main Thread Blocking During Volume Load and Processing

**What goes wrong:** The UI freezes for 3-10 seconds while loading or processing a volume. No progress indicator. User thinks the app crashed.

**Why it happens:** Volume decompression (.nii.gz gunzip), array parsing, histogram computation, and initial rendering all happen on the main thread synchronously.

**Prevention:**
1. Use Web Workers for: decompression, array conversion, histogram calculation, region grow computation
2. Implement a loading progress indicator (even a simple spinner) that remains responsive during worker processing
3. Use `Transferable` objects when passing ArrayBuffers between main thread and workers to avoid copying
4. Break long-running operations into chunks using `setTimeout()` yielding if Web Workers are not feasible for a given operation

**Detection:** Load a 200 MB .nii.gz file and verify the UI remains responsive (spinner animates, buttons are clickable) during the entire load.

**Phase relevance:** Architecture decision in Phase 1. Retrofitting Web Workers into synchronous code requires restructuring all data loading paths.

---

### Pitfall 11: Coordinate System Mismatch Between NIfTI and DICOM Sources

**What goes wrong:** A segmentation created on a NIfTI-loaded volume does not align when the same scan is loaded from DICOM (or vice versa). Coordinates from the viewer do not match coordinates in other tools.

**Why it happens:** NIfTI uses RAS+ (Right-Anterior-Superior positive direction) by convention. DICOM uses LPS+ (Left-Posterior-Superior). If the viewer does not normalize to a common coordinate system, the same data displays differently depending on the source format.

**Prevention:**
1. Normalize all loaded volumes to a single internal coordinate convention (RAS is the NIfTI standard and most common in neuroimaging tools)
2. When loading DICOM, convert ImageOrientationPatient and ImagePositionPatient from LPS to RAS (negate X and Y components)
3. When saving segmentation from a DICOM source as NIfTI, ensure the affine is in RAS convention
4. When saving as DICOM-SEG, convert back to LPS
5. Document the internal convention explicitly in the codebase

**Detection:** Load the same scan as both NIfTI (via dcm2niix conversion) and DICOM. Verify identical display. Create a segmentation on one, load it on the other, verify alignment.

**Phase relevance:** Must be decided in the server-side data loading phase and enforced consistently. Mixing conventions leads to subtle bugs that are extremely hard to debug later.

---

## Minor Pitfalls

### Pitfall 12: Paintbrush Multi-Slice Behavior at Volume Boundaries

**What goes wrong:** Painting with a multi-slice brush near the first or last slice causes an array index out-of-bounds error or silently wraps around to the opposite end of the volume.

**Prevention:**
1. Clamp the multi-slice range to valid slice indices: `start = max(0, current - n)`, `end = min(max_slice, current + n)`
2. Unit test brush at slice 0, slice max, and mid-volume

**Detection:** Paint with a 5-slice brush on slice 0 and on the last slice. Should not crash or paint on unexpected slices.

**Phase relevance:** Painting tool implementation phase.

---

### Pitfall 13: Label Integer Value Conflicts in Segmentation

**What goes wrong:** User changes a label's integer value to one already in use by another label. Or "add object" assigns a value that was previously used, deleted, and still exists in the mask data.

**Prevention:**
1. When changing a label's integer value, check for conflicts and warn/prevent
2. When auto-assigning values, scan existing values in the actual mask array, not just the label table
3. When relabeling (changing integer value), update all voxels with the old value -- this is specified in the requirements but easy to forget edge cases (undo buffer entries with old value, etc.)

**Detection:** Create label 1, paint it, create label 2, change label 2's value to 1. Should warn or prevent, not silently merge.

**Phase relevance:** Segmentation label management phase.

---

### Pitfall 14: Save/Export NIfTI Orientation Roundtrip Loss

**What goes wrong:** User loads a volume, creates a segmentation, saves it as .nii.gz. The saved segmentation opens correctly in NextEd but is misaligned in ITK-SNAP or 3D Slicer because the affine matrix was not preserved correctly.

**Prevention:**
1. When saving a segmentation NIfTI, copy the exact affine matrix from the source volume's header
2. Set sform_code and qform_code to match the source
3. Set datatype to uint8 and intent to NIFTI_INTENT_LABEL
4. Test roundtrip: save from NextEd, open in ITK-SNAP/nibabel, verify alignment matches

**Detection:** Save segmentation, load in external tool (even just `nibabel.load()` in a test script), verify header matches source.

**Phase relevance:** Save/export phase -- the last major feature, but must be tested against external tools.

---

### Pitfall 15: Otsu Threshold Sensitivity to ROI Placement

**What goes wrong:** Otsu threshold within ROI produces unexpected results when the ROI contains predominantly one tissue type (unimodal histogram), or when the "on class determined by border minority" heuristic fails on certain anatomies.

**Prevention:**
1. Validate that Otsu produces a meaningful threshold (check that both classes have nonzero members)
2. Show the user a preview before applying (or make it undoable, which is already required)
3. The border-minority heuristic for determining which class to paint should sample all border pixels, not just a subset
4. Consider falling back gracefully when Otsu cannot find a good bimodal split (e.g., warn the user)

**Detection:** Test Otsu on a uniform region (should degrade gracefully), on a clearly bimodal region (should work), and on a region where the border is mostly one class.

**Phase relevance:** ROI tools phase.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Server cataloging / DICOM loading | Slice ordering, series grouping, RescaleSlope | Test with diverse DICOM datasets; sort by ImagePositionPatient |
| Volume data transfer | JSON bloat, main thread blocking | Binary transfer, Web Worker decompression from Phase 1 |
| Core slice rendering | Orientation/affine wrong, anisotropy ignored, slow rendering | Gold-standard test datasets; LUT-based windowing; decide Canvas2D vs WebGL early |
| Segmentation overlay | Offset errors, interpolation smoothing, axis mismatch | Separate overlay canvas; imageSmoothingEnabled=false; same transform pipeline |
| Editing tools (paint/erase) | Memory from undo, multi-slice boundary, coordinate mapping | Sparse diff undo; clamp indices; tool coordinates in voxel space |
| ROI / Otsu / Region grow | Otsu edge cases, region grow unbounded, slow on main thread | Preview + undo; size limits on region grow; Web Worker for grow |
| Window/Level | Signed data, auto-windowing percentile skew, LUT for negatives | Correct TypedArray; mask background in percentile; offset LUT index |
| Save/Export | Affine roundtrip, DICOM-SEG complexity, label integrity | Copy source affine; test with external tools; validate labels before save |
| NIfTI-DICOM interop | RAS vs LPS, segmentation cross-format alignment | Single internal convention (RAS); convert at load/save boundaries |

---

## Sources

- Domain knowledge from established open-source projects: Cornerstone.js, OHIF Viewer, niivue, Papaya viewer, ITK-SNAP
- NIfTI-1 specification (nifti1.h header documentation)
- DICOM standard Part 3 (Information Object Definitions) for relevant tags
- Confidence: MEDIUM overall -- findings are based on well-documented patterns from mature medical imaging projects, but web search was unavailable to verify against the latest (2025-2026) developments
