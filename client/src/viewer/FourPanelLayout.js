/**
 * FourPanelLayout — CSS Grid 2x2 layout with axial (UL), coronal (UR),
 * sagittal (LL), blank (LR) panels. Supports single-view toggle.
 */
import { ViewerPanel } from './ViewerPanel.js';
import { ObliquePanel } from './ObliquePanel.js';

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

    // Oblique (lower-right)
    const obliqueDiv = document.createElement('div');
    obliqueDiv.className = 'viewer-panel-container';
    this.panels.oblique = new ObliquePanel({ container: obliqueDiv, state: this.state });
    this.panelContainers.oblique = obliqueDiv;

    this.grid.appendChild(axialDiv);
    this.grid.appendChild(coronalDiv);
    this.grid.appendChild(sagittalDiv);
    this.grid.appendChild(obliqueDiv);

    this.container.appendChild(this.grid);

    // Wire single-view toggle buttons
    this._wireToggleButtons();
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
    const letters = { ...TOGGLE_LETTERS, oblique: 'O' };
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
