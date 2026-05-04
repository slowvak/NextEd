# Roadmap: NextEd

## Milestones

- ✅ **v1.0 MVP** — Phases 1-4 (shipped)
- ✅ **v2.0 Image Server Architecture** — Phases 5-8 (shipped 2026-04-07)
- 🚧 **v3.0 AI Integration** — SigmaServer split + AI tool pipeline (in progress)

## Phases

<details>
<summary>✅ v1.0 MVP (Phases 1-4) — SHIPPED</summary>

- [x] **Phase 1: Server & Data Pipeline** — FastAPI server catalogs NIfTI/DICOM volumes and serves them as binary to the browser
- [x] **Phase 2: Core Viewer** — Multi-plane slice rendering with navigation, window/level, and correct anisotropic display
- [x] **Phase 3: Segmentation Display & Labels** — Overlay compositing, label management, and segmentation file loading
- [x] **Phase 4: Editing Tools & Save** — Paintbrush, eraser, undo, pixel constraints, and Save As workflow

</details>

<details>
<summary>✅ v2.0 Image Server Architecture (Phases 5-8) — SHIPPED 2026-04-07</summary>

- [x] **Phase 5: Foundation** (2/2 plans) — API versioning under /api/v1/, DICOM UID metadata, file path retention
- [x] **Phase 6: Folder Monitoring & WebSocket Events** (2/2 plans) — Watchdog watcher, DICOM debouncing, WebSocket live updates, reactive client
- [x] **Phase 7: Format-Aware Segmentation Storage** (2/2 plans) — DICOM-SEG via highdicom, auto format selection, watcher suppress list
- [x] **Phase 8: DICOMweb WADO-RS** (1/1 plan) — Series retrieve (multipart/related), PS3.18 JSON metadata with BulkDataURI

</details>

### v3.0 AI Integration (In Progress)

**Milestone Goal:** SIGMA users can run AI segmentation models from a GPU machine directly within the viewer. Models are discovered dynamically from a separate SigmaServer process and results are applied as segmentation overlays.

**Architecture:**
- `SigmaServer` (../SigmaServer) — standalone GPU server: loads models, exposes `/models` (tool list), `/predict` (inference), `/health`
- `Sigma` — calls `GET /models` on startup to populate the AI tools panel; calls `POST /predict` with the current volume and receives a segmentation mask back

**Phases:**

- [x] **Phase 9: SigmaServer Split** — Extract inference server into `../SigmaServer` repo; add `/models` dynamic discovery endpoint; update Sigma's `server/api/ai.py` to fetch models from SigmaServer rather than static config
- [ ] **Phase 10: AI Tools Panel** — Client-side AI tools panel showing models fetched from `/models`; job submission, SSE progress, result application as segmentation overlay
- [ ] **Phase 11: Additional Models** — Add further models to SigmaServer (e.g. SAM-based refinement, organ-specific models) using the `@register_model` decorator pattern

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Server & Data Pipeline | v1.0 | 3/3 | Complete | - |
| 2. Core Viewer | v1.0 | 3/3 | Complete | - |
| 3. Segmentation Display & Labels | v1.0 | -/- | Complete | - |
| 4. Editing Tools & Save | v1.0 | -/- | Complete | - |
| 5. Foundation | v2.0 | 2/2 | Complete | 2026-03-31 |
| 6. Folder Monitoring & WebSocket Events | v2.0 | 2/2 | Complete | 2026-04-06 |
| 7. Format-Aware Segmentation Storage | v2.0 | 2/2 | Complete | 2026-04-06 |
| 8. DICOMweb WADO-RS | v2.0 | 1/1 | Complete | 2026-04-06 |
| 9. SigmaServer Split | v3.0 | 1/1 | Complete | 2026-05-04 |
| 10. AI Tools Panel | v3.0 | 0/1 | Not started | - |
| 11. Additional Models | v3.0 | 0/1 | Not started | - |
