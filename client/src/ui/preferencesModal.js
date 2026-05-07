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

  const selectBtn = document.createElement('button');
  selectBtn.textContent = 'Select Model File…';
  selectBtn.className = 'btn';
  selectBtn.type = 'button';
  selectBtn.onclick = () => fileInput.click();

  const selectedLabel = document.createElement('span');
  selectedLabel.style.cssText = 'font-size:13px;color:#a0a0a0;';
  selectedLabel.textContent = 'No file selected';

  uploadRow.appendChild(fileInput);
  uploadRow.appendChild(selectBtn);
  uploadRow.appendChild(selectedLabel);
  uploadWrap.appendChild(uploadRow);

  // Info note for .pth files
  const archNote = document.createElement('div');
  archNote.style.cssText = 'display:none;font-size:12px;color:#a0a0a0;margin-bottom:8px;';
  archNote.textContent = '.pth/.pt: architecture is auto-detected for MONAI UNet state dicts. Full nn.Module files load without configuration.';
  uploadWrap.appendChild(archNote);

  // Upload button + status
  const uploadActionRow = document.createElement('div');
  uploadActionRow.style.cssText = 'display:flex;align-items:center;gap:10px;';

  const uploadBtn = document.createElement('button');
  uploadBtn.textContent = 'Upload';
  uploadBtn.className = 'btn btn-primary';
  uploadBtn.type = 'button';
  uploadBtn.disabled = true;

  const uploadStatus = document.createElement('span');
  uploadStatus.style.cssText = 'font-size:13px;color:#a0a0a0;';

  uploadActionRow.appendChild(uploadBtn);
  uploadActionRow.appendChild(uploadStatus);
  uploadWrap.appendChild(uploadActionRow);

  let selectedModelFile = null;
  let selectedConfigFile = null;

  fileInput.onchange = (e) => {
    const files = Array.from(e.target.files);
    selectedModelFile = null;
    selectedConfigFile = null;

    for (const f of files) {
      if (f.name.endsWith('.json')) {
        selectedConfigFile = f;
      } else if (f.name.endsWith('.onnx') || f.name.endsWith('.safetensors') || f.name.endsWith('.pth') || f.name.endsWith('.pt')) {
        selectedModelFile = f;
      }
    }

    if (!selectedModelFile) {
      selectedLabel.textContent = 'No valid model file found';
      uploadBtn.disabled = true;
      archNote.style.display = 'none';
      return;
    }

    selectedLabel.textContent = selectedModelFile.name;
    uploadBtn.disabled = false;
    uploadStatus.textContent = '';

    const isPth = selectedModelFile.name.endsWith('.pth') || selectedModelFile.name.endsWith('.pt');
    archNote.style.display = isPth ? 'block' : 'none';
  };

  uploadBtn.onclick = async () => {
    if (!selectedModelFile) return;

    if (selectedModelFile.name.endsWith('.safetensors') && !selectedConfigFile) {
      uploadStatus.textContent = 'SafeTensors requires a config.json — select both files.';
      uploadStatus.style.color = '#ff6b6b';
      return;
    }

    uploadStatus.textContent = `Uploading ${selectedModelFile.name}…`;
    uploadStatus.style.color = '#4a9eff';
    uploadBtn.disabled = true;
    selectBtn.disabled = true;

    const formData = new FormData();
    formData.append('file', selectedModelFile);
    if (selectedConfigFile) formData.append('config', selectedConfigFile);

    try {
      const res = await fetch('/api/v1/ai/upload-model', { method: 'POST', body: formData });
      if (!res.ok) {
        const txt = await res.text();
        let msg = 'Upload failed';
        try { msg = JSON.parse(txt).detail || msg; } catch (_) { msg = txt || msg; }
        throw new Error(msg);
      }
      uploadStatus.textContent = 'Uploaded successfully.';
      uploadStatus.style.color = '#4caf50';
      selectedModelFile = null;
      selectedConfigFile = null;
      selectedLabel.textContent = 'No file selected';
      archNote.style.display = 'none';
      fileInput.value = '';
    } catch (err) {
      console.error(err);
      uploadStatus.textContent = `Error: ${err.message}`;
      uploadStatus.style.color = '#ff6b6b';
    } finally {
      uploadBtn.disabled = !selectedModelFile;
      selectBtn.disabled = false;
    }
  };

  aiSec.appendChild(uploadWrap);

  form.appendChild(aiSec);

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
