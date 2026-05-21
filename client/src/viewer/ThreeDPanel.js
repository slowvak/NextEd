/**
 * ThreeDPanel — Three.js WebGL panel for the lower-right quadrant.
 * Supports two mutually exclusive rendering modes:
 *   - surface: marching cubes per label via Web Worker
 *   - volume: ray-cast shader on full intensity volume
 *
 * Exposes the same public API as ObliquePanel:
 *   constructor({ container, state }), setVolume, render, destroy,
 *   updateDisplaySize, _updateCursor, toggleBtn
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export class ThreeDPanel {
  constructor({ container, state }) {
    this.container = container;
    this.state = state;
    this._mode = 'surface'; // 'surface' | 'volume'
    this._lastSegVersion = -1;
    this._meshes = new Map(); // label value -> THREE.Mesh
    this._worker = null;
    this._pendingWorkerResult = false;
    this._volMesh = null;
    this._volMat = null;
    this._volTexture = null;
    this._volThreshMin = 0.1;  // normalized [0,1]
    this._volThreshMax = 0.9;
    this._isDraggingThresh = false;
    this._threshDragStartX = 0;
    this._threshDragStartY = 0;
    this._threshStartMin = 0.1;
    this._threshStartMax = 0.9;

    this._buildDOM();
    this._initThree();
    this._setupResizeObserver();
    this._unsubscribe = state.subscribe(() => this._onStateChange());
  }

  _buildDOM() {
    this.container.classList.add('viewer-panel');

    const labelBar = document.createElement('div');
    labelBar.className = 'panel-label-bar';

    const panelName = document.createElement('span');
    panelName.className = 'panel-name';
    panelName.textContent = '3D';
    labelBar.appendChild(panelName);

    this.modeBtn = document.createElement('button');
    this.modeBtn.className = 'panel-toggle-btn';
    this.modeBtn.style.marginRight = '4px';
    this.modeBtn.textContent = 'Vol';
    this.modeBtn.title = 'Switch to volume rendering';
    this.modeBtn.addEventListener('click', () => this._toggleMode());
    labelBar.appendChild(this.modeBtn);

    const spacer = document.createElement('div');
    spacer.style.flex = '1';
    labelBar.appendChild(spacer);

    this.toggleBtn = document.createElement('button');
    this.toggleBtn.className = 'panel-toggle-btn';
    this.toggleBtn.textContent = '3';
    this.toggleBtn.setAttribute('aria-label', 'Toggle 3D single view');
    labelBar.appendChild(this.toggleBtn);

    this.container.appendChild(labelBar);

    this.rendererDiv = document.createElement('div');
    this.rendererDiv.style.cssText = 'position:relative;width:100%;flex:1;overflow:hidden;min-height:0;';
    this.container.appendChild(this.rendererDiv);

    // ThreeDPanel container needs flex layout for rendererDiv to grow
    this.container.style.display = 'flex';
    this.container.style.flexDirection = 'column';
  }

  _initThree() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(window.devicePixelRatio);
    this.renderer.setClearColor(0x1a1a1a);
    this.rendererDiv.appendChild(this.renderer.domElement);
    this.renderer.domElement.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;';

    this.scene = new THREE.Scene();

    // Camera positioned at +Z looking toward origin
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 5000);
    this.camera.position.set(0, 0, 400);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.1;

    // Lighting for surface mode
    const ambient = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(ambient);
    const dir = new THREE.DirectionalLight(0xffffff, 0.8);
    dir.position.set(1, 2, 3);
    this.scene.add(dir);

    // Axes helper (RGB = XYZ)
    const axes = new THREE.AxesHelper(50);
    this.scene.add(axes);

    this._animate();

    // Ctrl-LMB threshold drag (volume mode)
    this.renderer.domElement.addEventListener('mousedown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.button === 0) {
        e.preventDefault();
        e.stopPropagation();
        this._isDraggingThresh = true;
        this._threshDragStartX = e.clientX;
        this._threshDragStartY = e.clientY;
        this._threshStartMin = this._volThreshMin;
        this._threshStartMax = this._volThreshMax;
        this.controls.enabled = false;
      }
    });

    this._onMouseMove = (e) => {
      if (!this._isDraggingThresh) return;
      // Horizontal drag → shift minThreshold (window center analog)
      // Vertical drag → shift maxThreshold
      const dx = (e.clientX - this._threshDragStartX) / 300;
      const dy = (e.clientY - this._threshDragStartY) / 300;
      this._volThreshMin = Math.max(0, Math.min(0.99, this._threshStartMin + dx));
      this._volThreshMax = Math.max(this._volThreshMin + 0.01, Math.min(1, this._threshStartMax - dy));
      this._updateVolumeUniforms();
    };

    this._onMouseUp = () => {
      if (this._isDraggingThresh) {
        this._isDraggingThresh = false;
        this.controls.enabled = true;
      }
    };

    document.addEventListener('mousemove', this._onMouseMove);
    document.addEventListener('mouseup', this._onMouseUp);
  }

  _animate() {
    this._animId = requestAnimationFrame(() => this._animate());
    this.controls.update();
    const w = this.rendererDiv.clientWidth || 1;
    const h = this.rendererDiv.clientHeight || 1;
    if (this.camera.aspect !== w / h) {
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
    this.renderer.setSize(w, h, false);
    this.renderer.render(this.scene, this.camera);
  }

  _setupResizeObserver() {
    this._resizeObs = new ResizeObserver(() => { /* animate loop handles resize */ });
    this._resizeObs.observe(this.rendererDiv);
  }

  _toggleMode() {
    this._mode = this._mode === 'surface' ? 'volume' : 'surface';
    this.modeBtn.textContent = this._mode === 'surface' ? 'Vol' : 'Surf';
    this.modeBtn.title = this._mode === 'surface'
      ? 'Switch to volume rendering'
      : 'Switch to surface rendering';
    this._applyMode();
  }

  _applyMode() {
    // Show/hide surface meshes vs volume box
    for (const mesh of this._meshes.values()) {
      mesh.visible = this._mode === 'surface';
    }
    if (this._volMesh) {
      this._volMesh.visible = this._mode === 'volume';
    }

    if (this._mode === 'volume') {
      if (!this._volMesh && this.state.volume) {
        this._buildVolumeRender();
      }
    } else if (this._mode === 'surface') {
      if (this.state.segVolume && this.state.segVersion !== this._lastSegVersion) {
        this._requestMeshRebuild();
      }
    }
  }

  _onStateChange() {
    // Rebuild surfaces when seg changes (surface mode only)
    if (this._mode === 'surface' && this.state.segVolume &&
        this.state.segVersion !== this._lastSegVersion) {
      this._requestMeshRebuild();
    }
  }

  /**
   * Called by FourPanelLayout after volume loads.
   * @param {Float32Array} volume
   * @param {number[]} dims - [dimX, dimY, dimZ]
   * @param {number[]} spacing - [spX, spY, spZ]
   */
  setVolume(volume, dims, spacing) {
    this._dims = dims;
    this._spacing = spacing;
    // Reset threshold to cover useful intensity range
    this._volThreshMin = 0.1;
    this._volThreshMax = 0.9;
    // Position camera to see the whole volume
    const [dx, dy, dz] = dims;
    const [sx, sy, sz] = spacing;
    const cx = (dx * sx) / 2, cy = (dy * sy) / 2, cz = (dz * sz) / 2;
    this.controls.target.set(cx, cy, cz);
    const maxDim = Math.max(dx * sx, dy * sy, dz * sz);
    this.camera.position.set(cx, cy, cz + maxDim * 1.5);
    this.controls.update();

    if (this._mode === 'volume') {
      this._buildVolumeRender();
    }
  }

  /** No-op — Three.js animate loop handles resize. */
  updateDisplaySize() {}

  /** No-op — Three.js animate loop drives rendering. */
  render() {}

  /** No-op — no cursor change needed for 3D view. */
  _updateCursor() {}

  destroy() {
    cancelAnimationFrame(this._animId);
    if (this._resizeObs) this._resizeObs.disconnect();
    if (this._unsubscribe) this._unsubscribe();
    if (this._worker) this._worker.terminate();
    document.removeEventListener('mousemove', this._onMouseMove);
    document.removeEventListener('mouseup', this._onMouseUp);

    // Dispose Three.js resources
    for (const mesh of this._meshes.values()) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    this._meshes.clear();

    if (this._volMesh) {
      this.scene.remove(this._volMesh);
      this._volMesh.geometry.dispose();
      this._volMesh.material.dispose();
    }
    if (this._volTexture) this._volTexture.dispose();

    this.controls.dispose();
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }

  _requestMeshRebuild() {
    if (this._pendingWorkerResult) return; // worker already running
    if (!this.state.segVolume || !this.state.dims) return;

    this._lastSegVersion = this.state.segVersion;
    this._pendingWorkerResult = true;

    // Terminate old worker if any
    if (this._worker) {
      this._worker.terminate();
      this._worker = null;
    }

    // Remove old meshes
    for (const mesh of this._meshes.values()) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.material.dispose();
    }
    this._meshes.clear();

    // Collect visible labels with their colors
    const labels = [];
    for (const [val, label] of this.state.labels) {
      if (val === 0) continue;
      if (label.isVisible === false) continue;
      labels.push([val, label.color.r, label.color.g, label.color.b]);
    }

    if (labels.length === 0) {
      this._pendingWorkerResult = false;
      return;
    }

    // Transfer a copy of segVolume (transferable buffer)
    const segCopy = this.state.segVolume.slice();

    this._worker = new Worker(
      new URL('./marchingCubesWorker.js', import.meta.url),
      { type: 'module' }
    );

    this._worker.postMessage({
      segVolume: segCopy,
      dims: this.state.dims,
      spacing: this.state.spacing || [1, 1, 1],
      labels,
    }, [segCopy.buffer]);

    this._worker.onmessage = (e) => {
      const data = e.data;
      if (data.done) {
        this._pendingWorkerResult = false;
        this._worker = null;
        return;
      }

      const { label: labelVal, vertices, normals } = data;
      if (!vertices || vertices.length === 0) return;

      const labelInfo = this.state.labels.get(labelVal);
      if (!labelInfo) return;

      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
      geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));

      const { r, g, b } = labelInfo.color;
      const mat = new THREE.MeshPhongMaterial({
        color: new THREE.Color(r / 255, g / 255, b / 255),
        side: THREE.DoubleSide,
        opacity: 0.85,
        transparent: true,
      });

      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = this._mode === 'surface';
      this.scene.add(mesh);
      this._meshes.set(labelVal, mesh);
    };

    this._worker.onerror = (err) => {
      console.error('[ThreeDPanel] Worker error:', err);
      this._pendingWorkerResult = false;
      this._worker = null;
    };
  }

  _buildVolumeRender() {
    if (!this.state.volume || !this.state.dims) return;

    // Remove old volume mesh
    if (this._volMesh) {
      this.scene.remove(this._volMesh);
      this._volMesh.geometry.dispose();
      this._volMesh.material.dispose();
      this._volMesh = null;
    }
    if (this._volTexture) {
      this._volTexture.dispose();
      this._volTexture = null;
    }

    const [dimX, dimY, dimZ] = this.state.dims;
    const [spX, spY, spZ] = this.state.spacing || [1, 1, 1];

    // Build 3D texture from volume (normalized [0,1])
    const dMin = this.state.dataMin ?? 0;
    const dMax = this.state.dataMax ?? 1;
    const range = Math.max(1, dMax - dMin);
    const texData = new Uint8Array(dimX * dimY * dimZ);
    const vol = this.state.volume;
    for (let i = 0; i < vol.length; i++) {
      texData[i] = Math.round(Math.max(0, Math.min(255, ((vol[i] - dMin) / range) * 255)));
    }

    this._volTexture = new THREE.Data3DTexture(texData, dimX, dimY, dimZ);
    this._volTexture.format = THREE.RedFormat;
    this._volTexture.type = THREE.UnsignedByteType;
    this._volTexture.minFilter = THREE.LinearFilter;
    this._volTexture.magFilter = THREE.LinearFilter;
    this._volTexture.unpackAlignment = 1;
    this._volTexture.needsUpdate = true;

    const physW = dimX * spX;
    const physH = dimY * spY;
    const physD = dimZ * spZ;

    // Import shaders dynamically to avoid circular at module load time
    import('./volumeShader.js').then(({ vertexShader, fragmentShader }) => {
      const mat = new THREE.ShaderMaterial({
        vertexShader,
        fragmentShader,
        uniforms: {
          uVolume:    { value: this._volTexture },
          uThreshMin: { value: this._volThreshMin },
          uThreshMax: { value: this._volThreshMax },
          uVolSize:   { value: new THREE.Vector3(physW, physH, physD) },
          cameraPos:  { value: new THREE.Vector3() },
        },
        transparent: true,
        depthWrite: false,
        side: THREE.BackSide,
      });

      // Proxy geometry: unit cube scaled to physical dimensions
      const geo = new THREE.BoxGeometry(1, 1, 1);
      this._volMesh = new THREE.Mesh(geo, mat);
      this._volMesh.scale.set(physW, physH, physD);
      this._volMesh.position.set(physW / 2, physH / 2, physD / 2);
      this._volMesh.visible = this._mode === 'volume';
      this.scene.add(this._volMesh);
      this._volMat = mat;

      // Update cameraPos uniform each frame: convert world cam pos to local [0,1]^3 cube space
      this._volMesh.onBeforeRender = (_renderer, _scene, cam) => {
        const localCam = this._volMesh.worldToLocal(cam.position.clone());
        // localCam is in [-0.5, 0.5]^3 (unit cube centered at origin); shift to [0,1]
        mat.uniforms.cameraPos.value.set(
          localCam.x + 0.5,
          localCam.y + 0.5,
          localCam.z + 0.5,
        );
      };
    });
  }

  _updateVolumeUniforms() {
    if (this._volMat) {
      this._volMat.uniforms.uThreshMin.value = this._volThreshMin;
      this._volMat.uniforms.uThreshMax.value = this._volThreshMax;
    }
  }
}
