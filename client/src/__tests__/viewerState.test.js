import { describe, it, expect, vi } from 'vitest';
import { ViewerState } from '../viewer/ViewerState.js';

describe('ViewerState', () => {
  it('initializes cursor to center of dimensions', () => {
    const state = new ViewerState({
      dims: [100, 200, 150],
      spacing: [1.0, 1.0, 2.5],
      modality: 'CT',
      windowCenter: 40,
      windowWidth: 80,
    });
    expect(state.cursor).toEqual([50, 100, 75]);
  });

  it('clamps setCursor to valid range', () => {
    const state = new ViewerState({
      dims: [100, 200, 150],
      spacing: [1.0, 1.0, 2.5],
      modality: 'CT',
      windowCenter: 40,
      windowWidth: 80,
    });
    state.setCursor(-1, 300, 75);
    expect(state.cursor).toEqual([0, 199, 75]);
  });

  it('notifies listeners when setCursor is called', () => {
    const state = new ViewerState({
      dims: [100, 200, 150],
      spacing: [1.0, 1.0, 2.5],
      modality: 'CT',
      windowCenter: 40,
      windowWidth: 80,
    });
    const listener = vi.fn();
    state.subscribe(listener);
    state.setCursor(10, 20, 30);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(state);
  });

  it('setWindowLevel updates values and notifies listeners', () => {
    const state = new ViewerState({
      dims: [100, 200, 150],
      spacing: [1.0, 1.0, 2.5],
      modality: 'CT',
      windowCenter: 40,
      windowWidth: 80,
    });
    const listener = vi.fn();
    state.subscribe(listener);
    state.setWindowLevel(100, 200);
    expect(state.windowCenter).toBe(100);
    expect(state.windowWidth).toBe(200);
    expect(state.activePreset).toBeNull();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('setWindowLevel clamps width to minimum 1', () => {
    const state = new ViewerState({
      dims: [100, 200, 150],
      spacing: [1.0, 1.0, 2.5],
      modality: 'CT',
      windowCenter: 40,
      windowWidth: 80,
    });
    state.setWindowLevel(40, 0);
    expect(state.windowWidth).toBe(1);
    state.setWindowLevel(40, -10);
    expect(state.windowWidth).toBe(1);
  });

  it('subscribe returns unsubscribe function', () => {
    const state = new ViewerState({
      dims: [100, 200, 150],
      spacing: [1.0, 1.0, 2.5],
      modality: 'CT',
      windowCenter: 40,
      windowWidth: 80,
    });
    const listener = vi.fn();
    const unsub = state.subscribe(listener);
    unsub();
    state.setCursor(10, 20, 30);
    expect(listener).not.toHaveBeenCalled();
  });

  it('setPreset updates windowCenter, windowWidth, activePreset and notifies listeners', () => {
    const state = new ViewerState({
      dims: [100, 200, 150],
      spacing: [1.0, 1.0, 2.5],
      modality: 'CT',
      windowCenter: 40,
      windowWidth: 400,
    });
    const listener = vi.fn();
    state.subscribe(listener);
    state.setPreset('Bone', 500, 3000);
    expect(state.windowCenter).toBe(500);
    expect(state.windowWidth).toBe(3000);
    expect(state.activePreset).toBe('Bone');
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(state);
  });

  it('stores dataMin and dataMax from constructor options', () => {
    const state = new ViewerState({
      dims: [100, 200, 150],
      spacing: [1.0, 1.0, 2.5],
      modality: 'unknown',
      windowCenter: 0.5,
      windowWidth: 0.5,
      dataMin: 0.0,
      dataMax: 1.0,
    });
    expect(state.dataMin).toBe(0.0);
    expect(state.dataMax).toBe(1.0);
  });

  it('defaults dataMin and dataMax to null when not provided', () => {
    const state = new ViewerState({
      dims: [100, 200, 150],
      spacing: [1.0, 1.0, 2.5],
      modality: 'CT',
      windowCenter: 40,
      windowWidth: 80,
    });
    expect(state.dataMin).toBeNull();
    expect(state.dataMax).toBeNull();
  });

  it('setPreset preserves activePreset (unlike setWindowLevel which clears it)', () => {
    const state = new ViewerState({
      dims: [100, 200, 150],
      spacing: [1.0, 1.0, 2.5],
      modality: 'CT',
      windowCenter: 40,
      windowWidth: 400,
    });
    state.setPreset('Brain', 40, 80);
    expect(state.activePreset).toBe('Brain');
    state.setWindowLevel(40, 80);
    expect(state.activePreset).toBeNull();
  });
});
