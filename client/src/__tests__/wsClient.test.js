// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// We need to mock WebSocket before importing wsClient
let mockWsInstances = [];

class MockWebSocket {
  constructor(url) {
    this.url = url;
    this.onopen = null;
    this.onclose = null;
    this.onmessage = null;
    this.onerror = null;
    mockWsInstances.push(this);
  }
  close() {}
}

// Set up global WebSocket mock
vi.stubGlobal('WebSocket', MockWebSocket);

// Import after mock is in place
const { initWebSocket, onWsEvent, onStatusChange, _getState, _reset } = await import('../wsClient.js');

describe('wsClient', () => {
  beforeEach(() => {
    _reset();
    mockWsInstances = [];
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('onWsEvent receives parsed JSON messages', () => {
    const listener = vi.fn();
    onWsEvent(listener);
    initWebSocket();

    const ws = mockWsInstances[0];
    const payload = { type: 'volume_added', data: { id: 'x' } };
    ws.onmessage({ data: JSON.stringify(payload) });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(payload);
  });

  it('reconnect backoff doubles delay (1000 -> 2000 -> 4000)', () => {
    initWebSocket();
    const ws1 = mockWsInstances[0];

    // First close: delay goes from 1000 to 2000
    ws1.onclose();
    vi.advanceTimersByTime(1000);
    expect(_getState().delay).toBe(2000);

    // Second close: delay goes from 2000 to 4000
    const ws2 = mockWsInstances[1];
    ws2.onclose();
    vi.advanceTimersByTime(2000);
    expect(_getState().delay).toBe(4000);
  });

  it('reconnect delay caps at 30000', () => {
    initWebSocket();

    // Simulate many disconnects to exceed cap
    for (let i = 0; i < 10; i++) {
      const ws = mockWsInstances[mockWsInstances.length - 1];
      ws.onclose();
      vi.advanceTimersByTime(30000);
    }

    expect(_getState().delay).toBeLessThanOrEqual(30000);
  });

  it('reconnect resets delay on successful open', () => {
    initWebSocket();
    const ws1 = mockWsInstances[0];

    // Simulate close (delay becomes 2000)
    ws1.onclose();
    vi.advanceTimersByTime(1000);
    expect(_getState().delay).toBe(2000);

    // Simulate successful reconnect
    const ws2 = mockWsInstances[1];
    ws2.onopen();
    expect(_getState().delay).toBe(1000);
  });

  it('notifies status listeners on open and close', () => {
    const statusFn = vi.fn();
    onStatusChange(statusFn);
    initWebSocket();

    const ws = mockWsInstances[0];
    ws.onopen();
    expect(statusFn).toHaveBeenCalledWith('connected');

    ws.onclose();
    expect(statusFn).toHaveBeenCalledWith('reconnecting');
  });
});
