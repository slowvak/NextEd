"""SIGMA AI Inference Server — runs on a GPU machine (DGX Spark, etc.).

Wraps TotalSegmentator and other models behind a simple HTTP API.

Usage:
    python server.py [--host 0.0.0.0] [--port 8080]

The SIGMA image server proxies requests here via the config in
models/ai-models.json: { "server": "http://<this-machine>:8080" }
"""

import argparse
import json
import shutil
import tempfile
from pathlib import Path

import nibabel as nib
import numpy as np
import uvicorn
from fastapi import FastAPI, File, Form, UploadFile, Request
from fastapi.responses import Response

app = FastAPI(title="SIGMA AI Inference Server")

# Registry of model runners — keyed by weights string from config
_runners: dict[str, callable] = {}
# Full metadata for models (registered via python or API)
_model_catalog: dict[str, dict] = {}


def register_runner(weights_name: str, meta: dict = None):
    """Decorator to register a model runner function."""
    def decorator(fn):
        _runners[weights_name] = fn
        _model_catalog[weights_name] = meta or {
            "id": weights_name,
            "name": weights_name.replace("_", " ").title(),
            "weights": weights_name
        }
        return fn
    return decorator


def load_dynamic_models():
    """Load dynamically registered models from a local JSON file."""
    p = Path("dynamic_models.json")
    if p.exists():
        try:
            with open(p) as f:
                models = json.load(f)
            for m in models:
                wid = m["weights"]
                _model_catalog[wid] = m
                if m.get("runner_type") == "onnx":
                    model_path = Path(m["model_path"])
                    _runners[wid] = lambda i, o, l, p=model_path: run_custom_onnx(i, o, l, p)
                elif m.get("runner_type") in ["safetensors", "hf_2d"]:
                    model_path = Path(m["model_path"])
                    _runners[wid] = lambda i, o, l, p=model_path: run_hf_safetensors(i, o, l, p)
                else:
                    _runners[wid] = lambda i, o, l, m=m: run_mhub_docker(i, o, l, docker_image=m.get("docker_image", "mhubai/totalsegmentator"))
        except Exception as e:
            print(f"Failed to load dynamic models: {e}")

def save_dynamic_models():
    """Save dynamic models to local JSON file."""
    dynamic = [m for w, m in _model_catalog.items() if m.get("is_dynamic")]
    try:
        with open("dynamic_models.json", "w") as f:
            json.dump(dynamic, f, indent=2)
    except Exception as e:
        print(f"Failed to save dynamic models: {e}")

load_dynamic_models()


# ---------------------------------------------------------------------------
# TotalSegmentator runner
# ---------------------------------------------------------------------------

@register_runner("totalsegmentator_v2", meta={
    "id": "totalsegmentator_v2",
    "name": "TotalSegmentator v2",
    "description": "Full body segmentation (117 structures)",
    "weights": "totalsegmentator_v2"
})
def run_totalsegmentator(input_path: Path, output_dir: Path, labels_path: Path | None):
    """Run TotalSegmentator on input NIfTI, return output mask path + label map.

    TotalSegmentator produces one NIfTI per structure in output_dir/.
    We merge them into a single multi-label mask volume.
    """
    from totalsegmentator.python_api import totalsegmentator

    # Run inference — produces one .nii.gz per structure in output_dir
    totalsegmentator(input_path, output_dir, fast=True)

    # Merge individual structure masks into a single label volume.
    # TotalSegmentator names files like "spleen.nii.gz", "liver.nii.gz", etc.
    # We assign sequential label values and build a label map.
    mask_files = sorted(output_dir.glob("*.nii.gz"))
    if not mask_files:
        raise RuntimeError("TotalSegmentator produced no output files")

    # Load first mask to get shape and affine
    ref_img = nib.load(str(mask_files[0]))
    shape = ref_img.shape[:3]
    affine = ref_img.affine
    combined = np.zeros(shape, dtype=np.uint8)
    labels = []

    # Standard colors for common structures (expand as needed)
    STRUCTURE_COLORS = {
        "spleen": "#8b0000",
        "kidney_right": "#2e8b57",
        "kidney_left": "#228b22",
        "liver": "#daa520",
        "stomach": "#ff69b4",
        "aorta": "#ff0000",
        "pancreas": "#ffa500",
        "lung_upper_lobe_left": "#4682b4",
        "lung_lower_lobe_left": "#5f9ea0",
        "lung_upper_lobe_right": "#6495ed",
        "lung_middle_lobe_right": "#7b68ee",
        "lung_lower_lobe_right": "#87ceeb",
        "heart": "#dc143c",
        "gallbladder": "#32cd32",
        "esophagus": "#ff8c00",
        "trachea": "#00ced1",
        "small_bowel": "#f0e68c",
        "colon": "#bdb76b",
        "urinary_bladder": "#9370db",
    }

    for i, mask_file in enumerate(mask_files):
        label_val = i + 1
        if label_val > 255:
            break  # uint8 max

        structure_name = mask_file.stem.replace(".nii", "")
        img = nib.load(str(mask_file))
        data = np.asarray(img.dataobj)

        # Write into combined mask (later structures overwrite overlaps)
        combined[data > 0] = label_val

        color = STRUCTURE_COLORS.get(structure_name, _default_color(label_val))
        labels.append({
            "value": label_val,
            "name": structure_name,
            "color": color,
        })

    # Save combined mask
    combined_path = output_dir / "combined_mask.nii.gz"
    combined_img = nib.Nifti1Image(combined, affine)
    combined_img.set_data_dtype(np.uint8)
    nib.save(combined_img, str(combined_path))

    return combined_path, labels


# ---------------------------------------------------------------------------
# Generic mhub Docker runner (template for other models)
# ---------------------------------------------------------------------------

@register_runner("mhub_docker", meta={
    "id": "mhub_docker",
    "name": "mhub.ai TotalSegmentator",
    "description": "Run via mhub docker container",
    "weights": "mhub_docker"
})
def run_mhub_docker(input_path: Path, output_dir: Path, labels_path: Path | None,
                    docker_image: str = "mhubai/totalsegmentator"):
    """Run an mhub.ai Docker container for inference.

    Mounts input/output dirs and runs the container with --gpus all.
    """
    import subprocess

    input_mount = input_path.parent
    cmd = [
        "docker", "run", "--rm", "--gpus", "all",
        "-v", f"{input_mount}:/input:ro",
        "-v", f"{output_dir}:/output",
        docker_image,
        "--input", f"/input/{input_path.name}",
        "--output", "/output/output.nii.gz",
    ]

    if labels_path:
        labels_mount = labels_path.parent
        cmd.extend(["-v", f"{labels_mount}:/labels:ro"])
        cmd.extend(["--labels", f"/labels/{labels_path.name}"])

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
    if result.returncode != 0:
        raise RuntimeError(f"Docker failed: {result.stderr[:500]}")

    output_mask = output_dir / "output.nii.gz"
    if not output_mask.exists():
        # Try to find any NIfTI output
        niftis = list(output_dir.glob("*.nii.gz"))
        if niftis:
            output_mask = niftis[0]
        else:
            raise RuntimeError("Docker container produced no output")

    return output_mask, []


# ---------------------------------------------------------------------------
# Refine segmentation runner (placeholder — uses existing labels)
# ---------------------------------------------------------------------------

@register_runner("refine_v1", meta={
    "id": "refine_v1",
    "name": "Refine Boundary",
    "description": "Placeholder refine logic",
    "weights": "refine_v1",
    "accepts_labels": True
})
def run_refine(input_path: Path, output_dir: Path, labels_path: Path | None):
    """Placeholder: refine existing segmentation using image features.

    For now, just passes through the input labels unchanged.
    Replace with actual refinement model (e.g. SAM, interactive seg).
    """
    if not labels_path or not labels_path.exists():
        raise RuntimeError("Refine model requires existing labels as input")

    # Placeholder: copy labels through (actual model would refine boundaries)
    output_path = output_dir / "refined.nii.gz"
    shutil.copy2(labels_path, output_path)
    return output_path, []


# ---------------------------------------------------------------------------
# Custom ONNX Runner
# ---------------------------------------------------------------------------

def run_custom_onnx(input_path: Path, output_dir: Path, labels_path: Path | None, model_path: Path):
    """Run an ONNX model (either via ONNXRuntime or converted to MLX)."""
    import nibabel as nib
    import numpy as np
    import sys
    
    # Load input
    img = nib.load(str(input_path))
    data = np.asarray(img.dataobj).astype(np.float32)
    
    # Assume 3D input tensor [1, 1, Z, Y, X]
    # For a general model, we pad/resize as needed, but for now just pass it directly.
    input_tensor = np.expand_dims(np.expand_dims(data, axis=0), axis=0)
    
    if sys.platform == 'darwin':
        # Use MLX
        import mlx.core as mx
        import onnx
        from onnx2mlx.convert import convert_to_mlx
        
        # Load and convert ONNX to MLX
        onnx_model = onnx.load(str(model_path))
        mlx_model = convert_to_mlx(onnx_model)
        
        # Run inference
        mx_input = mx.array(input_tensor)
        output = mlx_model(mx_input)
        
        # Handle multiple outputs or single output
        if isinstance(output, list) or isinstance(output, tuple):
            output = output[0]
            
        output_np = np.array(output)
    else:
        # Use ONNXRuntime
        import onnxruntime as ort
        
        session = ort.InferenceSession(str(model_path))
        input_name = session.get_inputs()[0].name
        output = session.run(None, {input_name: input_tensor})[0]
        output_np = np.array(output)
        
    # Postprocess: output_np is presumably [1, C, Z, Y, X]
    # Take argmax over channel dim if C > 1, else threshold
    if output_np.shape[1] > 1:
        mask = np.argmax(output_np[0], axis=0).astype(np.uint8)
    else:
        mask = (output_np[0, 0] > 0.5).astype(np.uint8)
    
    # Create default labels for the output classes
    unique_labels = np.unique(mask)
    labels = []
    for l in unique_labels:
        if l == 0: continue
        labels.append({
            "value": int(l),
            "name": f"Structure {l}",
            "color": _default_color(int(l))
        })
    
    # Save output
    output_path = output_dir / "output.nii.gz"
    out_img = nib.Nifti1Image(mask, img.affine)
    nib.save(out_img, str(output_path))
    
    return output_path, labels

# ---------------------------------------------------------------------------
# HuggingFace Safetensors Runner (2D slice-by-slice over 3D NIfTI)
# ---------------------------------------------------------------------------

def run_hf_safetensors(input_path: Path, output_dir: Path, labels_path: Path | None, model_path: Path):
    """Run a HuggingFace Segformer model from a safetensors file."""
    import nibabel as nib
    import numpy as np
    import torch
    from PIL import Image
    from transformers import AutoModelForImageSegmentation, AutoImageProcessor
    
    # 1. Load the 3D NIfTI
    img = nib.load(str(input_path))
    # data is usually (X, Y, Z)
    data = np.asarray(img.dataobj).astype(np.float32)
    
    # Normalize volume to 0-255 for the processor
    d_min, d_max = data.min(), data.max()
    if d_max > d_min:
        data_norm = (data - d_min) / (d_max - d_min) * 255.0
    else:
        data_norm = data
    data_norm = data_norm.astype(np.uint8)
    
    # 2. Load Model Architecture & Weights
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    
    # We check if there's a config.json next to the model_path
    model_dir = model_path.parent
    has_local_config = (model_dir / "config.json").exists()
    
    if has_local_config:
        base_repo = str(model_dir)
        report = None
    else:
        # Fallback for testing
        base_repo = "kiselyovd/brain-mri-segmentation"
        report = {"type": "warning", "text": "WARNING: config.json was not found. Using fallback architecture: kiselyovd/brain-mri-segmentation."}
    
    processor = AutoImageProcessor.from_pretrained(base_repo)
    # Load model architecture from local config or repo, but weights from local safetensors
    model = AutoModelForImageSegmentation.from_pretrained(base_repo, state_dict=None)
    
    if model_path.suffix.lower() == ".safetensors":
        from safetensors.torch import load_file
        state_dict = load_file(str(model_path))
    else:
        state_dict = torch.load(str(model_path), map_location=device, weights_only=True)
        
    model.load_state_dict(state_dict)
    model.to(device)
    model.eval()
    
    # 3. Iterate over Z-axis (slices)
    # Assuming data shape is (X, Y, Z), we iterate over Z
    out_mask = np.zeros_like(data, dtype=np.uint8)
    
    with torch.no_grad():
        for z in range(data.shape[2]):
            slice_2d = data_norm[:, :, z]
            # Convert 1-channel grayscale to 3-channel RGB (as expected by standard Segformer)
            slice_rgb = np.stack((slice_2d,)*3, axis=-1)
            
            # Use PIL Image as expected by processor
            pil_img = Image.fromarray(slice_rgb)
            inputs = processor(images=pil_img, return_tensors="pt").to(device)
            
            outputs = model(**inputs)
            logits = outputs.logits  # shape (batch_size, num_labels, height/4, width/4)
            
            # Upsample logits to original image size
            import torch.nn.functional as F
            upsampled_logits = F.interpolate(
                logits,
                size=slice_2d.shape, # (X, Y)
                mode="bilinear",
                align_corners=False,
            )
            
            # Get argmax over classes
            pred_mask = upsampled_logits.argmax(dim=1)[0].cpu().numpy()
            out_mask[:, :, z] = pred_mask.astype(np.uint8)
            
    # 4. Create default labels
    unique_labels = np.unique(out_mask)
    labels = []
    for l in unique_labels:
        if l == 0: continue
        labels.append({
            "value": int(l),
            "name": f"Structure {l}",
            "color": _default_color(int(l))
        })
        
    # 5. Save 3D output
    output_path = output_dir / "output.nii.gz"
    out_img = nib.Nifti1Image(out_mask, img.affine)
    nib.save(out_img, str(output_path))
    
    return output_path, labels, report


# ---------------------------------------------------------------------------
# HTTP endpoint
# ---------------------------------------------------------------------------

@app.post("/predict")
async def predict(
    image: UploadFile = File(...),
    weights: str = Form(""),
    labels: UploadFile | None = File(None),
):
    """Run model inference on a NIfTI volume.

    Args:
        image: Input NIfTI volume (.nii.gz)
        weights: Model weights identifier (maps to a registered runner)
        labels: Optional existing segmentation NIfTI (for accepts_labels models)

    Returns:
        NIfTI mask as binary response, with X-AI-Labels header containing
        the JSON label map.
    """
    if weights not in _runners:
        available = list(_runners.keys())
        return Response(
            content=json.dumps({"error": f"Unknown weights '{weights}'. Available: {available}"}),
            status_code=400,
            media_type="application/json",
        )

    with tempfile.TemporaryDirectory(prefix="sigma_ai_") as tmpdir:
        tmpdir = Path(tmpdir)

        # Save uploaded files
        input_path = tmpdir / "input.nii.gz"
        input_path.write_bytes(await image.read())

        labels_path = None
        if labels:
            labels_path = tmpdir / "labels.nii.gz"
            labels_path.write_bytes(await labels.read())

        output_dir = tmpdir / "output"
        output_dir.mkdir()

        # Run the model
        try:
            result = _runners[weights](input_path, output_dir, labels_path)
            if len(result) == 3:
                mask_path, label_map, report = result
            else:
                mask_path, label_map = result
                report = None
        except Exception as e:
            import traceback
            traceback.print_exc()
            return Response(
                content=json.dumps({"error": str(e)}),
                status_code=500,
                media_type="application/json",
            )

        # Read output mask and return as binary
        mask_bytes = mask_path.read_bytes()

        headers = {
            "X-AI-Labels": json.dumps(label_map),
        }
        if report:
            headers["X-AI-Report"] = json.dumps(report)

        return Response(
            content=mask_bytes,
            media_type="application/gzip",
            headers=headers,
        )


@app.get("/health")
async def health():
    """Health check — also reports available models and GPU status."""
    import torch
    gpu_available = torch.cuda.is_available()
    gpu_name = torch.cuda.get_device_name(0) if gpu_available else "none"
    gpu_mem = f"{torch.cuda.get_device_properties(0).total_mem / 1e9:.1f} GB" if gpu_available else "n/a"

    return {
        "status": "ok",
        "gpu": gpu_name,
        "gpu_memory": gpu_mem,
        "models": list(_model_catalog.values()),
    }

@app.get("/models")
async def get_models():
    """Return all available models."""
    return list(_model_catalog.values())

@app.post("/models")
async def add_model(request: Request):
    """Dynamically register a new model (uses generic docker runner)."""
    model_meta = await request.json()
    wid = model_meta.get("weights", model_meta.get("id"))
    if not wid:
        return Response(content=json.dumps({"error": "id/weights required"}), status_code=400)
    
    model_meta["is_dynamic"] = True
    _model_catalog[wid] = model_meta
    _runners[wid] = lambda i, o, l, m=model_meta: run_mhub_docker(i, o, l, docker_image=m.get("docker_image", "mhubai/totalsegmentator"))
    save_dynamic_models()
    return {"status": "ok", "model": model_meta}

@app.post("/models/upload")
async def add_upload_model(
    file: UploadFile = File(...),
    config: UploadFile | None = File(None),
    name: str = Form(None),
    description: str = Form(None)
):
    """Upload an ONNX or HuggingFace (Safetensors/PyTorch) model, save it, and register the appropriate runner."""
    import uuid
    import sys
    
    # Determine type from extension
    ext = Path(file.filename).suffix.lower()
    if ext not in [".onnx", ".safetensors", ".pth", ".pt"]:
        return Response(content=json.dumps({"error": f"Unsupported extension {ext}"}), status_code=400)
    
    is_onnx = ext == ".onnx"
    runner_type = "onnx" if is_onnx else "hf_2d"
    
    wid = f"{runner_type}_" + str(uuid.uuid4())[:8]
    model_name = name or file.filename or f"Custom {runner_type.upper()} Model"
    
    models_dir = Path("models")
    models_dir.mkdir(exist_ok=True)
    
    if runner_type == "hf_2d":
        model_dir = models_dir / wid
        model_dir.mkdir(exist_ok=True)
        model_path = model_dir / f"model{ext}"
        model_path.write_bytes(await file.read())
        if config:
            config_path = model_dir / "config.json"
            config_path.write_bytes(await config.read())
    else:
        model_path = models_dir / f"{wid}{ext}"
        model_path.write_bytes(await file.read())
    
    if is_onnx:
        accel_desc = " (MLX Accelerated)" if sys.platform == 'darwin' else " (ONNXRuntime)"
    else:
        accel_desc = " (HuggingFace 2D)"
        
    model_meta = {
        "id": wid,
        "weights": wid,
        "name": model_name + accel_desc,
        "description": description or f"Uploaded {runner_type.upper()} model.",
        "is_dynamic": True,
        "model_path": str(model_path),
        "runner_type": runner_type
    }
    
    _model_catalog[wid] = model_meta
    
    if is_onnx:
        _runners[wid] = lambda i, o, l, p=model_path: run_custom_onnx(i, o, l, p)
    else:
        _runners[wid] = lambda i, o, l, p=model_path: run_hf_safetensors(i, o, l, p)
        
    save_dynamic_models()
    return {"status": "ok", "model": model_meta}

def _default_color(idx: int) -> str:
    """Generate a deterministic hex color for a label index."""
    colors = [
        "#ff0000", "#00ff00", "#0000ff", "#ffff00", "#00ffff", "#ff00ff",
        "#ff8800", "#8800ff", "#00ff88", "#ff0088", "#0088ff", "#88ff00",
        "#cc4444", "#44cc44", "#4444cc", "#cccc44", "#44cccc", "#cc44cc",
    ]
    return colors[idx % len(colors)]


def main():
    parser = argparse.ArgumentParser(description="SIGMA AI Inference Server")
    parser.add_argument("--host", default="0.0.0.0", help="Bind address")
    parser.add_argument("--port", type=int, default=8080, help="Port")
    args = parser.parse_args()

    print(f"Registered model runners: {list(_runners.keys())}")
    print(f"Starting inference server on http://{args.host}:{args.port}")
    uvicorn.run(app, host=args.host, port=args.port)


if __name__ == "__main__":
    main()
