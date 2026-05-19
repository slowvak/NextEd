// Copyright Bradley J Erickson, 2026.
/** @type {function(string): void} - set by main.js to open a volume in a linked window */
let _openLinkedWindow = null;
export function setOpenLinkedWindowCallback(fn) { _openLinkedWindow = fn; }

function _buildVolumeItem(vol, onSelect) {
  const li = document.createElement('li');
  li.className = 'volume-item';
  li.setAttribute('role', 'option');
  li.setAttribute('aria-selected', 'false');
  li.setAttribute('tabindex', '0');
  li.dataset.volumeId = vol.id;

  const headerRow = document.createElement('div');
  headerRow.className = 'volume-item-header';

  const name = document.createElement('span');
  name.className = 'volume-name';
  name.textContent = vol.filename || vol.name;

  const right = document.createElement('div');
  right.style.cssText = 'display:flex;align-items:center;gap:6px;flex-shrink:0;';

  const badge = document.createElement('span');
  badge.className = `volume-badge ${vol.format}`;
  badge.textContent = vol.format.toUpperCase();

  // Link button — opens this volume in a synced window
  const linkBtn = document.createElement('button');
  linkBtn.className = 'volume-link-btn';
  linkBtn.title = 'Open in linked window';
  linkBtn.textContent = '⛓';
  linkBtn.addEventListener('click', (e) => {
    e.stopPropagation(); // don't trigger onSelect
    if (_openLinkedWindow) _openLinkedWindow(vol.id);
  });

  right.appendChild(badge);
  right.appendChild(linkBtn);

  headerRow.appendChild(name);
  headerRow.appendChild(right);

  const dims = document.createElement('span');
  dims.className = 'volume-dims';
  const [dx, dy, dz] = vol.dimensions;
  dims.textContent = `${dx} × ${dy} × ${dz}`;

  li.appendChild(headerRow);
  li.appendChild(dims);

  li.addEventListener('click', () => onSelect(vol));
  li.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onSelect(vol);
    }
  });

  return li;
}

export function renderVolumeList(volumes, container, onSelect) {
  container.innerHTML = '';
  if (volumes.length === 0) {
    const li = document.createElement('li');
    li.className = 'volume-item';
    li.textContent = 'No volumes found.';
    container.appendChild(li);
    return;
  }
  for (const vol of volumes) {
    container.appendChild(_buildVolumeItem(vol, onSelect));
  }
}

export function addVolumeToList(vol, container, onSelect) {
  // Remove "No volumes found" placeholder if present
  const placeholder = container.querySelector('.volume-item:not([data-volume-id])');
  if (placeholder) placeholder.remove();
  container.appendChild(_buildVolumeItem(vol, onSelect));
}

export function removeVolumeFromList(volumeId, container) {
  const item = container.querySelector(`[data-volume-id="${volumeId}"]`);
  if (item) item.remove();
  // Show placeholder if list is now empty
  if (container.children.length === 0) {
    const li = document.createElement('li');
    li.className = 'volume-item';
    li.textContent = 'No volumes found.';
    container.appendChild(li);
  }
}
