/**
 * imageFilter.js — Smoothing filters applied to raw image intensity data.
 *
 * Operates on a Float32Array volume in place, using a snapshot so each
 * output voxel is computed from original (unfiltered) neighbours.
 */

function gaussianWeights(ksXY, ksZ, mode) {
  const hXY = (ksXY - 1) >> 1;
  const hZ  = (ksZ  - 1) >> 1;
  const s2XY = 2 * (ksXY / 4) ** 2;
  const s2Z  = 2 * (ksZ  / 4) ** 2;
  const w = [];
  if (mode === '2d') {
    for (let dy = -hXY; dy <= hXY; dy++)
      for (let dx = -hXY; dx <= hXY; dx++)
        w.push(Math.exp(-(dx * dx + dy * dy) / s2XY));
  } else {
    for (let dz = -hZ; dz <= hZ; dz++)
      for (let dy = -hXY; dy <= hXY; dy++)
        for (let dx = -hXY; dx <= hXY; dx++)
          w.push(Math.exp(-(dx * dx + dy * dy) / s2XY - (dz * dz) / s2Z));
  }
  return w;
}

/**
 * Apply a smoothing filter to the raw image volume in place.
 *
 * @param {Float32Array} volume  - Raw voxel intensities (modified in place)
 * @param {number[]}     dims    - [dimX, dimY, dimZ]
 * @param {Object}       options
 *   mode:         '2d' | '3d'
 *   filterType:   'mean' | 'median' | 'sigma'
 *   kernelSizeXY: 3 | 5 | 7  (XY plane kernel radius; also used for Z in symmetric 3D)
 *   kernelSizeZ:  3 | 5 | 7  (Z kernel radius for asymmetric 3D kernels, defaults to kernelSizeXY)
 *   applyTo:      'slice' | 'volume'
 *   sliceZ:       number  (used when applyTo === 'slice')
 * @param {function}     onProgress  called with 0..1
 */
export async function applyImageFilter(volume, dims, options, onProgress) {
  const { mode, filterType, applyTo, sliceZ } = options;
  const ksXY = options.kernelSizeXY ?? options.kernelSize ?? 3;
  const ksZ  = options.kernelSizeZ  ?? ksXY;
  const [dimX, dimY, dimZ] = dims;
  const hXY = (ksXY - 1) >> 1;
  const hZ  = (ksZ  - 1) >> 1;
  const sliceSize = dimX * dimY;

  // Snapshot — read neighbours from src, write filtered values to volume
  const src = new Float32Array(volume);
  const gaussW = filterType === 'sigma' ? gaussianWeights(ksXY, ksZ, mode) : null;

  const zStart = applyTo === 'slice' ? sliceZ : 0;
  const zEnd   = applyTo === 'slice' ? sliceZ + 1 : dimZ;
  const nZ     = zEnd - zStart;

  for (let z = zStart; z < zEnd; z++) {
    for (let y = 0; y < dimY; y++) {
      for (let x = 0; x < dimX; x++) {
        const idx = z * sliceSize + y * dimX + x;

        if (filterType === 'median') {
          const vals = [];
          if (mode === '2d') {
            for (let dy = -hXY; dy <= hXY; dy++) {
              const ny = y + dy;
              if (ny < 0 || ny >= dimY) continue;
              for (let dx = -hXY; dx <= hXY; dx++) {
                const nx = x + dx;
                if (nx < 0 || nx >= dimX) continue;
                vals.push(src[z * sliceSize + ny * dimX + nx]);
              }
            }
          } else {
            for (let dz = -hZ; dz <= hZ; dz++) {
              const nz = z + dz;
              if (nz < 0 || nz >= dimZ) continue;
              for (let dy = -hXY; dy <= hXY; dy++) {
                const ny = y + dy;
                if (ny < 0 || ny >= dimY) continue;
                for (let dx = -hXY; dx <= hXY; dx++) {
                  const nx = x + dx;
                  if (nx < 0 || nx >= dimX) continue;
                  vals.push(src[nz * sliceSize + ny * dimX + nx]);
                }
              }
            }
          }
          vals.sort((a, b) => a - b);
          volume[idx] = vals[Math.floor(vals.length / 2)];

        } else {
          // Mean or Gaussian-weighted mean
          let sum = 0, totalW = 0, wi = 0;
          if (mode === '2d') {
            for (let dy = -hXY; dy <= hXY; dy++) {
              const ny = y + dy;
              for (let dx = -hXY; dx <= hXY; dx++) {
                const nx = x + dx;
                const w = gaussW ? gaussW[wi++] : 1;
                if (ny >= 0 && ny < dimY && nx >= 0 && nx < dimX) {
                  sum    += src[z * sliceSize + ny * dimX + nx] * w;
                  totalW += w;
                }
              }
            }
          } else {
            for (let dz = -hZ; dz <= hZ; dz++) {
              const nz = z + dz;
              for (let dy = -hXY; dy <= hXY; dy++) {
                const ny = y + dy;
                for (let dx = -hXY; dx <= hXY; dx++) {
                  const nx = x + dx;
                  const w = gaussW ? gaussW[wi++] : 1;
                  if (nz >= 0 && nz < dimZ && ny >= 0 && ny < dimY && nx >= 0 && nx < dimX) {
                    sum    += src[nz * sliceSize + ny * dimX + nx] * w;
                    totalW += w;
                  }
                }
              }
            }
          }
          volume[idx] = totalW > 0 ? sum / totalW : src[idx];
        }
      }
    }

    onProgress((z - zStart + 1) / nZ);
    await new Promise(r => setTimeout(r, 0));
  }

  // Clamp filtered values to [min, max] over the processed region
  if (options.threshold?.enabled) {
    const tMin = options.threshold.min, tMax = options.threshold.max;
    const iStart = zStart * sliceSize, iEnd = zEnd * sliceSize;
    for (let i = iStart; i < iEnd; i++) {
      if      (volume[i] < tMin) volume[i] = tMin;
      else if (volume[i] > tMax) volume[i] = tMax;
    }
  }
}
