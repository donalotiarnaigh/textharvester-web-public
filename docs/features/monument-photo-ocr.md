### Technical Design: Monument Photo OCR (Phase 0)

#### Overview
Enable OCR directly from monument photos in addition to record-sheet images. Phase 0 delivers the baseline capability with minimal surface area changes and complete backward compatibility.

---

## 1. Goals and Non‑Goals

### Goals
- Allow users to upload monument photos and extract structured memorial data (names, year_of_death, inscription) via the existing pipeline.
- Maintain existing provider abstraction and results/export flows.
- Introduce a minimal, reversible schema extension to attribute results to their source type.
- Gate the feature behind a runtime flag for safe rollout.

### Non‑Goals (Phase 0)
- No image pre‑processing (deskew/denoise/contrast), no text‑region detection, no overlays.
- No multi‑image fusion for a single memorial.
- No new relational tables beyond a single nullable column on `memorials`.

---

## 2. Current System Summary (Reference)
- Upload → Queue → Provider Prompt → AI Response → Validation/Conversion → SQLite store → Results UI → Export.
- Key endpoints: `POST /upload`, `GET /results-data`, `GET /download-{json,csv}`, `GET /progress`, `POST /cancel-processing`.
- Providers: OpenAI GPT‑5, Anthropic Claude 4 Sonnet via modular provider layer and prompt templates.
- Data: `memorials` table with prompt/model metadata; exports to CSV/JSON; logs and performance tracking in place.

---

## 3. Functional Requirements (Phase 0)
- Users can select an upload mode: `record_sheet` (default) or `monument_photo`.
- When `monument_photo` is selected:
  - The backend uses a monument‑specific prompt template with strict JSON response requirements.
  - The result is stored with `source_type = 'monument_photo'`.
  - Results appear in the existing results page and exports without layout changes.
- When the feature flag is disabled, the UI hides the new mode and the backend ignores any `source_type=monument_photo` values.

---

## 4. Architecture Overview

### 4.1 Frontend
- Add a mode selector on the upload page with two options: "Record Sheet" and "Monument Photos".
- Persist the selected mode in `localStorage` (key: `uploadMode`) and include it in `POST /upload` as `source_type`.
- Update copy to set expectations for monument photos (front‑facing, high‑contrast, minimal glare).
- Results page: extend Model Info panel to display `source_type` when present.

### 4.2 Backend
- `POST /upload` reads `source_type` from form body and propagates it into queued file items.
- `fileQueue` and `fileProcessing` pass `source_type` through to the provider selection/prompt logic.
- Provider layer selects monument prompt templates when `source_type=monument_photo`; otherwise uses the existing record‑sheet prompts.
- Store `source_type` on the `memorials` row; default to `record_sheet` when absent for backward compatibility.

---

## 5. Detailed Design

### 5.1 Frontend Changes
- UI: Add a radio/select control on the upload page for mode selection (default: record sheet).
- Persistence: Write to/read from `localStorage.uploadMode`.
- Request: Include `source_type` in `FormData` for `POST /upload`.
- Results: Display `source_type` in the Model Info panel without altering table structure.

### 5.2 API and Server
- `POST /upload`
  - Accept new optional field: `source_type` ∈ {`record_sheet`, `monument_photo`}.
  - Validate value; fallback to `record_sheet` if missing/invalid.
  - Inject `source_type` into file queue items alongside `provider`, `promptTemplate`, `promptVersion`.
- No changes to response schema; existing clients remain compatible.

### 5.3 Processing and Providers
- `fileProcessing.processFile(...)` receives `options.source_type`.
- Prompt selection:
  - If `source_type === 'monument_photo'`, select the monument prompt template for the active provider.
  - Else, use the existing record‑sheet prompt.
- Monument prompt template guidelines:
  - Emphasize extracting only text visibly present; avoid hallucination.
  - Normalize `year_of_death` to integer (1500–2100) or `null`.
  - Allow missing `memorial_number` when absent; do not infer.
  - Return strict JSON mapping to current DB fields.

### 5.4 Data Model
- Add nullable column to `memorials`:
  - `source_type TEXT` with expected values `record_sheet` | `monument_photo`.
- Migration:
  - Idempotent: add column only if it does not exist.
  - Backfill: set `record_sheet` where `NULL` (optional; display can treat `NULL` as `record_sheet`).
- Exports: unchanged; include `source_type` when present.

### 5.5 Configuration and Rollout
- Env flag: `FEATURE_MONUMENT_OCR_PHASE0=true|false` (default `false`).
- Frontend hides mode selector when flag is `false` (exposed via bootstrapped config or `/results-data` metadata).
- Backend ignores `monument_photo` inputs when flag is `false`.
- Rollout: enable on staging, validate sample set, then enable in production.

### 5.6 Observability
- Log `source_type` at upload, processing start, and DB store.
- Continue performance tracking per provider/model; no new metrics required.

### 5.7 Security & Privacy
- No additional sensitive data beyond existing flows; images are user‑provided and processed as today.
- Do not log image contents; keep payload truncation for model responses.
- Respect existing cleanup of temporary files post‑processing.

### 5.8 Failure Modes
- Missing/invalid `source_type`: default to `record_sheet` and proceed.
- Provider JSON parse errors: handled by existing validation; return error result as today.
- Flag disabled but UI sends `monument_photo`: backend coerces to `record_sheet`.

---

## 6. Acceptance Criteria
- Upload 10–20 monument photos; receive valid JSON mapped to DB fields in ≥70% of cases.
- No regressions in record‑sheet flow; all tests pass.
- `source_type` stored and visible in Model Info and `GET /results-data`.
- Flag off → legacy behavior; flag on → monument mode available and functional.

---

## 7. Testing Plan
- Unit: prompt selection logic; monument prompt formatting/validation; DB column migration utility.
- Integration: `POST /upload` with `source_type=monument_photo` → queue → mocked provider → DB → `GET /results-data`.
- UI: mode selector visibility (flag on/off), selection persistence, Model Info shows `source_type`.
- Fixtures: golden samples of monument photos with deterministic mocked outputs.

---

## 8. Implementation Tasks
- Prompts: add monument templates per provider; wire into prompt manager/provider selection.
- Backend: propagate `source_type` through upload → queue → processing.
- Database: migration to add `memorials.source_type` (nullable, default behavior treats NULL as `record_sheet`).
- Frontend: add mode selector, copy updates, Model Info `source_type` display.
- Config: implement `FEATURE_MONUMENT_OCR_PHASE0` gating on FE/BE.

---

## 9. Open Questions / Assumptions
- Languages and diacritics: rely on provider multilingual capability; Phase 0 does not add language selection.
- Memorial number: treated as optional for monument photos; no inference. Use file_name as the fallback identifier.
- Date extraction: only extract if clearly present; no OCR‑based arithmetic or inference.



