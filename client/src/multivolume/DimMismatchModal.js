/**
 * Show a modal when two linked volumes have different voxel dimensions.
 * Returns a Promise resolving to 'interpolate' | 'register' | 'ignore'.
 *
 * @param {number[]} localDims  - [X, Y, Z] of this window
 * @param {number[]} remoteDims - [X, Y, Z] of the other window
 * @returns {Promise<'interpolate'|'register'|'ignore'>}
 */
export function showDimMismatchModal(localDims, remoteDims) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.55);z-index:2000;display:flex;align-items:center;justify-content:center;';

    const modal = document.createElement('div');
    modal.style.cssText = 'background:#1e1e1e;padding:28px;border-radius:8px;width:460px;border:1px solid #3a3a3a;box-shadow:0 10px 30px rgba(0,0,0,0.6);color:#e0e0e0;';

    const fmt = (d) => `${d[0]} × ${d[1]} × ${d[2]}`;
    const localTotal = localDims.reduce((a, b) => a * b, 1);
    const remoteTotal = remoteDims.reduce((a, b) => a * b, 1);
    const higherLabel = localTotal >= remoteTotal ? 'this window' : 'the other window';
    const lowerLabel  = localTotal <  remoteTotal ? 'this window' : 'the other window';

    modal.innerHTML = `
      <h2 style="margin-top:0;font-size:17px;margin-bottom:10px;color:#e0e0e0;">Volume Dimension Mismatch</h2>
      <p style="font-size:13px;color:#a0a0a0;margin-bottom:6px;">
        The linked volumes have different dimensions:
      </p>
      <table style="font-size:13px;margin-bottom:18px;width:100%;border-collapse:collapse;">
        <tr>
          <td style="color:#a0a0a0;padding:3px 8px 3px 0;">This window:</td>
          <td style="color:#e0e0e0;font-family:monospace;">${fmt(localDims)}</td>
        </tr>
        <tr>
          <td style="color:#a0a0a0;padding:3px 8px 3px 0;">Other window:</td>
          <td style="color:#e0e0e0;font-family:monospace;">${fmt(remoteDims)}</td>
        </tr>
      </table>
      <p style="font-size:13px;color:#a0a0a0;margin-bottom:20px;">
        How should crosshair positions be linked?
      </p>
      <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:20px;">
        <label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;">
          <input type="radio" name="mm" value="ignore" checked style="margin-top:3px;">
          <span>
            <strong style="font-size:13px;">Proportional mapping</strong>
            <span style="display:block;font-size:12px;color:#a0a0a0;">Cursor position mapped as fraction of each axis. Works well for same-patient scans.</span>
          </span>
        </label>
        <label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;">
          <input type="radio" name="mm" value="interpolate" style="margin-top:3px;">
          <span>
            <strong style="font-size:13px;">Interpolate ${lowerLabel} to match ${higherLabel}</strong>
            <span style="display:block;font-size:12px;color:#a0a0a0;">Resample lower-resolution volume to match higher-resolution. Enables voxel-accurate sync.</span>
          </span>
        </label>
        <label style="display:flex;align-items:flex-start;gap:10px;cursor:pointer;">
          <input type="radio" name="mm" value="register" style="margin-top:3px;">
          <span>
            <strong style="font-size:13px;">Volumetric registration</strong>
            <span style="display:block;font-size:12px;color:#a0a0a0;">Spatially align volumes using rigid registration (SimpleITK). Best for multi-modal or multi-session scans. May take 30–60 seconds.</span>
          </span>
        </label>
      </div>
      <div style="display:flex;justify-content:flex-end;gap:8px;">
        <button id="mm-ok" style="padding:8px 20px;background:#4a9eff;border:none;color:#fff;border-radius:4px;cursor:pointer;font-weight:600;font-size:13px;">OK</button>
      </div>`;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    modal.querySelector('#mm-ok').addEventListener('click', () => {
      const choice = modal.querySelector('input[name="mm"]:checked').value;
      document.body.removeChild(overlay);
      resolve(choice);
    });
  });
}
