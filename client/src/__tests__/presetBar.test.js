import { describe, it, expect } from 'vitest';
import { scalePresetToDataRange } from '../ui/presetBar.js';

describe('scalePresetToDataRange', () => {
  it('produces meaningful window for [0, 1] normalized data', () => {
    const brain = scalePresetToDataRange('Brain', 0, 1);
    expect(brain.center).toBeGreaterThan(0);
    expect(brain.center).toBeLessThan(1);
    expect(brain.width).toBeGreaterThan(0);
    expect(brain.width).toBeLessThan(1);
  });

  it('produces meaningful window for [0, 2000] MRI-like data', () => {
    const brain = scalePresetToDataRange('Brain', 0, 2000);
    expect(brain.center).toBeGreaterThan(0);
    expect(brain.center).toBeLessThan(2000);
    expect(brain.width).toBeGreaterThan(0);
    expect(brain.width).toBeLessThan(2000);
  });

  it('produces different windows for different presets', () => {
    const brain = scalePresetToDataRange('Brain', 0, 1000);
    const bone = scalePresetToDataRange('Bone', 0, 1000);
    const lung = scalePresetToDataRange('Lung', 0, 1000);
    const abd = scalePresetToDataRange('Abd', 0, 1000);
    // All centers should differ
    expect(brain.center).not.toBeCloseTo(bone.center, 0);
    expect(brain.center).not.toBeCloseTo(lung.center, 0);
    // Bone has wider window than Brain
    expect(bone.width).toBeGreaterThan(brain.width);
    // All four produce distinct center values
    const centers = [brain.center, bone.center, lung.center, abd.center];
    const unique = new Set(centers.map(c => Math.round(c)));
    expect(unique.size).toBe(4);
  });

  it('handles zero-range data gracefully', () => {
    const { center, width } = scalePresetToDataRange('Brain', 5, 5);
    expect(center).toBe(5);
    expect(width).toBeGreaterThan(0);
  });

  it('preserves relative center order: Lung < Brain < Abd < Bone', () => {
    const lung = scalePresetToDataRange('Lung', 0, 1000);
    const brain = scalePresetToDataRange('Brain', 0, 1000);
    const abd = scalePresetToDataRange('Abd', 0, 1000);
    const bone = scalePresetToDataRange('Bone', 0, 1000);
    expect(lung.center).toBeLessThan(brain.center);
    expect(brain.center).toBeLessThan(abd.center);
    expect(abd.center).toBeLessThan(bone.center);
  });

  it('width is proportional to data range', () => {
    const small = scalePresetToDataRange('Brain', 0, 1);
    const large = scalePresetToDataRange('Brain', 0, 1000);
    expect(large.width / small.width).toBeCloseTo(1000, -1);
  });
});
