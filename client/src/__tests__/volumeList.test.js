// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { addVolumeToList, removeVolumeFromList } from '../ui/volumeList.js';

describe('addVolumeToList', () => {
  let container;

  beforeEach(() => {
    container = document.createElement('ul');
  });

  it('adds a volume item with correct data-volume-id and class', () => {
    const vol = { id: 'abc', name: 'test', format: 'nifti', dimensions: [1, 2, 3] };
    addVolumeToList(vol, container, () => {});

    const item = container.querySelector('[data-volume-id="abc"]');
    expect(item).not.toBeNull();
    expect(item.classList.contains('volume-item')).toBe(true);
    expect(item.getAttribute('role')).toBe('option');
  });

  it('displays volume name and format badge', () => {
    const vol = { id: 'def', name: 'brain_t1', format: 'nifti', dimensions: [256, 256, 128] };
    addVolumeToList(vol, container, () => {});

    const item = container.querySelector('[data-volume-id="def"]');
    expect(item.querySelector('.volume-name').textContent).toBe('brain_t1');
    expect(item.querySelector('.volume-badge').textContent).toBe('NIFTI');
  });

  it('displays dimensions', () => {
    const vol = { id: 'ghi', name: 'scan', format: 'dicom', dimensions: [512, 512, 400] };
    addVolumeToList(vol, container, () => {});

    const dims = container.querySelector('.volume-dims');
    expect(dims.textContent).toBe('512 x 512 x 400');
  });

  it('removes "No volumes found" placeholder when adding', () => {
    // Set up empty state placeholder
    const placeholder = document.createElement('li');
    placeholder.className = 'volume-item';
    placeholder.textContent = 'No volumes found.';
    container.appendChild(placeholder);

    const vol = { id: 'jkl', name: 'new_vol', format: 'nifti', dimensions: [10, 10, 10] };
    addVolumeToList(vol, container, () => {});

    expect(container.children.length).toBe(1);
    expect(container.querySelector('[data-volume-id="jkl"]')).not.toBeNull();
  });
});

describe('removeVolumeFromList', () => {
  let container;

  beforeEach(() => {
    container = document.createElement('ul');
  });

  it('removes the item with matching data-volume-id', () => {
    const li = document.createElement('li');
    li.className = 'volume-item';
    li.dataset.volumeId = 'abc';
    container.appendChild(li);

    removeVolumeFromList('abc', container);
    expect(container.querySelector('[data-volume-id="abc"]')).toBeNull();
  });

  it('shows "No volumes found." placeholder after removing last volume', () => {
    const li = document.createElement('li');
    li.className = 'volume-item';
    li.dataset.volumeId = 'abc';
    container.appendChild(li);

    removeVolumeFromList('abc', container);
    expect(container.textContent).toContain('No volumes found.');
    expect(container.children.length).toBe(1);
  });

  it('does not show placeholder if other volumes remain', () => {
    const li1 = document.createElement('li');
    li1.className = 'volume-item';
    li1.dataset.volumeId = 'abc';
    container.appendChild(li1);

    const li2 = document.createElement('li');
    li2.className = 'volume-item';
    li2.dataset.volumeId = 'def';
    container.appendChild(li2);

    removeVolumeFromList('abc', container);
    expect(container.children.length).toBe(1);
    expect(container.querySelector('[data-volume-id="def"]')).not.toBeNull();
  });
});
