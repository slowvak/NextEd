// Copyright Bradley J Erickson, 2026.
/**
 * showFolderPickerModal — Displayed on startup when no source_directory is set.
 *
 * Returns a Promise that resolves to the chosen folder path (string) when the
 * user confirms, or null if they dismiss with no selection.
 */
// Server-side directory browser, shared by the folder picker modal and the
// save-NIfTI dialog. The server used to pop a native osascript folder dialog on
// its own machine; containerized there is no osascript, no display and no
// tkinter, so that button did nothing. Listing over the API works in both cases
// and over a network besides.
//
// Writes the current directory into `pathInput` as you navigate and reports
// problems through `statusLine`. Returns the list element to insert, plus a
// toggle to wire to a Browse button.
export function createFolderBrowser(pathInput, statusLine) {
  const element = document.createElement('div');
  element.style.cssText = [
    'display:none', 'margin-top:10px', 'max-height:240px', 'overflow-y:auto',
    'background:#0d1017', 'border:1px solid rgba(99,130,255,0.3)',
    'border-radius:8px', 'font-family:ui-monospace,monospace',
    'font-size:0.82rem',
  ].join(';');

  const rowStyle = [
    'padding:0.4rem 0.7rem', 'cursor:pointer', 'color:#c9d1ea',
    'border-bottom:1px solid rgba(99,130,255,0.08)',
    'white-space:nowrap', 'overflow:hidden', 'text-overflow:ellipsis',
  ].join(';');

  const makeRow = (label, onClick) => {
    const row = document.createElement('div');
    row.textContent = label;
    row.style.cssText = rowStyle;
    row.addEventListener('mouseenter', () => { row.style.background = 'rgba(99,130,255,0.14)'; });
    row.addEventListener('mouseleave', () => { row.style.background = 'none'; });
    row.addEventListener('click', onClick);
    return row;
  };

  const setStatus = (text) => { if (statusLine) statusLine.textContent = text; };

  async function loadDir(path) {
    setStatus('Loading…');
    try {
      const url = '/api/v1/config/list-dir' + (path ? `?path=${encodeURIComponent(path)}` : '');
      const res = await fetch(url);
      if (!res.ok) {
        const { detail } = await res.json().catch(() => ({}));
        throw new Error(detail || `HTTP ${res.status}`);
      }
      const { path: here, parent, dirs } = await res.json();
      pathInput.value = here;
      element.replaceChildren();
      if (parent) element.appendChild(makeRow('📁 ..', () => loadDir(parent)));
      for (const name of dirs) {
        element.appendChild(makeRow(`📁 ${name}`, () => loadDir(`${here.replace(/\/$/, '')}/${name}`)));
      }
      if (!dirs.length && !parent) {
        const empty = document.createElement('div');
        empty.textContent = 'No subfolders here.';
        empty.style.cssText = 'padding:0.4rem 0.7rem;color:#5a6080;';
        element.appendChild(empty);
      }
      element.style.display = 'block';
      setStatus('Navigate to a folder, then confirm.');
    } catch (err) {
      setStatus(`Could not list directory: ${err.message}`);
      console.warn('[FolderBrowser] list-dir error:', err);
    }
  }

  const toggle = () => {
    if (element.style.display === 'block') {
      element.style.display = 'none';
      setStatus('');
      return;
    }
    loadDir(pathInput.value.trim() || undefined);
  };

  return { element, toggle, loadDir };
}

export function showFolderPickerModal() {
  return new Promise((resolve) => {
    // Overlay
    const overlay = document.createElement('div');
    overlay.id = 'folder-picker-overlay';
    overlay.style.cssText = [
      'position:fixed', 'inset:0', 'z-index:9999',
      'display:flex', 'align-items:center', 'justify-content:center',
      'background:rgba(10,12,20,0.85)',
      'backdrop-filter:blur(6px)',
      '-webkit-backdrop-filter:blur(6px)',
    ].join(';');

    // Card
    const card = document.createElement('div');
    card.style.cssText = [
      'background:linear-gradient(160deg,#1b1f2e 0%,#13161f 100%)',
      'border:1px solid rgba(99,130,255,0.25)',
      'border-radius:14px',
      'padding:2.2rem 2.4rem 2rem',
      'width:520px',
      'max-width:95vw',
      'box-shadow:0 24px 60px rgba(0,0,0,0.7), 0 0 0 1px rgba(99,130,255,0.08)',
      'color:#e8eaf6',
      'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
    ].join(';');

    // Header
    const header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;gap:12px;margin-bottom:0.5rem;';

    const icon = document.createElement('div');
    icon.style.cssText = [
      'width:40px', 'height:40px', 'border-radius:10px',
      'background:linear-gradient(135deg,#4a6cf7,#8b5cf6)',
      'display:flex', 'align-items:center', 'justify-content:center',
      'font-size:20px', 'flex-shrink:0',
    ].join(';');
    icon.textContent = '📂';

    const titleWrap = document.createElement('div');
    const title = document.createElement('h2');
    title.textContent = 'Select Image Folder';
    title.style.cssText = 'margin:0;font-size:1.2rem;font-weight:700;color:#fff;';
    const sub = document.createElement('p');
    sub.textContent = 'Choose the folder containing your NIfTI or DICOM volumes.';
    sub.style.cssText = 'margin:2px 0 0;font-size:0.82rem;color:#8890b0;';

    titleWrap.appendChild(title);
    titleWrap.appendChild(sub);
    header.appendChild(icon);
    header.appendChild(titleWrap);
    card.appendChild(header);

    // Divider
    const hr = document.createElement('div');
    hr.style.cssText = 'border-top:1px solid rgba(99,130,255,0.12);margin:1.2rem 0 1.4rem;';
    card.appendChild(hr);

    // Path input row
    const inputRow = document.createElement('div');
    inputRow.style.cssText = 'display:flex;gap:8px;align-items:center;margin-bottom:1.2rem;';

    const pathInput = document.createElement('input');
    pathInput.id = 'folder-path-input';
    pathInput.type = 'text';
    pathInput.placeholder = '/path/to/your/data';
    pathInput.autocomplete = 'off';
    pathInput.spellcheck = false;
    pathInput.style.cssText = [
      'flex:1', 'padding:0.55rem 0.75rem',
      'background:#0d1017', 'border:1px solid rgba(99,130,255,0.3)',
      'border-radius:8px', 'color:#c9d1ea', 'font-size:0.87rem',
      'font-family:ui-monospace,monospace', 'outline:none',
      'transition:border-color 0.15s',
    ].join(';');
    pathInput.addEventListener('focus', () => {
      pathInput.style.borderColor = 'rgba(99,130,255,0.7)';
    });
    pathInput.addEventListener('blur', () => {
      pathInput.style.borderColor = 'rgba(99,130,255,0.3)';
    });

    const browseBtn = document.createElement('button');
    browseBtn.id = 'folder-browse-btn';
    browseBtn.textContent = 'Browse…';
    browseBtn.style.cssText = [
      'padding:0.55rem 1rem', 'white-space:nowrap',
      'background:rgba(99,130,255,0.14)', 'color:#a0b0ff',
      'border:1px solid rgba(99,130,255,0.3)', 'border-radius:8px',
      'cursor:pointer', 'font-size:0.85rem', 'font-weight:500',
      'transition:background 0.15s,color 0.15s',
    ].join(';');
    browseBtn.addEventListener('mouseenter', () => {
      browseBtn.style.background = 'rgba(99,130,255,0.25)';
      browseBtn.style.color = '#c9d1ff';
    });
    browseBtn.addEventListener('mouseleave', () => {
      browseBtn.style.background = 'rgba(99,130,255,0.14)';
      browseBtn.style.color = '#a0b0ff';
    });

    // Status / error line
    const statusLine = document.createElement('div');
    statusLine.style.cssText = 'font-size:0.78rem;color:#5a6080;margin-top:4px;min-height:1.1em;';

    const { element: browser, toggle } = createFolderBrowser(pathInput, statusLine);
    browseBtn.addEventListener('click', toggle);

    inputRow.appendChild(pathInput);
    inputRow.appendChild(browseBtn);
    card.appendChild(inputRow);
    card.appendChild(statusLine);
    card.appendChild(browser);

    // Action buttons
    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;justify-content:flex-end;gap:10px;margin-top:1.6rem;';

    const skipBtn = document.createElement('button');
    skipBtn.id = 'folder-skip-btn';
    skipBtn.textContent = 'Skip for now';
    skipBtn.style.cssText = [
      'padding:0.55rem 1.1rem',
      'background:none', 'color:#5a6080',
      'border:1px solid rgba(255,255,255,0.1)', 'border-radius:8px',
      'cursor:pointer', 'font-size:0.85rem',
      'transition:color 0.15s,border-color 0.15s',
    ].join(';');
    skipBtn.addEventListener('mouseenter', () => {
      skipBtn.style.color = '#8890b0';
      skipBtn.style.borderColor = 'rgba(255,255,255,0.2)';
    });
    skipBtn.addEventListener('mouseleave', () => {
      skipBtn.style.color = '#5a6080';
      skipBtn.style.borderColor = 'rgba(255,255,255,0.1)';
    });
    skipBtn.addEventListener('click', () => {
      document.body.removeChild(overlay);
      resolve(null);
    });

    const confirmBtn = document.createElement('button');
    confirmBtn.id = 'folder-confirm-btn';
    confirmBtn.textContent = 'Open Folder';
    confirmBtn.style.cssText = [
      'padding:0.55rem 1.4rem',
      'background:linear-gradient(135deg,#4a6cf7,#7c3aed)',
      'color:#fff', 'border:none', 'border-radius:8px',
      'cursor:pointer', 'font-size:0.85rem', 'font-weight:600',
      'box-shadow:0 2px 12px rgba(74,108,247,0.4)',
      'transition:opacity 0.15s,box-shadow 0.15s',
    ].join(';');
    confirmBtn.addEventListener('mouseenter', () => {
      confirmBtn.style.opacity = '0.9';
      confirmBtn.style.boxShadow = '0 4px 18px rgba(74,108,247,0.6)';
    });
    confirmBtn.addEventListener('mouseleave', () => {
      confirmBtn.style.opacity = '1';
      confirmBtn.style.boxShadow = '0 2px 12px rgba(74,108,247,0.4)';
    });

    confirmBtn.addEventListener('click', async () => {
      const chosenPath = pathInput.value.trim();
      if (!chosenPath) {
        pathInput.style.borderColor = '#e55';
        setTimeout(() => { pathInput.style.borderColor = 'rgba(99,130,255,0.3)'; }, 1200);
        return;
      }

      confirmBtn.disabled = true;
      confirmBtn.textContent = 'Saving Configuration…';

      try {
        // Load current config, merge in the new source_directory, save
        const cfgRes = await fetch('/api/v1/config');
        const cfg = cfgRes.ok ? await cfgRes.json() : {};
        cfg.source_directory = chosenPath;
        await fetch('/api/v1/config', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cfg),
        });
        
        statusLine.textContent = 'Scanning folder... this may take a moment for large directories.';
        confirmBtn.textContent = 'Scanning...';
        
        // Trigger rescan on server
        const rescanRes = await fetch('/api/v1/volumes/rescan', { method: 'POST' });
        if (rescanRes.ok) {
          const rescanData = await rescanRes.json();
          statusLine.textContent = `Found ${rescanData.volumes_found} volumes.`;
        }
        
        document.body.removeChild(overlay);
        resolve(chosenPath);
      } catch (err) {
        console.error('[FolderPicker] error:', err);
        statusLine.textContent = 'Failed to fetch — check server connection.';
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Open Folder';
      }
    });

    // Also confirm on Enter
    pathInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') confirmBtn.click();
    });

    actions.appendChild(skipBtn);
    actions.appendChild(confirmBtn);
    card.appendChild(actions);

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    // Auto-focus the input
    setTimeout(() => pathInput.focus(), 50);
  });
}
