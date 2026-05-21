// Copyright Bradley J Erickson, 2026.
/**
 * FourPanelLayout — CSS Grid 2x2 layout with axial (UL), coronal (UR),
 * sagittal (LL), oblique/3D (LR) panels. Supports single-view toggle.
 * The lower-right panel can be switched between ObliquePanel and ThreeDPanel
 * via a "3D" / "Obl" button injected into the lower-right labelBar.
 */
import { ViewerPanel } from './ViewerPanel.js';
import { ObliquePanel } from './ObliquePanel.js';
import { ThreeDPanel } from './ThreeDPanel.js';

const AXES = ['axial', 'coronal', 'sagittal'];
const TOGGLE_LETTERS = { axial: 'A', coronal: 'C', sagittal: 'S' };

export class FourPanelLayout {
  /**
   * @param {Object} options
   * @param {HTMLElement} options.container - Parent DOM element
   * @param {import('./ViewerState.js').ViewerState} options.state - Shared viewer state
   */
  constructor({ container, state }) {
    this.container = container;
    this.state = state;
    this.panels = {};
    this.panelContainers = {};
    this._3dMode = false;

    this._buildDOM();
    this._unsubscribe = state.subscribe(() => this._onStateChange());
  }

  _buildDOM() {
    this.grid = document.createElement('div');
    this.grid.className = 'viewer-grid';

    // Axial (upper-left)
    const axialDiv = document.createElement('div');
    axialDiv.className = 'viewer-panel-container';
    this.panels.axial = new ViewerPanel({ container: axialDiv, axis: 'axial', state: this.state });
    this.panelContainers.axial = axialDiv;

    // Coronal (upper-right)
    const coronalDiv = document.createElement('div');
    coronalDiv.className = 'viewer-panel-container';
    this.panels.coronal = new ViewerPanel({ container: coronalDiv, axis: 'coronal', state: this.state });
    this.panelContainers.coronal = coronalDiv;

    // Sagittal (lower-left)
    const sagittalDiv = document.createElement('div');
    sagittalDiv.className = 'viewer-panel-container';
    this.panels.sagittal = new ViewerPanel({ container: sagittalDiv, axis: 'sagittal', state: this.state });
    this.panelContainers.sagittal = sagittalDiv;

    // Oblique (lower-right) — starts as ObliquePanel
    const obliqueDiv = document.createElement('div');
    obliqueDiv.className = 'viewer-panel-container';
    this.panels.oblique = new ObliquePanel({ container: obliqueDiv, state: this.state });
    this.panelContainers.oblique = obliqueDiv;

    this.grid.appendChild(axialDiv);
    this.grid.appendChild(coronalDiv);
    this.grid.appendChild(sagittalDiv);
    this.grid.appendChild(obliqueDiv);

    this.container.appendChild(this.grid);

    // Wire single-view toggle buttons (the toggleBtn on each panel)
    this._wireToggleButtons();

    // Inject Oblique/3D mode toggle button into the lower-right labelBar
    this._addObliqueThreeDToggle();
  }

  _wireToggleButtons() {
    const allAxes = [...AXES, 'oblique'];
    for (const axis of allAxes) {
      const panel = this.panels[axis];
      panel.toggleBtn.addEventListener('click', () => {
        if (this.state.singleView === axis) {
          this._exitSingleView();
        } else if (this.state.singleView) {
          this._exitSingleView();
          this._enterSingleView(axis);
        } else {
          this._enterSingleView(axis);
        }
      });
    }
  }

  _addObliqueThreeDToggle() {
    // Insert a "3D" button into the lower-right panel labelBar, before the spacer
    const obliquePanel = this.panels.oblique;
    const labelBar = this.panelContainers.oblique.querySelector('.panel-label-bar');
    if (!labelBar) return;

    this._viewModeBtn = document.createElement('button');
    this._viewModeBtn.className = 'panel-toggle-btn';
    this._viewModeBtn.style.marginRight = '4px';
    this._viewModeBtn.textContent = '3D';
    this._viewModeBtn.title = 'Switch to 3D view';
    this._viewModeBtn.addEventListener('click', () => this._toggleLowerRight());

    // Insert before the spacer (flex:1 div) so it's left of the single-view toggleBtn
    const spacer = labelBar.querySelector('div[style*="flex"]');
    if (spacer) {
      labelBar.insertBefore(this._viewModeBtn, spacer);
    } else {
      // Fallback: insert before the panel toggleBtn
      labelBar.insertBefore(this._viewModeBtn, obliquePanel.toggleBtn);
    }
  }

  _wireObliqueToggleBtn() {
    const panel = this.panels.oblique;
    panel.toggleBtn.addEventListener('click', () => {
      if (this.state.singleView === 'oblique') {
        this._exitSingleView();
      } else if (this.state.singleView) {
        this._exitSingleView();
        this._enterSingleView('oblique');
      } else {
        this._enterSingleView('oblique');
      }
    });
  }

  _toggleLowerRight() {
    this._3dMode = !this._3dMode;
    const container = this.panelContainers.oblique;

    // Exit single-view if the oblique panel is currently the active single-view panel,
    // since the panel instance is being replaced.
    if (this.state.singleView === 'oblique') {
      this._exitSingleView();
    }

    if (this._3dMode) {
      // Destroy existing ObliquePanel
      this.panels.oblique.destroy();

      // Remove its DOM (the .viewer-panel div it created inside the container)
      const oldPanel = container.querySelector('.viewer-panel');
      if (oldPanel) container.removeChild(oldPanel);

      // Create a fresh inner div for ThreeDPanel to occupy
      const innerDiv = document.createElement('div');
      innerDiv.style.cssText = 'width:100%;height:100%;display:flex;flex-direction:column;';
      container.appendChild(innerDiv);

      this.panels.oblique = new ThreeDPanel({ container: innerDiv, state: this.state });

      // Wire single-view toggleBtn on the new ThreeDPanel
      this._wireObliqueToggleBtn();

      // Feed current volume data if already loaded
      if (this.state.volume && this.state.dims && this.state.spacing) {
        this.panels.oblique.setVolume(this.state.volume, this.state.dims, this.state.spacing);
      }

      this._viewModeBtn.textContent = 'Obl';
      this._viewModeBtn.title = 'Switch to oblique view';

      // Move viewModeBtn into the new ThreeDPanel's labelBar
      const newLabelBar = container.querySelector('.panel-label-bar');
      if (newLabelBar) {
        const spacer = newLabelBar.querySelector('div[style*="flex"]');
        if (spacer) {
          newLabelBar.insertBefore(this._viewModeBtn, spacer);
        } else {
          newLabelBar.insertBefore(this._viewModeBtn, this.panels.oblique.toggleBtn);
        }
      }
    } else {
      // Destroy ThreeDPanel
      this.panels.oblique.destroy();

      // Remove the inner div ThreeDPanel was placed in
      container.querySelectorAll(':scope > div').forEach(el => container.removeChild(el));

      // Re-create ObliquePanel — it builds its own .viewer-panel inside the container
      this.panels.oblique = new ObliquePanel({ container, state: this.state });

      // Wire single-view toggleBtn on the restored ObliquePanel
      this._wireObliqueToggleBtn();

      // Feed current volume data if already loaded
      if (this.state.volume && this.state.dims && this.state.spacing) {
        this.panels.oblique.setVolume(this.state.volume, this.state.dims, this.state.spacing);
      }

      this._viewModeBtn.textContent = '3D';
      this._viewModeBtn.title = 'Switch to 3D view';

      // Move viewModeBtn into the new ObliquePanel's labelBar
      const newLabelBar = container.querySelector('.panel-label-bar');
      if (newLabelBar) {
        const spacer = newLabelBar.querySelector('div[style*="flex"]');
        if (spacer) {
          newLabelBar.insertBefore(this._viewModeBtn, spacer);
        } else {
          newLabelBar.insertBefore(this._viewModeBtn, this.panels.oblique.toggleBtn);
        }
      }
    }
  }

  _enterSingleView(axis) {
    this.state.singleView = axis;
    this.grid.classList.add('single-view');

    const allAxes = [...AXES, 'oblique'];
    for (const a of allAxes) {
      const container = this.panelContainers[a];
      if (a === axis) {
        container.classList.add('active');
      } else {
        container.style.display = 'none';
      }
    }

    this.panels[axis].toggleBtn.textContent = '4';
    this.panels[axis].toggleBtn.classList.add('return-btn');
    this.panels[axis].updateDisplaySize();
    this.panels[axis].render();
  }

  _exitSingleView() {
    const prevAxis = this.state.singleView;
    this.state.singleView = null;
    this.grid.classList.remove('single-view');

    const allAxes = [...AXES, 'oblique'];
    const letters = { ...TOGGLE_LETTERS, oblique: this._3dMode ? '3' : 'O' };
    for (const a of allAxes) {
      const container = this.panelContainers[a];
      container.classList.remove('active');
      container.style.display = '';
    }

    if (prevAxis) {
      this.panels[prevAxis].toggleBtn.textContent = letters[prevAxis];
      this.panels[prevAxis].toggleBtn.classList.remove('return-btn');
    }

    for (const a of allAxes) {
      this.panels[a].updateDisplaySize();
      this.panels[a].render();
    }
  }

  _onStateChange() {
    this.panels.axial.render();
    this.panels.coronal.render();
    this.panels.sagittal.render();
    this.panels.oblique.render();
    this.panels.axial._updateCursor();
    this.panels.coronal._updateCursor();
    this.panels.sagittal._updateCursor();
    this.panels.oblique._updateCursor();
  }

  /**
   * Load volume data into all panels.
   * @param {Float32Array} volume
   * @param {number[]} dims - [dimX, dimY, dimZ]
   * @param {number[]} spacing - [spX, spY, spZ]
   */
  setVolume(volume, dims, spacing) {
    this.panels.axial.setVolume(volume, dims, spacing);
    this.panels.coronal.setVolume(volume, dims, spacing);
    this.panels.sagittal.setVolume(volume, dims, spacing);
    this.panels.oblique.setVolume(volume, dims, spacing);
  }

  destroy() {
    if (this._unsubscribe) this._unsubscribe();
    this.panels.axial.destroy();
    this.panels.coronal.destroy();
    this.panels.sagittal.destroy();
    this.panels.oblique.destroy();
    if (this.grid.parentNode) {
      this.grid.parentNode.removeChild(this.grid);
    }
  }
}
