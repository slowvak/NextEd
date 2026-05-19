// Copyright Bradley J Erickson, 2026.
const API_BASE = '/api/v1';

export async function fetchVolumes() {
  const response = await fetch(`${API_BASE}/volumes`);
  if (!response.ok) throw new Error(`Failed to fetch volumes: ${response.status}`);
  return response.json();
}

export async function fetchVolumeMetadata(volumeId) {
  const response = await fetch(`${API_BASE}/volumes/${volumeId}/metadata`);
  if (!response.ok) throw new Error(`Failed to fetch metadata: ${response.status}`);
  return response.json();
}

export async function fetchVolumeData(volumeId) {
  const response = await fetch(`${API_BASE}/volumes/${volumeId}/data`);
  if (!response.ok) throw new Error(`Failed to fetch volume data: ${response.status}`);
  return response.arrayBuffer();
}

/**
 * Resample a volume to target dimensions server-side (scipy.ndimage.zoom).
 * Returns { buffer: ArrayBuffer, newId: string, newDims: number[] }.
 */
export async function resampleVolume(volumeId, targetDims) {
  const response = await fetch(`${API_BASE}/volumes/${volumeId}/resample`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ target_dims: targetDims }),
  });
  if (!response.ok) throw new Error(`Resample failed: ${response.status}`);
  const buffer = await response.arrayBuffer();
  const newId   = response.headers.get('X-Volume-Id') ?? `${volumeId}_resampled`;
  const dimHdr  = response.headers.get('X-Volume-Dimensions');
  const newDims = dimHdr ? dimHdr.split(',').map(Number) : targetDims;
  return { buffer, newId, newDims };
}

/**
 * Register source volume onto target (rigid by default).
 * Returns { buffer: ArrayBuffer, newDims: number[], spacing: number[] }.
 */
export async function requestRegistration(sourceId, targetId, method = 'rigid') {
  const response = await fetch(`${API_BASE}/registration`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ source_id: sourceId, target_id: targetId, method }),
  });
  if (!response.ok) throw new Error(`Registration failed: ${response.status}`);
  const buffer  = await response.arrayBuffer();
  const dimHdr  = response.headers.get('X-Volume-Dimensions');
  const spHdr   = response.headers.get('X-Voxel-Spacing');
  const wcHdr   = response.headers.get('X-Window-Center');
  const wwHdr   = response.headers.get('X-Window-Width');
  console.log('[Registration] headers:', { dimHdr, spHdr, wcHdr, wwHdr });
  if (!dimHdr) throw new Error('Registration succeeded but server did not return X-Volume-Dimensions header. Check server logs for errors.');
  const newDims = dimHdr.split(',').map(Number);
  const spacing = spHdr ? spHdr.split(',').map(Number) : null;
  const windowCenter = wcHdr ? Number(wcHdr) : null;
  const windowWidth  = wwHdr ? Number(wwHdr) : null;
  return { buffer, newDims, spacing, windowCenter, windowWidth };
}
