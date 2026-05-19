// Copyright Bradley J Erickson, 2026.
export async function openPreferencesModal() {
  // Fetch current config
  let configData;
  try {
    const res = await fetch('/api/v1/config');
    if (!res.ok) throw new Error('Network response was not ok');
    configData = await res.json();
  } catch (err) {
    console.error('Failed to load config:', err);
    alert('Failed to load preferences. Is the server running?');
    return;
  }

  // Create UI
  const overlay = document.createElement('div');
  overlay.style.position = 'fixed';
  overlay.style.top = '0';
  overlay.style.left = '0';
  overlay.style.width = '100vw';
  overlay.style.height = '100vh';
  overlay.style.backgroundColor = 'rgba(0,0,0,0.7)';
  overlay.style.display = 'flex';
  overlay.style.justifyContent = 'center';
  overlay.style.alignItems = 'center';
  overlay.style.zIndex = '9999';

  const modal = document.createElement('div');
  modal.className = 'preferences-modal';
  modal.style.backgroundColor = '#1e1e1e';
  modal.style.padding = '2rem';
  modal.style.borderRadius = '8px';
  modal.style.minWidth = '500px';
  modal.style.maxWidth = '800px';
  modal.style.maxHeight = '90vh';
  modal.style.overflowY = 'auto';
  modal.style.color = '#eee';
  modal.style.boxShadow = '0 10px 25px rgba(0,0,0,0.5)';

  const title = document.createElement('h2');
  title.textContent = 'Preferences';
  title.style.marginTop = '0';
  modal.appendChild(title);

  const form = document.createElement('form');
  form.onsubmit = (e) => e.preventDefault();

  // Helper to create grouped sections
  const createSection = (titleText) => {
    const sec = document.createElement('div');
    sec.style.marginBottom = '1.5rem';
    sec.style.padding = '1rem';
    sec.style.border = '1px solid #444';
    sec.style.borderRadius = '6px';
    
    const h3 = document.createElement('h3');
    h3.textContent = titleText;
    h3.style.margin = '0 0 1rem 0';
    h3.style.fontSize = '1.1rem';
    sec.appendChild(h3);
    return sec;
  };

  const createInputRow = (labelText, inputElem) => {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.marginBottom = '0.5rem';
    row.style.alignItems = 'center';
    
    const label = document.createElement('label');
    label.textContent = labelText;
    label.style.width = '180px';
    label.style.flexShrink = '0';
    
    inputElem.style.flexGrow = '1';
    inputElem.style.padding = '0.5rem';
    inputElem.style.backgroundColor = '#333';
    inputElem.style.color = 'white';
    inputElem.style.border = '1px solid #555';
    inputElem.style.borderRadius = '4px';

    row.appendChild(label);
    row.appendChild(inputElem);
    return row;
  };

  // 1. General Section
  const genSec = createSection('General');
  const sourceInput = document.createElement('input');
  sourceInput.type = 'text';
  sourceInput.value = configData.source_directory || '';
  genSec.appendChild(createInputRow('Source Directory Path:', sourceInput));
  form.appendChild(genSec);

  // 2. Window/Level Section
  const wlSec = createSection('Window/Level Presets');
  const wlInputs = {};
  ['Brain', 'Bone', 'Lung', 'Abd'].forEach(preset => {
    const pData = configData.window_level_presets?.[preset] || { center: 0, width: 0 };
    
    const centerInput = document.createElement('input');
    centerInput.type = 'number';
    centerInput.value = pData.center;
    centerInput.style.marginRight = '1rem';
    
    const widthInput = document.createElement('input');
    widthInput.type = 'number';
    widthInput.value = pData.width;

    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.marginBottom = '0.5rem';
    row.style.alignItems = 'center';
    
    const label = document.createElement('label');
    label.textContent = preset + ' (C / W):';
    label.style.width = '180px';
    
    row.appendChild(label);
    row.appendChild(centerInput);
    row.appendChild(widthInput);
    wlSec.appendChild(row);
    
    wlInputs[preset] = { center: centerInput, width: widthInput };
  });
  form.appendChild(wlSec);

  // 3. AI Configuration Section
  const aiSec = createSection('AI Configuration');
  const aiServerInput = document.createElement('input');
  aiServerInput.type = 'text';
  aiServerInput.value = configData.ai?.server || 'http://localhost:8050';
  aiSec.appendChild(createInputRow('AI Server URL:', aiServerInput));

  // Live model list from SigmaServer
  const modelsRow = document.createElement('div');
  modelsRow.style.cssText = 'display:flex;margin-bottom:0.5rem;align-items:flex-start;';
  const modelsLabel = document.createElement('label');
  modelsLabel.textContent = 'Available Models:';
  modelsLabel.style.cssText = 'width:180px;flex-shrink:0;padding-top:4px;';
  const modelsDisplay = document.createElement('div');
  modelsDisplay.style.cssText = 'flex-grow:1;padding:0.5rem;background:#2a2a2a;border:1px solid #555;border-radius:4px;font-size:13px;min-height:40px;';
  modelsDisplay.textContent = 'Loading…';
  modelsRow.appendChild(modelsLabel);
  modelsRow.appendChild(modelsDisplay);
  aiSec.appendChild(modelsRow);

  fetch('/api/v1/ai/models').then(r => r.json()).then(models => {
    if (!models || models.length === 0) {
      modelsDisplay.style.color = '#a0a0a0';
      modelsDisplay.textContent = 'No models available — is SigmaServer running?';
    } else {
      modelsDisplay.innerHTML = models.map(m =>
        `<div style="margin-bottom:4px;"><span style="color:#4a9eff;font-weight:600;">${m.name}</span> <span style="color:#a0a0a0;font-size:12px;">${m.description || ''}</span></div>`
      ).join('');
    }
  }).catch(() => {
    modelsDisplay.style.color = '#ff6b6b';
    modelsDisplay.textContent = 'Could not reach AI server.';
  });

  // Upload Model UI
  const uploadWrap = document.createElement('div');
  uploadWrap.style.cssText = 'margin-top:1rem;padding-top:1rem;border-top:1px solid #444;';

  // File selection row
  const uploadRow = document.createElement('div');
  uploadRow.style.cssText = 'display:flex;align-items:center;gap:10px;margin-bottom:8px;';

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.onnx,.safetensors,.pth,.pt,.json';
  fileInput.multiple = true;
  fileInput.style.display = 'none';

  const uploadBtn = document.createElement('button');
  uploadBtn.textContent = 'Upload Custom Model…';
  uploadBtn.className = 'btn';
  uploadBtn.type = 'button';
  uploadBtn.onclick = () => fileInput.click();

  const removeModelBtn = document.createElement('button');
  removeModelBtn.textContent = 'Remove Model…';
  removeModelBtn.className = 'btn';
  removeModelBtn.type = 'button';
  removeModelBtn.onclick = () => _showRemoveModelDialog(uploadStatus);

  const uploadStatus = document.createElement('span');
  uploadStatus.style.cssText = 'font-size:13px;color:#a0a0a0;';

  uploadRow.appendChild(fileInput);
  uploadRow.appendChild(uploadBtn);
  uploadRow.appendChild(removeModelBtn);
  uploadRow.appendChild(uploadStatus);
  uploadWrap.appendChild(uploadRow);

  // Name row — shown after file selection
  const nameRow = document.createElement('div');
  nameRow.style.cssText = 'display:none;align-items:center;gap:8px;margin-bottom:8px;';

  const nameLabel = document.createElement('label');
  nameLabel.textContent = 'Friendly Name:';
  nameLabel.style.cssText = 'font-size:13px;white-space:nowrap;color:#ccc;';

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.style.cssText = 'flex:1;background:#2a2a2a;border:1px solid #555;border-radius:4px;padding:4px 8px;color:#fff;font-size:13px;';

  const doUploadBtn = document.createElement('button');
  doUploadBtn.textContent = 'Upload';
  doUploadBtn.className = 'btn';
  doUploadBtn.type = 'button';

  nameRow.appendChild(nameLabel);
  nameRow.appendChild(nameInput);
  nameRow.appendChild(doUploadBtn);
  uploadWrap.appendChild(nameRow);

  let pendingModelFile = null;
  let pendingConfigFile = null;

  fileInput.onchange = (e) => {
    const files = Array.from(e.target.files);
    pendingModelFile = null;
    pendingConfigFile = null;

    for (const f of files) {
      if (f.name.endsWith('.json')) {
        pendingConfigFile = f;
      } else if (f.name.endsWith('.onnx') || f.name.endsWith('.safetensors') || f.name.endsWith('.pth') || f.name.endsWith('.pt')) {
        pendingModelFile = f;
      }
    }

    uploadStatus.textContent = '';
    nameRow.style.display = 'none';

    if (!pendingModelFile) {
      uploadStatus.textContent = 'No valid model file found.';
      uploadStatus.style.color = '#ff6b6b';
      fileInput.value = '';
      return;
    }

    if (pendingModelFile.name.endsWith('.safetensors') && !pendingConfigFile) {
      uploadStatus.textContent = 'SafeTensors requires a config.json — select both files together.';
      uploadStatus.style.color = '#ff6b6b';
      fileInput.value = '';
      return;
    }

    // Pre-fill name from filename stem and show name row
    const stem = pendingModelFile.name.replace(/\.[^.]+$/, '').replace(/[_-]/g, ' ');
    nameInput.value = stem;
    nameRow.style.display = 'flex';
    nameInput.focus();
    nameInput.select();
  };

  doUploadBtn.onclick = async () => {
    if (!pendingModelFile) return;

    uploadStatus.textContent = `Uploading…`;
    uploadStatus.style.color = '#4a9eff';
    doUploadBtn.disabled = true;
    uploadBtn.disabled = true;

    const formData = new FormData();
    formData.append('file', pendingModelFile);
    if (pendingConfigFile) formData.append('config', pendingConfigFile);
    const friendlyName = nameInput.value.trim();
    if (friendlyName) formData.append('name', friendlyName);

    try {
      const res = await fetch('/api/v1/ai/upload-model', { method: 'POST', body: formData });
      if (!res.ok) {
        const txt = await res.text();
        let msg = 'Upload failed';
        try { msg = JSON.parse(txt).detail || msg; } catch (_) { msg = txt || msg; }
        throw new Error(msg);
      }
      const displayName = friendlyName || pendingModelFile.name;
      uploadStatus.textContent = `"${displayName}" uploaded successfully.`;
      uploadStatus.style.color = '#4caf50';
      nameRow.style.display = 'none';
      pendingModelFile = null;
      pendingConfigFile = null;
    } catch (err) {
      console.error(err);
      uploadStatus.textContent = `Error: ${err.message}`;
      uploadStatus.style.color = '#ff6b6b';
    } finally {
      doUploadBtn.disabled = false;
      uploadBtn.disabled = false;
      fileInput.value = '';
    }
  };

  async function _showRemoveModelDialog(statusEl) {
    // Fetch current models
    let models;
    try {
      const res = await fetch('/api/v1/ai/models');
      models = await res.json();
    } catch (_) {
      models = null;
    }

    const removable = (models || []).filter(m => !m.builtin);
    if (removable.length === 0) {
      statusEl.textContent = 'No removable models (built-in models cannot be removed).';
      statusEl.style.color = '#a0a0a0';
      return;
    }

    // Build inline selection UI appended to uploadWrap
    const existing = uploadWrap.querySelector('.remove-model-panel');
    if (existing) { existing.remove(); return; }

    const panel = document.createElement('div');
    panel.className = 'remove-model-panel';
    panel.style.cssText = 'margin-top:8px;padding:10px;background:#2a2a2a;border:1px solid #555;border-radius:6px;';

    const panelLabel = document.createElement('div');
    panelLabel.textContent = 'Select model to remove:';
    panelLabel.style.cssText = 'font-size:13px;color:#ccc;margin-bottom:6px;';
    panel.appendChild(panelLabel);

    const select = document.createElement('select');
    select.style.cssText = 'width:100%;background:#333;color:#fff;border:1px solid #555;border-radius:4px;padding:4px 6px;font-size:13px;margin-bottom:8px;';
    for (const m of removable) {
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = m.name || m.id;
      select.appendChild(opt);
    }
    panel.appendChild(select);

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:8px;align-items:center;';

    const confirmBtn = document.createElement('button');
    confirmBtn.textContent = 'Remove';
    confirmBtn.className = 'btn';
    confirmBtn.style.cssText = 'background:#c0392b;border-color:#e74c3c;color:#fff;';
    confirmBtn.type = 'button';

    const cancelBtn2 = document.createElement('button');
    cancelBtn2.textContent = 'Cancel';
    cancelBtn2.className = 'btn';
    cancelBtn2.type = 'button';
    cancelBtn2.onclick = () => panel.remove();

    const panelStatus = document.createElement('span');
    panelStatus.style.cssText = 'font-size:12px;color:#a0a0a0;';

    btnRow.appendChild(confirmBtn);
    btnRow.appendChild(cancelBtn2);
    btnRow.appendChild(panelStatus);
    panel.appendChild(btnRow);
    uploadWrap.appendChild(panel);

    confirmBtn.onclick = async () => {
      const modelId = select.value;
      const modelName = select.options[select.selectedIndex].textContent;
      confirmBtn.disabled = true;
      panelStatus.textContent = 'Removing…';
      panelStatus.style.color = '#4a9eff';

      try {
        const res = await fetch(`/api/v1/ai/models/${encodeURIComponent(modelId)}`, { method: 'DELETE' });
        if (!res.ok) {
          const detail = await res.json().then(j => j.detail).catch(() => res.statusText);
          throw new Error(detail);
        }
        panel.remove();
        statusEl.textContent = `"${modelName}" removed.`;
        statusEl.style.color = '#4caf50';
        // Refresh the models display
        modelsDisplay.textContent = 'Loading…';
        modelsDisplay.style.color = '';
        fetch('/api/v1/ai/models').then(r => r.json()).then(updated => {
          if (!updated || updated.length === 0) {
            modelsDisplay.style.color = '#a0a0a0';
            modelsDisplay.textContent = 'No models available — is SigmaServer running?';
          } else {
            modelsDisplay.innerHTML = updated.map(m =>
              `<div style="margin-bottom:4px;"><span style="color:#4a9eff;font-weight:600;">${m.name}</span> <span style="color:#a0a0a0;font-size:12px;">${m.description || ''}</span></div>`
            ).join('');
          }
        }).catch(() => {});
      } catch (err) {
        panelStatus.textContent = `Error: ${err.message}`;
        panelStatus.style.color = '#ff6b6b';
        confirmBtn.disabled = false;
      }
    };
  }

  aiSec.appendChild(uploadWrap);

  form.appendChild(aiSec);

  // 4. Filters & Refine Section
  const filterSec = createSection('Filters & Refine');
  const filterPrefs = configData.filters || {};

  const kernel2dSelect = document.createElement('select');
  ['3x3', '5x5', '7x7'].forEach(v => {
    const opt = document.createElement('option');
    opt.value = v; opt.textContent = v.replace(/x/g, '×');
    if ((filterPrefs.kernel_2d || '3x3') === v) opt.selected = true;
    kernel2dSelect.appendChild(opt);
  });
  filterSec.appendChild(createInputRow('2D Kernel Size:', kernel2dSelect));

  const kernel3dSelect = document.createElement('select');
  ['3x3x3', '5x5x3', '5x5x5', '7x7x3', '7x7x5', '7x7x7'].forEach(v => {
    const opt = document.createElement('option');
    opt.value = v; opt.textContent = v.replace(/x/g, '×');
    if ((filterPrefs.kernel_3d || '3x3x3') === v) opt.selected = true;
    kernel3dSelect.appendChild(opt);
  });
  filterSec.appendChild(createInputRow('3D Kernel Size:', kernel3dSelect));

  const searchSizeInput = document.createElement('input');
  searchSizeInput.type = 'number';
  searchSizeInput.min = '3';
  searchSizeInput.max = '9';
  searchSizeInput.step = '1';
  searchSizeInput.value = filterPrefs.refine_search_size ?? 5;
  filterSec.appendChild(createInputRow('Refine Search Size:', searchSizeInput));

  const searchNote = document.createElement('div');
  searchNote.textContent = 'Pixels searched in each direction when snapping contour to image edges (3–9).';
  searchNote.style.cssText = 'font-size:12px;color:#888;margin-top:4px;padding-left:180px;';
  filterSec.appendChild(searchNote);

  form.appendChild(filterSec);

  // Actions
  const actions = document.createElement('div');
  actions.style.display = 'flex';
  actions.style.justifyContent = 'flex-end';
  actions.style.gap = '1rem';
  actions.style.marginTop = '1rem';

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel';
  cancelBtn.className = 'btn';
  cancelBtn.onclick = () => document.body.removeChild(overlay);

  const saveBtn = document.createElement('button');
  saveBtn.textContent = 'Save Configuration';
  saveBtn.className = 'btn btn-primary';
  saveBtn.onclick = async () => {
    const newConfig = {
      source_directory: sourceInput.value,
      window_level_presets: {},
      default_labels: configData.default_labels || {},
      ai: {
        server: aiServerInput.value,
        models: configData.ai?.models || []
      },
      filters: {
        kernel_2d: kernel2dSelect.value,
        kernel_3d: kernel3dSelect.value,
        refine_search_size: Math.min(9, Math.max(3, parseInt(searchSizeInput.value, 10) || 5)),
      }
    };

    for (const preset in wlInputs) {
      newConfig.window_level_presets[preset] = {
        center: parseFloat(wlInputs[preset].center.value),
        width: parseFloat(wlInputs[preset].width.value)
      };
    }

    try {
      const res = await fetch('/api/v1/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConfig)
      });
      if (res.ok) {
        document.body.removeChild(overlay);
        alert('Preferences saved. Please reload the page or restart the server if you changed the source directory.');
      } else {
        throw new Error('Failed to save config');
      }
    } catch (err) {
      console.error(err);
      alert('Error saving preferences.');
    }
  };

  actions.appendChild(cancelBtn);
  actions.appendChild(saveBtn);
  form.appendChild(actions);

  modal.appendChild(form);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}
