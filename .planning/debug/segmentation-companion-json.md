## ROOT CAUSE FOUND

**Debug Session:** .planning/debug/segmentation-companion-json.md

**Root Cause:** The system currently auto-generates dummy label names ("Label 1", "Label 2") by scanning unique voxel values in the NIfTI mask. There is no mechanism to define semantic label names (e.g., "Left Lung", "Contusion"), custom colors, or other metadata (like modality) via a companion JSON file.

**Evidence Summary:**
- User feedback states "'autodiscovers' [is unclear]. There probably needs to be a companion JSON or otehr file to store the label name".
- `server/main.py` only discovers `_segmentation.nii.gz` and does not look for a corresponding `.json` file.
- `client/src/viewer/labelManager.js` `discoverLabels()` simply assigns `Label ${val}` and picks a color from the default palette based on the integer value.

**Files Involved:**
- `server/main.py`: Missing companion JSON discovery logic.
- `server/catalog/models.py`: `SegmentationMetadata` needs to support custom label arrays.
- `client/src/viewer/labelManager.js`: Needs to merge discovered metadata into the auto-discovered mask values.

**Suggested Fix Direction:** Update the data pipeline to discover `<name>_segmentation.json` alongside the mask. Pass this metadata to the frontend so `ViewerState` and `labelManager` can use semantic names and assigned colors instead of fallback defaults.
