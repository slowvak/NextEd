/**
 * Slice extraction from a flat 3D Float32Array volume in C-order (RAS+).
 *
 * Volume layout: index(x,y,z) = x + y*dimX + z*dimX*dimY
 * where x = R-L axis (+X = Right), y = A-P axis (+Y = Anterior), z = I-S axis (+Z = Superior)
 *
 * Display convention (radiological):
 *   Axial:    screen left = patient Right (high X), top = Anterior (high Y)
 *   Coronal:  screen left = patient Right (high X), top = Superior (high Z)
 *   Sagittal: screen left = patient Anterior (high Y), top = Superior (high Z)
 *
 * All extractors flip axes to match this convention.
 */

/**
 * Extract an axial slice (fixed z, varies x and y).
 * Flips X (left=Right) and Y (top=Anterior) for radiological display.
 */
export function extractAxialSlice(volume, z, dimX, dimY) {
  const offset = z * dimX * dimY;
  const slice = new Float32Array(dimX * dimY);
  for (let y = 0; y < dimY; y++) {
    const srcRow = offset + y * dimX;
    const dstRow = (dimY - 1 - y) * dimX; // Y-flip: anterior at top
    for (let x = 0; x < dimX; x++) {
      slice[dstRow + (dimX - 1 - x)] = volume[srcRow + x]; // X-flip: right on left
    }
  }
  return slice;
}

/**
 * Extract a coronal slice (fixed y, varies x and z).
 * Flips X (left=Right) and Z (top=Superior) for radiological display.
 */
export function extractCoronalSlice(volume, y, dimX, dimY, dimZ) {
  const slice = new Float32Array(dimX * dimZ);
  for (let z = 0; z < dimZ; z++) {
    const srcOffset = y * dimX + z * dimX * dimY;
    const dstRow = (dimZ - 1 - z) * dimX; // Z-flip: superior at top
    for (let x = 0; x < dimX; x++) {
      slice[dstRow + (dimX - 1 - x)] = volume[srcOffset + x]; // X-flip: right on left
    }
  }
  return slice;
}

/**
 * Extract a sagittal slice (fixed x, varies y and z).
 * Flips Y (left=Anterior) and Z (top=Superior) for radiological display.
 */
export function extractSagittalSlice(volume, x, dimX, dimY, dimZ) {
  const slice = new Float32Array(dimY * dimZ);
  for (let z = 0; z < dimZ; z++) {
    const dstRow = (dimZ - 1 - z) * dimY; // Z-flip: superior at top
    for (let y = 0; y < dimY; y++) {
      slice[dstRow + (dimY - 1 - y)] = volume[x + y * dimX + z * dimX * dimY]; // Y-flip: anterior on left
    }
  }
  return slice;
}
