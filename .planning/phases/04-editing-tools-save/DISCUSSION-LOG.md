# Phase 04 Discussion Log

**Date:** 2026-03-26

## Q1: Brush Mechanics
**Question:** Circle brush vs square brush? Fixed size vs adjustable radius?
**User Answer:** circular and adjustable size. it needs to be bitmaps since paintbrush is not a bounding box.
**Agent Action:** Recorded D-01 for adjustable circular brush.

## Q2: Undo History Memory
**Question:** Full volume copies vs bounding box diffs?
**User Answer:** but diffs of bitmaps is OK.
**Agent Action:** Recorded D-02 for sparse bitmap diffs.

## Q3: Save Workflow UI
**Question:** Dedicated "Save As" button in the left panel vs right sidebar?
**User Answer:** Save As should be in popup when 'Save' is clicked.
**Agent Action:** Recorded D-03 to place Save button in left panel opening a modal popup.

## Q4: Constrained Painting UI
**Question:** How to set the min/max pixel value range?
**User Answer:** yes dual handle slider.
**Agent Action:** Recorded D-04 for a dual-handle slider.

## Q5: Per-Label Visibility
**Question:** Add show/hide (eye icon) toggles to the Phase 03 label list?
**User Answer:** yes CSS class toggle on the overlay
**Agent Action:** Recorded D-05. Interpreted CSS toggle to apply to the UI elements but functionally implemented within the Canvas renderer skipping the hidden label indices.
