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

  // 3. Default Labels Section
  const labelSec = createSection('Default Labels');
  const labelInputs = {};
  ['1', '2', '3', '4', '5'].forEach(lbl => {
    const inp = document.createElement('input');
    inp.type = 'text';
    inp.value = configData.default_labels?.[lbl] || `Label ${lbl}`;
    labelSec.appendChild(createInputRow(`Label ${lbl}:`, inp));
    labelInputs[lbl] = inp;
  });
  form.appendChild(labelSec);

  // 4. AI Configuration Section
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
  const uploadRow = document.createElement('div');
  uploadRow.style.display = 'flex';
  uploadRow.style.alignItems = 'center';
  uploadRow.style.gap = '10px';
  uploadRow.style.marginTop = '1rem';
  uploadRow.style.paddingTop = '1rem';
  uploadRow.style.borderTop = '1px solid #444';

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.onnx,.safetensors,.pth,.pt,.json';
  fileInput.multiple = true;
  fileInput.style.display = 'none';

  const uploadBtn = document.createElement('button');
  uploadBtn.textContent = 'Upload Custom Model (Select both Model & Config.json)';
  uploadBtn.className = 'btn';
  uploadBtn.type = 'button';

  const uploadStatus = document.createElement('span');
  uploadStatus.style.fontSize = '13px';
  uploadStatus.style.color = '#a0a0a0';

  uploadBtn.onclick = () => fileInput.click();

  fileInput.onchange = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    let modelFile = null;
    let configFile = null;

    for (const f of files) {
      if (f.name.endsWith('.json')) {
        configFile = f;
      } else if (f.name.endsWith('.onnx') || f.name.endsWith('.safetensors') || f.name.endsWith('.pth') || f.name.endsWith('.pt')) {
        modelFile = f;
      }
    }

    if (!modelFile) {
      uploadStatus.textContent = 'Error: No valid model file selected.';
      uploadStatus.style.color = '#ff6b6b';
      return;
    }

    if ((modelFile.name.endsWith('.safetensors') || modelFile.name.endsWith('.pth') || modelFile.name.endsWith('.pt')) && !configFile) {
      uploadStatus.textContent = 'Error: Please select config.json ALONG WITH the model file.';
      uploadStatus.style.color = '#ff6b6b';
      fileInput.value = '';
      return;
    }

    performUpload(modelFile, configFile);
  };

  async function performUpload(file, configFile) {
    uploadStatus.textContent = `Uploading ${file.name}...`;
    uploadStatus.style.color = '#4a9eff';
    uploadBtn.disabled = true;

    const formData = new FormData();
    formData.append('file', file);
    if (configFile) formData.append('config', configFile);

    try {
      const res = await fetch('/api/v1/ai/upload-model', { method: 'POST', body: formData });

      if (!res.ok) {
        const textData = await res.text();
        let errMsg = 'Upload failed';
        try { errMsg = JSON.parse(textData).detail || errMsg; } catch (e) { errMsg = textData || errMsg; }
        throw new Error(errMsg);
      }

      uploadStatus.textContent = 'Success! Reload UI.';
      uploadStatus.style.color = '#4caf50';
    } catch (err) {
      console.error(err);
      uploadStatus.textContent = `Error: ${err.message}`;
      uploadStatus.style.color = '#ff6b6b';
    } finally {
      uploadBtn.disabled = false;
      fileInput.value = '';
    }
  }

  uploadRow.appendChild(fileInput);
  uploadRow.appendChild(uploadBtn);
  uploadRow.appendChild(uploadStatus);
  aiSec.appendChild(uploadRow);

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
      default_labels: {},
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

    for (const lbl in labelInputs) {
      newConfig.default_labels[lbl] = labelInputs[lbl].value;
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
