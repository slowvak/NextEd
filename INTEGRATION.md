# Integration Guide: Sigma as a Tool

Sigma can be integrated into external workflows (like **Ewocs5**) by launching it with specific URL parameters. This "Task Mode" bypasses the volume browser and focuses on a single image and annotation task.

## URL Parameters

| Parameter | Alias | Description |
|-----------|-------|-------------|
| `image` | `volume` | **Required.** Absolute filesystem path to the image (NIfTI or DICOM folder). |
| `segmentation` | `output` | **Optional.** Path where the resulting segmentation should be saved as `nii.gz`. |
| `mask` | - | **Optional.** Path to an existing segmentation to load as a starting point. |
| `callback` | - | **Optional.** URL to POST a JSON result to upon task completion. |
| `return_url` | - | **Optional.** URL to redirect the browser to after completion. |
| `prompt` | - | **Optional.** Instruction text displayed at the top of the viewer. |
| `mode` | - | Task mode: `edit` (default), `qc`, or `edit+qc`. |
| `task_id` | - | External ID passed back in the callback for tracking. |

## Example URL

```
http://localhost:8080/?image=/data/images/scan01.nii.gz&segmentation=/data/output/mask01.nii.gz&callback=http://ewocs5/api/tasks/complete&prompt=Please+segment+the+liver
```

## Workflow

1. **Launch:** The external system (e.g., Ewocs5) opens Sigma with the above parameters.
2. **Load:** Sigma automatically registers and loads the image from the specified path.
3. **Annotate:** The user performs segmentations using Sigma's tools.
4. **Complete:** The user clicks the **Complete Task** button in the top bar.
5. **Save:** Sigma saves the segmentation to the `segmentation` path on the server.
6. **Signal Back:**
   - **POST Callback:** If `callback` is provided, Sigma sends a JSON payload with task metadata.
   - **Window Message:** If Sigma was opened as a popup, it sends a `postMessage` to the opener.
   - **Redirect:** If `return_url` is provided, Sigma redirects the browser after a short delay.

## Callback Payload

When `callback` is provided, Sigma POSTs a payload like this:

```json
{
  "status": "completed",
  "response": {
    "decision": "completed",
    "text": "",
    "labels_modified": [1, 2],
    "time_spent_seconds": 145
  },
  "mask_path": "/data/output/mask01.nii.gz",
  "task_id": "xyz-123"
}
```
