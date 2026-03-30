import { describe, it, expect } from 'vitest';
import { extractAxialSlice, extractCoronalSlice, extractSagittalSlice } from '../viewer/sliceExtractor.js';

// Test volume: 3x4x5 in C-order (RAS+)
// index(x,y,z) = x + y*dimX + z*dimX*dimY = x + y*3 + z*12
// x: R-L (+X = Right), y: A-P (+Y = Anterior), z: I-S (+Z = Superior)
function makeTestVolume() {
  const dimX = 3, dimY = 4, dimZ = 5;
  const volume = new Float32Array(dimX * dimY * dimZ);
  for (let z = 0; z < dimZ; z++) {
    for (let y = 0; y < dimY; y++) {
      for (let x = 0; x < dimX; x++) {
        volume[x + y * dimX + z * dimX * dimY] = x + y * dimX + z * dimX * dimY;
      }
    }
  }
  return { volume, dimX, dimY, dimZ };
}

describe('extractAxialSlice', () => {
  it('X-flipped (right on left) and Y-flipped (anterior at top)', () => {
    const { volume, dimX, dimY } = makeTestVolume();
    const z = 2;
    const slice = extractAxialSlice(volume, z, dimX, dimY);
    expect(slice.length).toBe(dimX * dimY); // 3*4 = 12

    // Top-left corner = high Y (anterior), high X (right)
    // y=3, x=2: volume[2 + 3*3 + 2*12] = volume[35] = 35
    expect(slice[0]).toBe(35);

    // Top-right corner = high Y (anterior), low X (left)
    // y=3, x=0: volume[0 + 3*3 + 2*12] = volume[33] = 33
    expect(slice[dimX - 1]).toBe(33);

    // Bottom-left corner = low Y (posterior), high X (right)
    // y=0, x=2: volume[2 + 0*3 + 2*12] = volume[26] = 26
    expect(slice[(dimY - 1) * dimX]).toBe(26);
  });

  it('allocates new array (not zero-copy) due to flips', () => {
    const { volume, dimX, dimY } = makeTestVolume();
    const slice = extractAxialSlice(volume, 0, dimX, dimY);
    expect(slice.buffer).not.toBe(volume.buffer);
  });
});

describe('extractCoronalSlice', () => {
  it('X-flipped (right on left) and Z-flipped (superior at top)', () => {
    const { volume, dimX, dimY, dimZ } = makeTestVolume();
    const y = 1;
    const slice = extractCoronalSlice(volume, y, dimX, dimY, dimZ);
    expect(slice.length).toBe(dimX * dimZ); // 3*5 = 15

    // Top-left = high Z (superior), high X (right)
    // z=4, x=2: volume[2 + 1*3 + 4*12] = volume[53] = 53
    expect(slice[0]).toBe(53);

    // Top-right = high Z (superior), low X (left)
    // z=4, x=0: volume[0 + 1*3 + 4*12] = volume[51] = 51
    expect(slice[dimX - 1]).toBe(51);

    // Bottom-left = low Z (inferior), high X (right)
    // z=0, x=2: volume[2 + 1*3 + 0*12] = volume[5] = 5
    expect(slice[(dimZ - 1) * dimX]).toBe(5);
  });
});

describe('extractSagittalSlice', () => {
  it('Y-flipped (anterior on left) and Z-flipped (superior at top)', () => {
    const { volume, dimX, dimY, dimZ } = makeTestVolume();
    const x = 1;
    const slice = extractSagittalSlice(volume, x, dimX, dimY, dimZ);
    expect(slice.length).toBe(dimY * dimZ); // 4*5 = 20

    // Top-left = high Z (superior), high Y (anterior)
    // z=4, y=3: volume[1 + 3*3 + 4*12] = volume[58] = 58
    expect(slice[0]).toBe(58);

    // Top-right = high Z (superior), low Y (posterior)
    // z=4, y=0: volume[1 + 0*3 + 4*12] = volume[49] = 49
    expect(slice[dimY - 1]).toBe(49);

    // Bottom-left = low Z (inferior), high Y (anterior)
    // z=0, y=3: volume[1 + 3*3 + 0*12] = volume[10] = 10
    expect(slice[(dimZ - 1) * dimY]).toBe(10);
  });
});
