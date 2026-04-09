export function openHelpModal() {
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

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) document.body.removeChild(overlay);
  });

  const onKeydown = (e) => {
    if (e.key === 'Escape') {
      if (document.body.contains(overlay)) document.body.removeChild(overlay);
      document.removeEventListener('keydown', onKeydown);
    }
  };
  document.addEventListener('keydown', onKeydown);

  const modal = document.createElement('div');
  modal.className = 'help-modal';
  modal.style.backgroundColor = '#1e1e1e';
  modal.style.padding = '2rem';
  modal.style.borderRadius = '8px';
  modal.style.minWidth = '420px';
  modal.style.maxWidth = '600px';
  modal.style.maxHeight = '85vh';
  modal.style.overflowY = 'auto';
  modal.style.color = '#eee';
  modal.style.boxShadow = '0 10px 25px rgba(0,0,0,0.5)';

  // Header row
  const headerRow = document.createElement('div');
  headerRow.style.display = 'flex';
  headerRow.style.justifyContent = 'space-between';
  headerRow.style.alignItems = 'center';
  headerRow.style.marginBottom = '1.5rem';

  const title = document.createElement('h2');
  title.textContent = 'NextEd Help';
  title.style.margin = '0';

  const closeBtn = document.createElement('button');
  closeBtn.textContent = 'Close';
  closeBtn.className = 'btn';
  closeBtn.onclick = () => {
    if (document.body.contains(overlay)) document.body.removeChild(overlay);
    document.removeEventListener('keydown', onKeydown);
  };

  headerRow.appendChild(title);
  headerRow.appendChild(closeBtn);
  modal.appendChild(headerRow);

  // Helper: build a section with a two-column table
  function section(title, rows) {
    const sec = document.createElement('div');
    sec.style.border = '1px solid #444';
    sec.style.borderRadius = '6px';
    sec.style.padding = '1rem';
    sec.style.marginBottom = '1rem';

    const h3 = document.createElement('h3');
    h3.textContent = title;
    h3.style.margin = '0 0 0.75rem 0';
    h3.style.fontSize = '1rem';
    h3.style.color = '#ccc';
    sec.appendChild(h3);

    const table = document.createElement('table');
    table.style.width = '100%';
    table.style.borderCollapse = 'collapse';
    table.cellPadding = '6';

    rows.forEach(([label, desc]) => {
      const tr = document.createElement('tr');

      const tdLabel = document.createElement('td');
      tdLabel.textContent = label;
      tdLabel.style.color = '#aaa';
      tdLabel.style.whiteSpace = 'nowrap';
      tdLabel.style.verticalAlign = 'top';
      tdLabel.style.width = '40%';

      const tdDesc = document.createElement('td');
      tdDesc.textContent = desc;
      tdDesc.style.color = '#e0e0e0';
      tdDesc.style.verticalAlign = 'top';

      tr.appendChild(tdLabel);
      tr.appendChild(tdDesc);
      table.appendChild(tr);
    });

    sec.appendChild(table);
    return sec;
  }

  modal.appendChild(section('Navigation', [
    ['4-Panel View', 'Axial, Sagittal, Coronal, Oblique panels shown simultaneously'],
    ['Scroll Slices', 'Click-drag up/down on any panel, or use mouse wheel'],
    ['Slice Slider', 'Drag the slider below each panel to jump to a slice'],
    ['Single-View', 'Click a panel\'s name label to expand it to full screen; click again to restore'],
    ['Crosshair Sync', 'Click or drag with Crosshair tool (\u2316) \u2014 all panels update to that world position'],
  ]));

  modal.appendChild(section('Window / Level', [
    ['Adjust W/L', 'Right-click and drag on any panel \u2014 left/right changes Window, up/down changes Level'],
    ['Presets', 'Brain, Bone, Lung, Abd \u2014 apply from the W/L dropdown when a volume is open'],
  ]));

  modal.appendChild(section('Tools (Tool Panel)', [
    ['Crosshair \u2316', 'Navigate: click to set crosshair position across all views'],
    ['Paint \ud83d\udd8c', 'Freehand brush \u2014 left-click drag to paint the active label'],
    ['Region Grow \u2728', 'Click a seed voxel; adjust min/max intensity range to grow the region'],
    ['Brush Radius', 'Slider in the tool panel controls paint brush size'],
    ['Brush Depth', 'Number of adjacent slices the brush paints through simultaneously'],
    ['Intensity Limits', 'Constrain paint to voxels within a min/max intensity range'],
  ]));

  modal.appendChild(section('Actions', [
    ['Undo', 'Ctrl+Z \u2014 undoes the last paint or region grow stroke'],
    ['Refine Contour', 'Smooths and tightens the boundary of the active label on the current slice'],
    ['Propagate', 'Copies the label from the adjacent slice and refines it \u2014 useful for propagating contours through a stack'],
    ['Fill Holes', 'Fills enclosed background regions within each 2D label component on the current slice'],
    ['Save As...', 'Writes the current segmentation back to the server as a NIfTI file'],
  ]));

  modal.appendChild(section('Labels', [
    ['Label Panel', 'Shows all segmentation labels; click to select the active label for painting'],
    ['Add / Rename', 'Add new labels or rename existing ones from the label panel'],
  ]));

  modal.appendChild(section('AI', [
    ['\ud83e\udd16 AI Button', 'Runs configured AI segmentation models (configure in Preferences \u2192 AI Configuration)'],
    ['TotalSegmentator', 'Downloads the current volume and opens TotalSegmentator for full-body auto-segmentation'],
  ]));

  modal.appendChild(section('Keyboard Shortcuts', [
    ['?', 'Open this help panel'],
    ['Ctrl+Z', 'Undo last edit'],
    ['Escape', 'Close any open modal'],
  ]));

  // Footer tip
  const footer = document.createElement('p');
  footer.textContent = 'Tip: right-click drag on any viewer panel to adjust Window/Level.';
  footer.style.color = '#666';
  footer.style.fontSize = '0.85rem';
  footer.style.marginTop = '0.5rem';
  footer.style.marginBottom = '0';
  modal.appendChild(footer);

  overlay.appendChild(modal);
  document.body.appendChild(overlay);
}
