import { describe, it, expect } from 'vitest';
import { extractAxialSegSlice, extractCoronalSegSlice, extractSagittalSegSlice } from '../viewer/segSliceExtractor';

describe('segSliceExtractor', () => {
  // 2x2x2 volume: index = x + y*2 + z*4
  // vol = [0, 1, 2, 3, 4, 5, 6, 7]
  //   z=0: (x=0,y=0)=0, (x=1,y=0)=1, (x=0,y=1)=2, (x=1,y=1)=3
  //   z=1: (x=0,y=0)=4, (x=1,y=0)=5, (x=0,y=1)=6, (x=1,y=1)=7

  it('extractAxialSegSlice: X-flip and Y-flip', () => {
    const vol = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]);
    const slice = extractAxialSegSlice(vol, 0, 2, 2);
    expect(slice).toBeInstanceOf(Uint8Array);
    // Top-left = high Y, high X = (1,1) = 3
    // Top-right = high Y, low X = (0,1) = 2
    // Bot-left = low Y, high X = (1,0) = 1
    // Bot-right = low Y, low X = (0,0) = 0
    expect(slice).toEqual(new Uint8Array([3, 2, 1, 0]));
  });

  it('extractCoronalSegSlice: X-flip and Z-flip', () => {
    const vol = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]);
    const slice = extractCoronalSegSlice(vol, 0, 2, 2, 2);
    expect(slice).toBeInstanceOf(Uint8Array);
    // Top-left = high Z, high X = z=1,x=1,y=0 = 5
    // Top-right = high Z, low X = z=1,x=0,y=0 = 4
    // Bot-left = low Z, high X = z=0,x=1,y=0 = 1
    // Bot-right = low Z, low X = z=0,x=0,y=0 = 0
    expect(slice).toEqual(new Uint8Array([5, 4, 1, 0]));
  });

  it('extractSagittalSegSlice: Y-flip and Z-flip', () => {
    const vol = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]);
    const slice = extractSagittalSegSlice(vol, 0, 2, 2, 2);
    expect(slice).toBeInstanceOf(Uint8Array);
    // Top-left = high Z, high Y = z=1,y=1,x=0 = 6
    // Top-right = high Z, low Y = z=1,y=0,x=0 = 4
    // Bot-left = low Z, high Y = z=0,y=1,x=0 = 2
    // Bot-right = low Z, low Y = z=0,y=0,x=0 = 0
    expect(slice).toEqual(new Uint8Array([6, 4, 2, 0]));
  });
});
