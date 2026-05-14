import { buildColorLUT } from '../viewer/overlayBlender.js';

/**
 * SyncBridge — syncs cursor position, oblique angles, and label definitions
 * across browser windows/tabs using the BroadcastChannel API.
 *
 * All windows in the same sync group share a UUID-named channel. Cursor
 * positions are normalized to [0,1] fractions so they map correctly even
 * when volumes have different voxel dimensions.
 */
export class SyncBridge {
  /**
   * @param {string} groupId - UUID shared by all windows in the sync group
   * @param {import('../viewer/ViewerState.js').ViewerState} state
   * @param {number[]} dims - [dimX, dimY, dimZ] for this window's volume
   * @param {string|null} volumeId - server volume ID for this window
   * @param {function(RemoteHello): void} [onRemoteHello] - called when another window joins
   */
  constructor(groupId, state, dims, volumeId, onRemoteHello = null) {
    this._id = crypto.randomUUID();
    this._groupId = groupId;
    this._state = state;
    this._dims = dims;
    this._volumeId = volumeId;
    this._onRemoteHello = onRemoteHello;
    this._isSyncing = false;
    this._lastLabelsHash = this._labelsHash(state.labels);

    this._ch = new BroadcastChannel(`sigma-sync-${groupId}`);
    this._ch.onmessage = ({ data }) => this._onMessage(data);

    this._unsubscribe = state.subscribe((s) => this._onLocalChange(s));

    // Announce presence to any existing windows
    this._broadcast({ type: 'hello', dims, volumeId, sourceId: this._id });
  }

  get groupId() { return this._groupId; }
  get windowId() { return this._id; }

  _broadcast(msg) {
    this._ch.postMessage(msg);
  }

  /** Call after painting ends (mouseup). Broadcasts segVolume to linked windows. */
  broadcastSeg() {
    const seg = this._state.segVolume;
    if (!seg) return;
    // Always broadcast — sparse checksum was missing small brush strokes
    this._broadcast({ type: 'segvolume', data: seg.buffer.slice(0) });
  }

  _labelsHash(labels) {
    return [...labels.entries()]
      .filter(([v]) => v !== 0)
      .map(([v, l]) => `${v}:${l.name}:${l.color.r},${l.color.g},${l.color.b}`)
      .join('|');
  }

  _onLocalChange(s) {
    if (this._isSyncing) return;

    const d = s.dims;
    // Guard against zero dims (shouldn't happen but be safe)
    const fx = d[0] > 1 ? s.cursor[0] / (d[0] - 1) : 0;
    const fy = d[1] > 1 ? s.cursor[1] / (d[1] - 1) : 0;
    const fz = d[2] > 1 ? s.cursor[2] / (d[2] - 1) : 0;

    this._broadcast({
      type: 'cursor',
      fx, fy, fz,
      obliqueTilt: s.obliqueTilt,
      obliqueAzimuth: s.obliqueAzimuth,
      sourceId: this._id,
    });

    // Broadcast label changes (name/color only — constraints stay local)
    const hash = this._labelsHash(s.labels);
    if (hash !== this._lastLabelsHash) {
      this._lastLabelsHash = hash;
      const labels = [...s.labels.entries()]
        .filter(([v]) => v !== 0)
        .map(([v, l]) => ({ value: v, name: l.name, color: l.color }));
      this._broadcast({ type: 'labels', labels, sourceId: this._id });
    }
  }

  _onMessage(msg) {
    if (msg.sourceId === this._id) return; // echo guard

    if (msg.type === 'cursor') {
      this._isSyncing = true;
      const d = this._state.dims;
      this._state.setCursor(
        Math.round(msg.fx * (d[0] - 1)),
        Math.round(msg.fy * (d[1] - 1)),
        Math.round(msg.fz * (d[2] - 1)),
      );
      if (msg.obliqueTilt !== undefined) this._state.setObliqueTilt(msg.obliqueTilt);
      if (msg.obliqueAzimuth !== undefined) this._state.setObliqueAzimuth(msg.obliqueAzimuth);
      this._isSyncing = false;
    }

    if (msg.type === 'labels') {
      this._isSyncing = true;
      let changed = false;
      for (const { value, name, color } of msg.labels) {
        const existing = this._state.labels.get(value);
        if (existing) {
          // Update name/color; preserve per-volume intensity constraints
          if (existing.name !== name || JSON.stringify(existing.color) !== JSON.stringify(color)) {
            existing.name = name;
            existing.color = color;
            changed = true;
          }
        } else {
          // New label from remote window — add with no local constraints
          this._state.labels.set(value, { name, value, color, isVisible: true });
          changed = true;
        }
      }
      if (changed) {
        this._state.colorLUT = buildColorLUT(this._state.labels);
        this._state.notify();
        this._lastLabelsHash = this._labelsHash(this._state.labels);
      }
      this._isSyncing = false;
    }

    if (msg.type === 'segvolume') {
      this._isSyncing = true;
      const incoming = new Uint8Array(msg.data);
      if (this._state.segVolume && this._state.segVolume.length === incoming.length) {
        this._state.segVolume.set(incoming);
      } else {
        this._state.segVolume = new Uint8Array(incoming);
        this._state.segDims = [...(this._state.dims)];
      }
      this._state.colorLUT = buildColorLUT(this._state.labels);
      this._state.notify();
      this._isSyncing = false;
    }

    if (msg.type === 'hello') {
      // Reply so the newcomer knows we exist — don't show mismatch dialog here;
      // the newcomer is responsible for detecting and resolving dimension differences.
      this._broadcast({
        type: 'hello_ack',
        dims: this._dims,
        volumeId: this._volumeId,
        sourceId: this._id,
      });
    }

    if (msg.type === 'hello_ack') {
      // We are the newcomer and just learned about an existing window — check dims.
      if (this._onRemoteHello) {
        this._onRemoteHello({ dims: msg.dims, volumeId: msg.volumeId, sourceId: msg.sourceId });
      }
    }
  }

  destroy() {
    this._unsubscribe();
    this._broadcast({ type: 'bye', sourceId: this._id });
    this._ch.close();
  }
}
