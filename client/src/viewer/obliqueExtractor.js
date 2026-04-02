/**
 * Oblique slice extraction from a flat 3D volume in C-order (RAS+).
 *
 * Uses (tilt, azimuth) parameterization:
 *   azimuth = angle of tilt axis in axial plane (0 = X axis, π/2 = Y axis)
 *   tilt = angle of plane away from axial (0 = pure axial)
 *
 * Rotation vectors computed via Rodrigues' formula: rotate base vectors
 * by `tilt` around axis [cos(azimuth), sin(azimuth), 0].
 *
 * Volume layout: index(x,y,z) = x + y*dimX + z*dimX*dimY
 * Display: radiological convention (X-flip, Y-flip) applied via negated du/dv.
 */

/**
 * Compute the right, up, and normal vectors for the oblique plane.
 */
export function getObliqueVectors(tilt, azimuth) {
  const ct = Math.cos(tilt), st = Math.sin(tilt);
  const ca = Math.cos(azimuth), sa = Math.sin(azimuth);

  return {
    right:  [ct + ca * ca * (1 - ct), ca * sa * (1 - ct), -sa * st],
    up:     [ca * sa * (1 - ct), ct + sa * sa * (1 - ct), ca * st],
    normal: [sa * st, -ca * st, ct],
  };
}

/**
 * Extract an oblique slice with trilinear interpolation.
 *
 * @param {Float32Array} volume
 * @param {number[]} center - [cx, cy, cz] voxel center
 * @param {number[]} dims - [dimX, dimY, dimZ]
 * @param {number} tilt - radians
 * @param {number} azimuth - radians
 * @param {number} outW - output width in pixels
 * @param {number} outH - output height in pixels
 * @returns {Float32Array}
 */
export function extractObliqueSlice(volume, center, dims, tilt, azimuth, outW, outH) {
  const { right, up } = getObliqueVectors(tilt, azimuth);
  const [dimX, dimY, dimZ] = dims;
  const [cx, cy, cz] = center;
  const slice = new Float32Array(outW * outH);
  const halfW = outW / 2;
  const halfH = outH / 2;

  for (let v = 0; v < outH; v++) {
    const dv = v - halfH + 0.5;
    for (let u = 0; u < outW; u++) {
      const du = u - halfW + 0.5;
      // Negate du and dv for radiological display (X-flip, Y-flip)
      const x = cx - du * right[0] - dv * up[0];
      const y = cy - du * right[1] - dv * up[1];
      const z = cz - du * right[2] - dv * up[2];
      slice[v * outW + u] = trilinear(volume, x, y, z, dimX, dimY, dimZ);
    }
  }
  return slice;
}

function trilinear(volume, x, y, z, dimX, dimY, dimZ) {
  if (x < 0 || y < 0 || z < 0 || x >= dimX - 1 || y >= dimY - 1 || z >= dimZ - 1) {
    // Nearest-neighbor at boundary (can't interpolate without a neighbor voxel)
    const xi = Math.round(x), yi = Math.round(y), zi = Math.round(z);
    if (xi < 0 || xi >= dimX || yi < 0 || yi >= dimY || zi < 0 || zi >= dimZ) return NaN;
    return volume[zi * dimX * dimY + yi * dimX + xi];
  }
  const x0 = Math.floor(x), y0 = Math.floor(y), z0 = Math.floor(z);
  const xd = x - x0, yd = y - y0, zd = z - z0;
  const sXY = dimX * dimY;
  const i000 = z0 * sXY + y0 * dimX + x0;

  const c00 = volume[i000] * (1 - xd) + volume[i000 + 1] * xd;
  const c10 = volume[i000 + dimX] * (1 - xd) + volume[i000 + dimX + 1] * xd;
  const c01 = volume[i000 + sXY] * (1 - xd) + volume[i000 + sXY + 1] * xd;
  const c11 = volume[i000 + sXY + dimX] * (1 - xd) + volume[i000 + sXY + dimX + 1] * xd;

  const c0 = c00 * (1 - yd) + c10 * yd;
  const c1 = c01 * (1 - yd) + c11 * yd;

  return c0 * (1 - zd) + c1 * zd;
}

/**
 * Extract oblique segmentation slice with nearest-neighbor (labels can't be interpolated).
 */
export function extractObliqueSegSlice(segVolume, center, dims, tilt, azimuth, outW, outH) {
  const { right, up } = getObliqueVectors(tilt, azimuth);
  const [dimX, dimY, dimZ] = dims;
  const [cx, cy, cz] = center;
  const slice = new Uint8Array(outW * outH);
  const halfW = outW / 2;
  const halfH = outH / 2;

  for (let v = 0; v < outH; v++) {
    const dv = v - halfH + 0.5;
    for (let u = 0; u < outW; u++) {
      const du = u - halfW + 0.5;
      const x = Math.round(cx - du * right[0] - dv * up[0]);
      const y = Math.round(cy - du * right[1] - dv * up[1]);
      const z = Math.round(cz - du * right[2] - dv * up[2]);
      if (x >= 0 && x < dimX && y >= 0 && y < dimY && z >= 0 && z < dimZ) {
        slice[v * outW + u] = segVolume[z * dimX * dimY + y * dimX + x];
      }
    }
  }
  return slice;
}

/**
 * Map oblique canvas pixel to voxel coordinates.
 *
 * @param {number} canvasU - pixel X on canvas (voxel-space, not CSS)
 * @param {number} canvasV - pixel Y on canvas
 * @param {number[]} center - [cx, cy, cz]
 * @param {number} tilt
 * @param {number} azimuth
 * @param {number} outW - canvas width
 * @param {number} outH - canvas height
 * @returns {number[]} [x, y, z] in continuous voxel coordinates
 */
export function obliqueCanvasToVoxel(canvasU, canvasV, center, tilt, azimuth, outW, outH) {
  const { right, up } = getObliqueVectors(tilt, azimuth);
  const [cx, cy, cz] = center;
  // No +0.5 here: callers pass continuous canvas coordinates (from CSS scaling)
  // where pixel centers are already at N+0.5, matching the extraction loop's
  // integer-index +0.5 offset.
  const du = canvasU - outW / 2;
  const dv = canvasV - outH / 2;
  return [
    cx - du * right[0] - dv * up[0],
    cy - du * right[1] - dv * up[1],
    cz - du * right[2] - dv * up[2],
  ];
}
