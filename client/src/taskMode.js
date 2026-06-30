// Copyright Bradley J Erickson, 2026.
/**
 * Task Mode — external workflow integration for NextEd viewer.
 *
 * When URL contains task parameters, NextEd skips the volume browser and
 * loads a specific volume (+ optional mask) directly. Supports edit mode
 * (full segmentation tools), QC mode (view-only with accept/reject), or both.
 *
 * URL parameters:
 *   volume    - filesystem path to NIfTI volume (required)
 *   mask      - filesystem path to existing segmentation (optional)
 *   output    - filesystem path to write result mask (optional)
 *   callback  - URL to POST result when task is completed (optional)
 *   prompt    - instruction text shown to the user (optional)
 *   mode      - "edit" | "qc" | "edit+qc" (default: "edit")
 *   task_id   - external task ID passed back in callback (optional)
 *   ai_model  - auto-run this AI model after loading (optional)
 */

export function getTaskParams() {
  const params = new URLSearchParams(window.location.search);
  const volume = params.get('volume') || params.get('image');
  if (!volume) return null;

  return {
    volume,
    mask: params.get('mask'),
    masksFolder: params.get('masks_folder'),
    output: params.get('output') || params.get('segmentation'),
    callback: params.get('callback'),
    callbackAuth: params.get('callback_auth'),
    returnUrl: params.get('return_url'),
    prompt: params.get('prompt'),
    mode: params.get('mode') || 'edit',
    taskId: params.get('task_id'),
    aiModel: params.get('ai_model'),
  };
}

/**
 * Load volume by filesystem path via the task API.
 * Returns volume metadata with an assigned ID.
 */
export async function loadVolumeByPath(volumePath) {
  const resp = await fetch(`/api/v1/task/load-volume?path=${encodeURIComponent(volumePath)}`);
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: resp.statusText }));
    throw new Error(err.detail || 'Failed to load volume');
  }
  return resp.json();
}

/**
 * Load segmentation mask by filesystem path.
 * Returns Uint8Array of segmentation data.
 */
export async function loadMasksByFolder(masksFolder, volumeId, dims) {
  const resp = await fetch(
    `/api/v1/task/list-segmentation-folder?folder=${encodeURIComponent(masksFolder)}`
  );
  if (!resp.ok) throw new Error('Failed to list segmentation folder');
  const fileList = await resp.json();

  const totalVoxels = dims[0] * dims[1] * dims[2];
  const merged = new Uint8Array(totalVoxels);
  const apiLabels = [];
  let labelValue = 1;

  for (const file of fileList) {
    const maskData = await loadMaskByPath(file.path, volumeId);
    for (let i = 0; i < totalVoxels; i++) {
      if (maskData[i] !== 0 && merged[i] === 0) merged[i] = labelValue;
    }
    apiLabels.push({ value: labelValue, name: file.name });
    labelValue++;
  }
  return { merged, apiLabels };
}

export async function loadMaskByPath(maskPath, volumeId) {
  const resp = await fetch(
    `/api/v1/task/load-segmentation?path=${encodeURIComponent(maskPath)}&volume_id=${volumeId}`
  );
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: resp.statusText }));
    throw new Error(err.detail || 'Failed to load mask');
  }
  const buffer = await resp.arrayBuffer();
  return new Uint8Array(buffer);
}

/**
 * Load all .nii.gz masks in a folder merged into a single uint8 multi-label volume.
 * Returns { data: Uint8Array, labels: Map<number, {name, value, color}> }.
 */
export async function loadMaskFolderByPath(folderPath, volumeId) {
  const resp = await fetch(
    `/api/v1/task/load-segmentation-folder?folder=${encodeURIComponent(folderPath)}&volume_id=${volumeId}`
  );
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({ detail: resp.statusText }));
    throw new Error(err.detail || 'Failed to load segmentation folder');
  }
  const buffer = await resp.arrayBuffer();
  const data = new Uint8Array(buffer);

  // Parse label names from header: "1=aorta,2=liver,..."
  const labelHeader = resp.headers.get('X-Label-Names') || '';
  const COLORS = [
    null,
    { r: 255, g: 80,  b: 80  },
    { r: 80,  g: 255, b: 80  },
    { r: 80,  g: 80,  b: 255 },
    { r: 255, g: 255, b: 80  },
    { r: 80,  g: 255, b: 255 },
    { r: 255, g: 80,  b: 255 },
    { r: 255, g: 160, b: 80  },
    { r: 80,  g: 160, b: 255 },
  ];
  const labels = new Map();
  labels.set(0, { name: 'Background', value: 0, color: null, isVisible: false });
  for (const pair of labelHeader.split(',')) {
    const eq = pair.indexOf('=');
    if (eq < 0) continue;
    const val = parseInt(pair.slice(0, eq), 10);
    const name = pair.slice(eq + 1);
    labels.set(val, {
      name,
      value: val,
      color: COLORS[val % COLORS.length] ?? { r: 200, g: 200, b: 200 },
      isVisible: true,
    });
  }

  return { data, labels };
}

/**
 * Save mask to the specified output path and POST callback.
 */
export async function completeTask(taskParams, state, volumeId, startTime) {
  const timeSpent = Math.round((Date.now() - startTime) / 1000);

  // Save mask to output path if specified
  if (taskParams.output && state.segVolume) {
    const saveResp = await fetch(
      `/api/v1/task/save-mask?volume_id=${volumeId}&output_path=${encodeURIComponent(taskParams.output)}`,
      {
        method: 'POST',
        body: state.segVolume,
        headers: { 'Content-Type': 'application/octet-stream' },
      }
    );
    if (!saveResp.ok) {
      const err = await saveResp.json().catch(() => ({}));
      throw new Error(err.detail || 'Failed to save mask');
    }
  }

  // Gather QC response if present
  const qcDecision = document.querySelector('#task-decision')?.value || 'completed';
  const qcText = document.querySelector('#task-response-text')?.value || '';

  // Collect which labels were modified
  const labelsModified = [];
  for (const [val] of state.labels) {
    if (val !== 0) labelsModified.push(val);
  }

  // POST to callback
  if (taskParams.callback) {
    const payload = {
      volume_id: volumeId,
      callback_url: taskParams.callback,
      callback_auth: taskParams.callbackAuth || null,
      output_mask_path: taskParams.output || null,
      decision: qcDecision,
      text: qcText,
      labels_modified: labelsModified,
      time_spent_seconds: timeSpent,
      task_id: taskParams.taskId,
    };

    const resp = await fetch('/api/v1/task/complete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return resp.json();
  }

  return { status: 'completed', mask_saved: !!taskParams.output };
}

/**
 * Build the task prompt bar + QC controls shown at the top of the viewer.
 */
export function buildTaskUI(taskParams, container, onComplete) {
  const bar = document.createElement('div');
  bar.className = 'task-bar';

  // Prompt / instructions
  if (taskParams.prompt) {
    const promptEl = document.createElement('div');
    promptEl.className = 'task-prompt';
    promptEl.textContent = taskParams.prompt;
    bar.appendChild(promptEl);
  }

  const isQC = taskParams.mode === 'qc' || taskParams.mode === 'edit+qc';

  // QC controls
  if (isQC) {
    const qcControls = document.createElement('div');
    qcControls.className = 'task-qc-controls';

    // Decision dropdown
    const decision = document.createElement('select');
    decision.id = 'task-decision';
    decision.innerHTML = `
      <option value="accept">Accept</option>
      <option value="reject">Reject</option>
    `;
    qcControls.appendChild(decision);

    // Text response
    const textInput = document.createElement('input');
    textInput.type = 'text';
    textInput.id = 'task-response-text';
    textInput.placeholder = 'Notes (optional)';
    textInput.className = 'task-text-input';
    qcControls.appendChild(textInput);

    bar.appendChild(qcControls);
  }

  // Submit button
  const submitBtn = document.createElement('button');
  submitBtn.className = 'task-submit-btn';
  submitBtn.textContent = isQC ? 'Submit Review' : 'Complete Task';
  submitBtn.addEventListener('click', onComplete);
  bar.appendChild(submitBtn);

  container.insertBefore(bar, container.firstChild);
  return bar;
}
