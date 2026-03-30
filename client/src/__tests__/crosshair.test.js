import { describe, it, expect } from 'vitest';
import { canvasToVoxel } from '../viewer/ViewerPanel.js';

describe('canvasToVoxel', () => {
  it('axial panel: X-flipped and Y-flipped', () => {
    // Canvas click at pixel (10, 20) on a canvas width=100, height=200
    // X-flip: x = 99-10 = 89, Y-flip: y = 199-20 = 179
    const result = canvasToVoxel(10, 20, 'axial', { width: 100, clientWidth: 100 }, { height: 200, clientHeight: 200 }, [100, 200, 150]);
    expect(result).toEqual({ cursorUpdates: { 0: 89, 1: 179 } });
  });

  it('coronal panel: X-flipped and Z-flipped', () => {
    // Canvas click at pixel (10, 20) on a canvas width=100, height=150
    // X-flip: x = 99-10 = 89, Z-flip: z = 149-20 = 129
    const result = canvasToVoxel(10, 20, 'coronal', { width: 100, clientWidth: 100 }, { height: 150, clientHeight: 150 }, [100, 200, 150]);
    expect(result).toEqual({ cursorUpdates: { 0: 89, 2: 129 } });
  });

  it('sagittal panel: Y-flipped and Z-flipped', () => {
    // Canvas click at pixel (10, 20) on a canvas width=200, height=150
    // Y-flip: y = 199-10 = 189, Z-flip: z = 149-20 = 129
    const result = canvasToVoxel(10, 20, 'sagittal', { width: 200, clientWidth: 200 }, { height: 150, clientHeight: 150 }, [100, 200, 150]);
    expect(result).toEqual({ cursorUpdates: { 1: 189, 2: 129 } });
  });

  it('accounts for CSS scaling (anisotropic)', () => {
    // canvas.width=100 but canvas.clientWidth=200 (CSS scaled 2x)
    // A click at canvasX=100 (CSS px) maps to voxelX=50, X-flip: x=99-50=49
    // canvasY=40 at 2x scale -> voxelY=20, Y-flip: y=199-20=179
    const result = canvasToVoxel(100, 40, 'axial', { width: 100, clientWidth: 200 }, { height: 200, clientHeight: 400 }, [100, 200, 150]);
    expect(result).toEqual({ cursorUpdates: { 0: 49, 1: 179 } });
  });

  it('clamps to valid range', () => {
    // Click beyond dims should clamp
    const result = canvasToVoxel(150, 250, 'axial', { width: 100, clientWidth: 100 }, { height: 200, clientHeight: 200 }, [100, 200, 150]);
    expect(result.cursorUpdates[0]).toBe(0); // X-flip: 99-150 = -51, clamped to 0
    expect(result.cursorUpdates[1]).toBe(0); // Y-flip: 199-250 = -51, clamped to 0
  });
});
