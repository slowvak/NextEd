---
phase: quick
plan: 260413-l5j
subsystem: client/toolbar
tags: [ui, toolbar, dropdown, tools]
dependency_graph:
  requires: []
  provides: [tool-dropdown-selector]
  affects: [client/src/main.js, client/src/styles.css]
tech_stack:
  added: []
  patterns: [inline-dropdown-pattern]
key_files:
  created: []
  modified:
    - client/src/main.js
    - client/src/styles.css
decisions:
  - Inline styles used for dropdown positioning to avoid layout coupling with existing flex container
  - Outside-click handler uses document-level listener with toolSec.contains() check
metrics:
  duration: "~3 minutes"
  completed_date: "2026-04-13"
  tasks: 2
  files: 2
---

# Quick Task 260413-l5j: Combine Tool Buttons into Dropdown Summary

**One-liner:** Single compact dropdown button replacing three separate tool buttons (Cursor/Paint/Grow2D) with active-tool label display.

## What Was Done

Replaced the three individual tool buttons (`⌖`, `🖌 Paint`, `Grow2D`) in the tool section of `client/src/main.js` with a single dropdown selector. The button shows the currently active tool's label and a chevron. Clicking it opens a menu with all three options; selecting one activates that tool, updates the button label, and closes the menu. Clicking outside the dropdown also closes it.

CSS hover and border-radius rules were added to `styles.css` for the `.tool-option` class.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Replace tool buttons with dropdown in main.js | c7a9658 | client/src/main.js |
| 2 | Add dropdown menu CSS to styles.css | da07131 | client/src/styles.css |

## Implementation Details

- `toolSec.innerHTML` replaced with a `<div id="tool-dropdown">` wrapping a toggle button and a hidden menu div
- Three `.tool-option` buttons inside the menu carry `data-tool` and `data-label` attributes
- `toolDropdownBtn` click toggles menu visibility with `e.stopPropagation()`
- Document-level click listener closes menu when click is outside `toolSec`
- `updateActiveTool()` now queries `.tool-option` elements, updates the label span, and highlights the active option with `#e8f0fe` background / `#4a9eff` color
- `state.subscribe(updateActiveTool)` and initial `updateActiveTool()` call preserved

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None.

## Self-Check: PASSED

- client/src/main.js: modified (confirmed by edit)
- client/src/styles.css: modified (confirmed by grep showing tool-option rules at line 585)
- Commits c7a9658 and da07131 exist (confirmed by git commit output)
- Vite build passed with exit 0
