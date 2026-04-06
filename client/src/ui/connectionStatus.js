let statusEl = null;

export function createConnectionStatus(parentEl) {
  statusEl = document.createElement('div');
  statusEl.className = 'connection-status connected';
  statusEl.setAttribute('aria-live', 'polite');
  statusEl.title = 'Server connection: connected';
  parentEl.appendChild(statusEl);
  return statusEl;
}

export function updateConnectionStatus(status) {
  if (!statusEl) return;
  statusEl.className = `connection-status ${status}`;
  statusEl.title = `Server connection: ${status}`;
}
