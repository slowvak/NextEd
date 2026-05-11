/**
 * labelFilter.js — Morphological and connectivity operations on segmentation masks.
 *
 * All operations work on a snapshot of segVolume so neighbours are always
 * read from the original data regardless of write order.
 */

/**
 * @param {Uint8Array} segVolume   - segmentation volume (modified in place)
 * @param {number[]}   dims        - [dimX, dimY, dimZ]
 * @param {Object}     options
 *   mode:         '2d' | '3d'
 *   filterType:   'erode' | 'dilate' | 'largest_connected'
 *   applyTo:      'slice' | 'volume'
 *   sliceZ:       number
 *   labelVal:     number  — label value to operate on
 *   kernelSizeXY: number  — XY neighbourhood radius (from prefs)
 *   kernelSizeZ:  number  — Z neighbourhood radius (from prefs, ignored for 2d)
 * @param {function}   onProgress  — called with 0..1
 */
export async function applyLabelFilter(segVolume, dims, options, onProgress) {
  const { mode, filterType, applyTo, sliceZ, labelVal } = options;
  const ksXY = options.kernelSizeXY ?? 3;
  const ksZ  = options.kernelSizeZ  ?? ksXY;

  if (filterType === 'largest_connected') {
    await _largestConnected(segVolume, dims, mode, applyTo, sliceZ, labelVal, onProgress);
  } else {
    await _morphOp(segVolume, dims, mode, filterType, ksXY, ksZ, applyTo, sliceZ, labelVal, onProgress);
  }

  // Zero out label values outside [min, max] over the processed region
  if (options.threshold?.enabled) {
    const [dimX, dimY] = dims;
    const sliceSize = dimX * dimY;
    const tMin = options.threshold.min, tMax = options.threshold.max;
    const iStart = (options.applyTo === 'slice' ? sliceZ : 0) * sliceSize;
    const iEnd   = (options.applyTo === 'slice' ? sliceZ + 1 : dims[2]) * sliceSize;
    for (let i = iStart; i < iEnd; i++) {
      const v = segVolume[i];
      if (v !== 0 && (v < tMin || v > tMax)) segVolume[i] = 0;
    }
  }
}

// ── Morphological erode / dilate ─────────────────────────────────────────────

async function _morphOp(segVolume, dims, mode, filterType, ksXY, ksZ, applyTo, sliceZ, labelVal, onProgress) {
  const [dimX, dimY, dimZ] = dims;
  const sliceSize = dimX * dimY;
  const hXY = (ksXY - 1) >> 1;
  const hZ  = mode === '3d' ? ((ksZ - 1) >> 1) : 0;

  const zStart = applyTo === 'slice' ? sliceZ : 0;
  const zEnd   = applyTo === 'slice' ? sliceZ + 1 : dimZ;
  const nZ = zEnd - zStart;

  const src = new Uint8Array(segVolume); // snapshot — neighbours read from original

  for (let z = zStart; z < zEnd; z++) {
    for (let y = 0; y < dimY; y++) {
      for (let x = 0; x < dimX; x++) {
        const idx = z * sliceSize + y * dimX + x;

        if (filterType === 'erode') {
          if (src[idx] !== labelVal) continue;
          let remove = false;
          outer: for (let dz = -hZ; dz <= hZ && !remove; dz++) {
            const nz = z + dz;
            if (nz < 0 || nz >= dimZ) { remove = true; break; }
            for (let dy = -hXY; dy <= hXY && !remove; dy++) {
              const ny = y + dy;
              if (ny < 0 || ny >= dimY) { remove = true; break outer; }
              for (let dx = -hXY; dx <= hXY; dx++) {
                const nx = x + dx;
                if (nx < 0 || nx >= dimX) { remove = true; break outer; }
                if (src[nz * sliceSize + ny * dimX + nx] !== labelVal) { remove = true; break outer; }
              }
            }
          }
          if (remove) segVolume[idx] = 0;

        } else { // dilate — only expand into background
          if (src[idx] !== 0) continue;
          let add = false;
          outer2: for (let dz = -hZ; dz <= hZ; dz++) {
            const nz = z + dz;
            if (nz < 0 || nz >= dimZ) continue;
            for (let dy = -hXY; dy <= hXY; dy++) {
              const ny = y + dy;
              if (ny < 0 || ny >= dimY) continue;
              for (let dx = -hXY; dx <= hXY; dx++) {
                const nx = x + dx;
                if (nx < 0 || nx >= dimX) continue;
                if (src[nz * sliceSize + ny * dimX + nx] === labelVal) { add = true; break outer2; }
              }
            }
          }
          if (add) segVolume[idx] = labelVal;
        }
      }
    }

    onProgress((z - zStart + 1) / nZ);
    await new Promise(r => setTimeout(r, 0));
  }
}

// ── Largest connected component ───────────────────────────────────────────────

async function _largestConnected(segVolume, dims, mode, applyTo, sliceZ, labelVal, onProgress) {
  const [dimX, dimY, dimZ] = dims;
  const sliceSize = dimX * dimY;

  if (mode === '2d') {
    const zStart = applyTo === 'slice' ? sliceZ : 0;
    const zEnd   = applyTo === 'slice' ? sliceZ + 1 : dimZ;
    const nZ = zEnd - zStart;
    for (let z = zStart; z < zEnd; z++) {
      _keepLargest2D(segVolume, dimX, dimY, z * sliceSize, labelVal);
      onProgress((z - zStart + 1) / nZ);
      await new Promise(r => setTimeout(r, 0));
    }
  } else {
    _keepLargest3D(segVolume, dims, labelVal);
    onProgress(1);
  }
}

function _keepLargest2D(seg, w, h, offset, labelVal) {
  const visited = new Uint8Array(w * h);
  const components = [];

  for (let i = 0; i < w * h; i++) {
    if (seg[offset + i] !== labelVal || visited[i]) continue;
    const pixels = [];
    const queue = [i];
    visited[i] = 1;
    let qi = 0;
    while (qi < queue.length) {
      const ci = queue[qi++];
      pixels.push(ci);
      const cx = ci % w, cy = (ci / w) | 0;
      if (cx > 0     && !visited[ci - 1] && seg[offset + ci - 1] === labelVal) { visited[ci - 1] = 1; queue.push(ci - 1); }
      if (cx < w - 1 && !visited[ci + 1] && seg[offset + ci + 1] === labelVal) { visited[ci + 1] = 1; queue.push(ci + 1); }
      if (cy > 0     && !visited[ci - w] && seg[offset + ci - w] === labelVal) { visited[ci - w] = 1; queue.push(ci - w); }
      if (cy < h - 1 && !visited[ci + w] && seg[offset + ci + w] === labelVal) { visited[ci + w] = 1; queue.push(ci + w); }
    }
    components.push(pixels);
  }

  if (components.length <= 1) return;
  let best = 0;
  for (let i = 1; i < components.length; i++) if (components[i].length > components[best].length) best = i;
  for (let i = 0; i < components.length; i++) {
    if (i === best) continue;
    for (const pi of components[i]) seg[offset + pi] = 0;
  }
}

function _keepLargest3D(seg, dims, labelVal) {
  const [dimX, dimY, dimZ] = dims;
  const sliceSize = dimX * dimY;
  const total = sliceSize * dimZ;
  const visited = new Uint8Array(total);
  const components = [];

  for (let i = 0; i < total; i++) {
    if (seg[i] !== labelVal || visited[i]) continue;
    const pixels = [];
    const queue = [i];
    visited[i] = 1;
    let qi = 0;
    while (qi < queue.length) {
      const ci = queue[qi++];
      pixels.push(ci);
      const z = (ci / sliceSize) | 0;
      const r = ci % sliceSize;
      const y = (r / dimX) | 0;
      const x = r % dimX;
      const neighbours = [
        x > 0       ? ci - 1          : -1,
        x < dimX-1  ? ci + 1          : -1,
        y > 0       ? ci - dimX       : -1,
        y < dimY-1  ? ci + dimX       : -1,
        z > 0       ? ci - sliceSize  : -1,
        z < dimZ-1  ? ci + sliceSize  : -1,
      ];
      for (const ni of neighbours) {
        if (ni >= 0 && !visited[ni] && seg[ni] === labelVal) { visited[ni] = 1; queue.push(ni); }
      }
    }
    components.push(pixels);
  }

  if (components.length <= 1) return;
  let best = 0;
  for (let i = 1; i < components.length; i++) if (components[i].length > components[best].length) best = i;
  for (let i = 0; i < components.length; i++) {
    if (i === best) continue;
    for (const pi of components[i]) seg[pi] = 0;
  }
}
