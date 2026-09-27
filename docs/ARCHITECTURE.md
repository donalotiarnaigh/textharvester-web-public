# System Architecture

This document describes the overall structure, data flow, and key modules of TextHarvester.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js ≥22.0.0 |
| Web framework | Express 4.x |
| Database | SQLite (via `sqlite3`) |
| Image processing | Sharp, pdf-poppler |
| AI providers | OpenAI SDK, Anthropic SDK, Google Generative AI SDK, Mistral SDK |
| Frontend | Vanilla HTML/CSS/JavaScript (no framework) |
| Logging | Winston |
| CLI | Commander.js |
| Testing | Jest, Supertest |

---

## High-Level System Diagram

```
┌─────────────────────────────────────────────────────┐
│                     Client                          │
│          Browser (Web UI)  /  iOS App  /  CLI       │
└──────────────────────┬──────────────────────────────┘
                       │ HTTP
┌──────────────────────▼──────────────────────────────┐
│                    server.js                        │
│            Express app · middleware · routes        │
└──┬──────────────┬──────────────┬───────────────┬───┘
   │              │              │               │
   ▼              ▼              ▼               ▼
Routes         Routes         Routes          Routes
(upload,       (projects,     (results,       (performance,
 progress,      grave-cards,   schemas,        mobile,
 export)        volume-ids)    cost-estimate)  providers)
   │
   ▼
Controllers  ─────────────────────────────────────────┐
(uploadHandler, resultEditController, projectController│
 graveCardController, mobileUploadHandler, ...)       │
   │                                                  │
   ▼                                                  │
Services                                              │
(IngestService, QueryService, ExportService,          │
 SchemaManager, SchemaGenerator, SystemService)       │
   │                                                  │
   ▼                                                  │
Storage / Utils ──────────────────────────────────────┘
(database.js, burialRegisterStorage.js,
 graveCardStorage.js, projectStorage.js,
 llmAuditLog.js, fileQueue.js, fileProcessing.js)
   │
   ▼
SQLite: memorials.db
(memorials · burial_register_entries · grave_cards · llm_audit_log)
```

---

## Async Processing Pipeline

File uploads are handled asynchronously. The upload endpoint returns immediately; processing continues in the background.

```
POST /upload
     │
     ▼
uploadHandler.js  ←── multer (disk storage, 1GB limit)
     │
     ▼
IngestService.prepareAndQueue()
     │  returns queueId immediately
     │
     ├── (PDFs) → _startBackgroundConversion()
     │             pdf-poppler converts PDF → JPEG(s)
     │             conversionTracker.js tracks state
     │
     └── fileQueue.enqueue(files)
              │
              ▼  (background, maxConcurrent: 3)
         fileProcessing.processFile()
              │
              ├── Reads source type from filename
              ├── Selects provider (OpenAI / Anthropic / Gemini / Mistral)
              ├── Generates UUID processing_id for correlation
              ├── processWithValidationRetry()
              │       │
              │       ├── provider.processImage()  ←── retryHelper.withRetry()
              │       │     (sends image + prompt to AI API)
              │       │     llmAuditLog.logEntry() on success/failure
              │       │
              │       └── prompt.validateAndConvert()
              │             attaches _confidence_scores
              │             attaches _validation_warnings
              │
              └── Storage
                    memorial       → database.storeMemorial()
                    burial_register → burialRegisterStorage.storeEntry()
                    grave_record_card → graveCardStorage.storeGraveCard()
```

---

## Results Retrieval Flow

```
GET /results-data
     │
     ▼
resultsManager.getResults()
     │
     ▼
QueryService.list(options)
     │  filters: sourceType, projectId, needsReview, pagination
     ▼
Storage adapters (database.js / burialRegisterStorage / graveCardStorage)
     │
     ▼
JSON response → browser renders results table
```

---

## Source Type Branching

Each uploaded file is classified by source type, which determines the prompt template, AI provider call, and storage table used.

| Source Type | Prompt Class | Storage |
|-------------|-------------|---------|
| `memorial` | `MemorialOCRPrompt` | `memorials` table |
| `burial_register` | `BurialRegisterPrompt` | `burial_register_entries` table |
| `grave_record_card` | `TypographicAnalysisPrompt` | `grave_cards` table |
| `monument_photo` | `MemorialOCRPrompt` (dual mode) | `memorials` table |

---

## Prompt Class Hierarchy

```
BasePrompt
├── _extractValueAndConfidence()  — unwraps {value, confidence} or scalar
├── validateAndConvert()          — base implementation
│
├── MemorialOCRPrompt             — gravestone transcription
├── BurialRegisterPrompt          — per-entry burial register extraction
└── TypographicAnalysisPrompt     — typography, iconography, stone condition
```

Prompt templates are in `src/utils/prompts/templates/`, one subdirectory per provider.

---

## Provider Integration

All four providers implement the same interface: `processImage(imagePath, prompt, options)` → `{ content, usage }`.

```
fileProcessing.js
     │
     ├── provider === 'openai'    → src/utils/modelProviders/openaiProvider.js
     ├── provider === 'anthropic' → src/utils/modelProviders/anthropicProvider.js
     ├── provider === 'gemini'    → src/utils/modelProviders/geminiProvider.js
     └── provider === 'mistral'   → src/utils/modelProviders/mistralProvider.js

Each provider:
  1. Wraps API call in retryHelper.withRetry() (maxProviderRetries: 3)
  2. Logs to llmAuditLog (full prompt, raw response, tokens, timing)
  3. Returns { content: <parsed JSON string>, usage: { inputTokens, outputTokens } }
```

---

## Database Schema

Four SQLite tables in `./data/memorials.db`:

| Table | Module | Purpose |
|-------|--------|---------|
| `memorials` | `src/utils/database.js` | Gravestone OCR results |
| `burial_register_entries` | `src/utils/burialRegisterStorage.js` | Burial register per-entry results |
| `grave_cards` | `src/utils/graveCardStorage.js` | Grave record card results |
| `llm_audit_log` | `src/utils/llmAuditLog.js` | Full prompt/response audit trail |

All result tables share common columns: `processing_id`, `confidence_scores`, `needs_review`, `validation_warnings`, `input_tokens`, `output_tokens`, `estimated_cost_usd`.

---

## Key Module Reference

### Entry Points

| File | Purpose |
|------|---------|
| `server.js` | App initialization, middleware, route registration, startup chain |
| `bin/textharvester` | CLI entry point |

### Routes (`src/routes/`)

| File | Prefix | Purpose |
|------|--------|---------|
| `api.js` | `/api/schemas` | Custom schema CRUD + AI-generated schema proposals |
| `projectRoutes.js` | `/api/projects` | Project management |
| `graveCardRoutes.js` | `/api/grave-cards` | Grave card retrieval + CSV export |
| `volumeIdRoutes.js` | `/api/volume-ids` | Burial register volume autocomplete |
| `costEstimateRoutes.js` | `/api/cost-estimate` | Pre-batch cost estimation |
| `resultEditRoutes.js` | `/api/results` | Inline result editing + review marking |
| `mobileUploadRoutes.js` | `/api/mobile` | iOS app upload integration |
| `performanceRoutes.js` | `/api/performance` | Performance metrics and alerting |

### Controllers (`src/controllers/`)

| File | Responsibility |
|------|---------------|
| `uploadHandler.js` | Multer config, file validation, IngestService coordination |
| `mobileUploadHandler.js` | iOS photo upload, JPEG/PNG only, 50MB limit |
| `resultsManager.js` | Results retrieval, JSON/CSV export |
| `resultEditController.js` | Inline field edits, review marking, input sanitization |
| `projectController.js` | Project CRUD, guards delete if records exist |
| `graveCardController.js` | Grave card list and CSV export |

### Services (`src/services/`)

| File | Responsibility |
|------|---------------|
| `IngestService.js` | File ingestion pipeline, PDF conversion, queue management |
| `QueryService.js` | Filtered/paginated result queries, 60s in-memory cache |
| `ExportService.js` | Batch JSON/CSV export to file or memory |
| `SchemaManager.js` | Custom schema CRUD, column migrations |
| `SchemaGenerator.js` | AI-powered schema synthesis from document images |
| `SystemService.js` | DB initialization, system health status |

### Core Utilities (`src/utils/`)

| File | Responsibility |
|------|---------------|
| `fileProcessing.js` | Per-file OCR orchestration, provider dispatch, result storage |
| `fileQueue.js` | Async processing queue, concurrency control, progress tracking |
| `conversionTracker.js` | PDF→JPEG conversion state (pending/complete/failed) |
| `retryHelper.js` | Provider retry with exponential backoff + error classification |
| `database.js` | `memorials` table: schema, migrations, `storeMemorial()` |
| `burialRegisterStorage.js` | `burial_register_entries` table |
| `graveCardStorage.js` | `grave_cards` table |
| `projectStorage.js` | `projects` table |
| `llmAuditLog.js` | `llm_audit_log` table, fire-and-forget logging |
| `costEstimator.js` | Pre-batch cost estimation from file counts + provider rates |
| `performanceTracker.js` | Metrics collection, alert thresholds, cleanup |
| `apiKeyValidator.js` | Validate API keys at startup |
| `historicalDateParser.js` | Parse Latin months, Old Style/New Style date conversions |

### Frontend (`public/js/modules/`)

Vanilla JavaScript modules loaded directly in the browser (no bundler).

| Module area | Purpose |
|-------------|---------|
| `results/` | Results table rendering, filtering, detail views, CSV export |
| Upload UI | Dropzone integration, file type validation |
| Progress | Real-time processing progress polling |

---

## Directory Tree

```
textharvester-web/
├── server.js                   # Express app entry point
├── config.json                 # All configuration (see docs/CONFIG.md)
├── bin/
│   └── textharvester           # CLI entry point
├── src/
│   ├── cli/
│   │   └── commands/           # CLI command implementations
│   ├── controllers/            # HTTP request handlers
│   ├── routes/                 # Express route definitions
│   ├── services/               # Business logic layer
│   └── utils/
│       ├── modelProviders/     # OpenAI, Anthropic, Gemini, Mistral adapters
│       ├── prompts/
│       │   └── templates/      # Provider-specific prompt templates
│       ├── processors/         # Source-type-specific processing logic
│       ├── migrations/         # DB migration helpers
│       └── *.js                # Core utilities (see table above)
├── public/
│   ├── js/modules/             # Frontend JavaScript modules
│   ├── css/                    # Stylesheets
│   └── *.html                  # Page templates
├── __tests__/                  # Jest test suite (mirrors src/ structure)
├── docs/                       # Documentation
│   ├── ARCHITECTURE.md         # This file
│   ├── API.md                  # API endpoint reference
│   ├── CONFIG.md               # Configuration reference
│   ├── features/               # User-facing feature docs
│   ├── implementation/         # Technical design and WBS docs
│   └── operations/             # Deployment and runbook
├── eval/                       # Ground truth dataset and scoring tools
│   ├── ground-truth/           # REAL annotated .gt.json — local only, gitignored
│   ├── fixtures/synthetic/     # Tracked fabricated .gt.json examples (same schema)
│   ├── scripts/                # export-for-annotation.js, score.js
│   └── reports/                # Generated eval reports (gitignored)
├── scripts/                    # Utility and migration scripts
├── sample_data/                # Test fixtures
├── data/                       # Runtime data (gitignored)
│   └── memorials.db            # SQLite database
├── uploads/                    # Uploaded files (gitignored)
└── logs/                       # Application logs (gitignored)
```

---

## Related Documentation

- [API Reference](API.md) — all endpoint signatures
- [Configuration Reference](CONFIG.md) — every config.json key
- [Operations Runbook](operations/RUNBOOK.md) — deployment and incident response
- [Feature Docs](features/) — user-facing feature documentation
