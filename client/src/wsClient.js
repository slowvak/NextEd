const WS_URL = `ws://${location.host}/api/v1/ws`;
const MAX_DELAY = 30000;
let ws = null;
let delay = 1000;
let listeners = [];
let statusListeners = [];

function connect() {
  ws = new WebSocket(WS_URL);
  ws.onopen = () => {
    delay = 1000;
    statusListeners.forEach(fn => fn('connected'));
  };
  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    listeners.forEach(fn => fn(msg));
  };
  ws.onclose = () => {
    statusListeners.forEach(fn => fn('reconnecting'));
    setTimeout(connect, delay);
    delay = Math.min(delay * 2, MAX_DELAY);
  };
  ws.onerror = () => {
    // onclose fires after onerror; reconnect handled there
  };
}

export function onWsEvent(fn) { listeners.push(fn); }
export function onStatusChange(fn) { statusListeners.push(fn); }
export function initWebSocket() { connect(); }

// Exported for testing only
export function _getState() { return { delay, ws }; }
export function _reset() { delay = 1000; listeners = []; statusListeners = []; ws = null; }
