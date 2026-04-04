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

  // 4. AI Models Section
  const aiSec = createSection('AI Configuration');
  const aiServerInput = document.createElement('input');
  aiServerInput.type = 'text';
  aiServerInput.value = configData.ai?.server || 'http://localhost:8080';
  aiSec.appendChild(createInputRow('AI Server URL:', aiServerInput));

  const aiModelsInput = document.createElement('textarea');
  aiModelsInput.rows = 8;
  aiModelsInput.value = JSON.stringify(configData.ai?.models || [], null, 2);
  aiSec.appendChild(createInputRow('Models (JSON Format):', aiModelsInput));
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
    // Reconstruct config
    let parsedModels = [];
    try {
      parsedModels = JSON.parse(aiModelsInput.value);
    } catch (err) {
      alert("Invalid JSON in AI Models field.");
      return;
    }

    const newConfig = {
      source_directory: sourceInput.value,
      window_level_presets: {},
      default_labels: {},
      ai: {
        server: aiServerInput.value,
        models: parsedModels
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
