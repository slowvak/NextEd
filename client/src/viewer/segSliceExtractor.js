/**
 * Slice extraction from a flat 3D Uint8Array segmentation volume in C-order (RAS+).
 *
 * Volume layout: index(x,y,z) = x + y*dimX + z*dimX*dimY
 * where x = R-L axis (+X = Right), y = A-P axis (+Y = Anterior), z = I-S axis (+Z = Superior)
 *
 * Display convention (radiological) — must match sliceExtractor.js flips:
 *   Axial:    X-flip (right on left), Y-flip (anterior at top)
 *   Coronal:  X-flip (right on left), Z-flip (superior at top)
 *   Sagittal: Y-flip (anterior on left), Z-flip (superior at top)
 */

export function extractAxialSegSlice(segVolume, z, dimX, dimY) {
  const offset = z * dimX * dimY;
  const slice = new Uint8Array(dimX * dimY);
  for (let y = 0; y < dimY; y++) {
    const srcRow = offset + y * dimX;
    const dstRow = (dimY - 1 - y) * dimX;
    for (let x = 0; x < dimX; x++) {
      slice[dstRow + (dimX - 1 - x)] = segVolume[srcRow + x];
    }
  }
  return slice;
}

export function extractCoronalSegSlice(segVolume, y, dimX, dimY, dimZ) {
  const slice = new Uint8Array(dimX * dimZ);
  for (let z = 0; z < dimZ; z++) {
    const srcOffset = y * dimX + z * dimX * dimY;
    const dstRow = (dimZ - 1 - z) * dimX;
    for (let x = 0; x < dimX; x++) {
      slice[dstRow + (dimX - 1 - x)] = segVolume[srcOffset + x];
    }
  }
  return slice;
}

export function extractSagittalSegSlice(segVolume, x, dimX, dimY, dimZ) {
  const slice = new Uint8Array(dimY * dimZ);
  for (let z = 0; z < dimZ; z++) {
    const dstRow = (dimZ - 1 - z) * dimY;
    for (let y = 0; y < dimY; y++) {
      slice[dstRow + (dimY - 1 - y)] = segVolume[x + y * dimX + z * dimX * dimY];
    }
  }
  return slice;
}
