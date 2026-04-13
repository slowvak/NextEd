---
phase: quick
plan: 260413-lbs
type: execute
wave: 1
depends_on: []
files_modified:
  - client/src/viewer/ViewerPanel.js
autonomous: true
requirements: []

must_haves:
  truths:
    - "Region Grow does not overwrite pixels already labeled with a non-zero label"
    - "Region Grow still labels all matching unlabeled pixels within the intensity range"
  artifacts:
    - path: "client/src/viewer/ViewerPanel.js"
      provides: "Updated _applyRegionGrow that skips already-labeled voxels"
  key_links:
    - from: "_applyRegionGrow BFS loop"
      to: "segVolume check"
      via: "condition on line ~688"
      pattern: "segVolume\\[idx\\] === 0"
---

<objective>
Skip already-labeled voxels during Region Grow so the tool only adds pixels where `segVolume[idx] === 0`.

Purpose: Prevent Grow 2D from overwriting existing segmentation labels painted by the user or previous grow operations on other labels.
Output: Modified `_applyRegionGrow` in ViewerPanel.js with one additional guard condition.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Skip already-labeled voxels in _applyRegionGrow</name>
  <files>client/src/viewer/ViewerPanel.js</files>
  <action>
In `_applyRegionGrow` (around line 688), the BFS acceptance condition currently reads:

```js
if (val >= regionGrowMin && val <= regionGrowMax) {
```

Change it to also require the voxel is currently unlabeled:

```js
if (val >= regionGrowMin && val <= regionGrowMax && this.state.segVolume[idx] === 0) {
```

This is safe because `_applyRegionGrow` always reverts the previous `_currentDiff` before re-growing (lines 651–655), so pixels grown in the current interactive session will have been restored to their original `oldValues` (which for fresh pixels is 0) before the new BFS runs. Pixels painted by other means (paint tool, other label grows) retain their non-zero label and will be skipped.

Do NOT change neighbor-enqueueing logic — neighbors of a skipped (already-labeled) pixel should still be enqueued so the BFS can route around them and reach unlabeled pixels on the far side if they are intensity-connected.

The neighbor-push block (lines ~693–712) remains inside the `if` block currently, meaning neighbors of a skipped pixel are NOT enqueued. To preserve connectivity and allow the grow to route around labeled blobs, move the neighbor-push block OUTSIDE the intensity check, so the BFS always explores neighbors of any visited voxel regardless of whether it was accepted.

Resulting structure:

```js
while (head < q.length) {
    const [cx, cy, cz] = q[head++];
    const idx = cz * dimX * dimY + cy * dimX + cx;
    const val = this.volume[idx];

    // Accept only unlabeled voxels within intensity range
    if (val >= regionGrowMin && val <= regionGrowMax && this.state.segVolume[idx] === 0) {
        newDiff.indices.push(idx);
        newDiff.oldValues.push(this.state.segVolume[idx]);
        this.state.segVolume[idx] = activeLabel;
    }

    // Always enqueue neighbors (regardless of acceptance) so grow routes around labeled regions
    for (const [dx, dy, dz] of neighbors) {
        const nx = cx + dx;
        const ny = cy + dy;
        const nz = cz + dz;

        if (nx >= 0 && nx < dimX && ny >= 0 && ny < dimY && nz >= 0 && nz < dimZ) {
            let depthOut = false;
            if (this.axis === 'axial' && (nz < minD || nz > maxD)) depthOut = true;
            if (this.axis === 'coronal' && (ny < minD || ny > maxD)) depthOut = true;
            if (this.axis === 'sagittal' && (nx < minD || nx > maxD)) depthOut = true;

            if (!depthOut) {
                const nIdx = nz * dimX * dimY + ny * dimX + nx;
                if (!visited[nIdx]) {
                    visited[nIdx] = 1;
                    q.push([nx, ny, nz]);
                }
            }
        }
    }
}
```

Note: `newDiff.oldValues.push(this.state.segVolume[idx])` inside the `if` block will always push `0` (since we just checked `segVolume[idx] === 0`), which is correct — the undo value for a newly labeled pixel is 0.
  </action>
  <verify>
    <automated>cd /Users/bje/repos/NextEd/client && npm test 2>&1 | tail -20</automated>
  </verify>
  <done>
- `_applyRegionGrow` contains `this.state.segVolume[idx] === 0` as part of the acceptance condition
- Neighbor-push loop is outside the acceptance if-block
- Existing test suite passes
- Growing on a slice with pre-existing labels does not overwrite them
  </done>
</task>

</tasks>

<verification>
Manually: paint some pixels with label A, switch to label B, use Grow 2D on an adjacent region — label A pixels must remain unchanged after the grow.
</verification>

<success_criteria>
Region Grow writes `activeLabel` only to voxels where `segVolume[idx] === 0`. All other labeled voxels are preserved regardless of their intensity value.
</success_criteria>

<output>
After completion, create `.planning/quick/260413-lbs-make-grow-2d-only-grow-add-pixels-that-a/260413-lbs-SUMMARY.md`
</output>
