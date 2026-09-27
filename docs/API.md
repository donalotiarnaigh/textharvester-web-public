# API Reference

All endpoints served by `server.js`. JSON body/response unless stated otherwise.

---

## Upload & Processing

### `POST /upload`

Upload one or more files for OCR processing. Returns immediately; processing runs in the background.

**Request:** `multipart/form-data`

| Field | Type | Description |
|-------|------|-------------|
| `files` | File[] | JPEG images or PDF files. Max 1GB per file. |
| `provider` | string | AI provider: `openai`, `anthropic`, `gemini`, `mistral` |
| `sourceType` | string | `memorial`, `burial_register`, `grave_record_card`, `monument_photo` |
| `projectId` | number | (optional) Associate results with a project |

**Response `200`:**
```json
{ "message": "Files queued", "queueId": "abc123", "fileCount": 3 }
```

---

### `GET /processing-status`

Current state of the processing queue.

**Response `200`:**
```json
{
  "status": "processing",
  "queued": 5,
  "completed": 2,
  "failed": 0,
  "converting": 1
}
```

---

### `GET /progress`

Real-time processing progress. Suitable for polling.

**Response `200`:**
```json
{
  "total": 10,
  "completed": 4,
  "failed": 0,
  "state": "processing",
  "converting": { "active": 1, "completed": 0, "failed": 0 }
}
```

---

### `POST /cancel-processing`

Cancel the current processing queue. In-flight items complete; queued items are dropped.

**Response `200`:**
```json
{ "message": "Processing cancelled" }
```

---

## Results

### `GET /results-data`

Fetch all processed results across all record types.

**Query params:**

| Param | Description |
|-------|-------------|
| `sourceType` | Filter: `memorial`, `burial_register`, `grave_record_card` |
| `projectId` | Filter by project ID |
| `needsReview` | `1` to return only flagged records |
| `offset` | Pagination offset (default: 0) |
| `limit` | Page size (default: all) |

**Response `200`:**
```json
{
  "memorials": [...],
  "burialRegisterEntries": [...],
  "graveCards": [...]
}
```

---

### `GET /download-json`

Download all results as a formatted JSON file.

**Response `200`:** `application/json` attachment with timestamped filename.

---

### `GET /download-csv`

Download all results as a CSV file.

**Response `200`:** `text/csv` attachment with timestamped filename. Column order follows the display table.

---

## Result Editing

### `PATCH /api/results/memorials/:id`

Update fields on a memorial record.

**Request body:** Key-value pairs of fields to update. String values are trimmed to 10,000 characters.

**Response `200`:** Updated record. `404` if not found. `400` if ID is not a positive integer.

---

### `PATCH /api/results/burial-register/:id`

Update fields on a burial register entry.

Same request/response shape as memorial update above.

---

### `PATCH /api/results/grave-cards/:id`

Update fields on a grave card record.

Same request/response shape as memorial update above.

---

### `POST /api/results/memorials/:id/review`

Mark a memorial record as reviewed (clears `needs_review`, sets `reviewed_at`).

**Response `200`:** `{ "message": "Marked as reviewed" }`. `404` if not found.

---

### `POST /api/results/burial-register/:id/review`

Mark a burial register entry as reviewed.

---

### `POST /api/results/grave-cards/:id/review`

Mark a grave card as reviewed.

---

## Projects

### `GET /api/projects`

List all projects.

**Response `200`:**
```json
[{ "id": 1, "name": "St Mary's 2024", "description": "...", "created_at": "..." }]
```

---

### `POST /api/projects`

Create a project.

**Request body:**
```json
{ "name": "St Mary's 2024", "description": "Optional description" }
```

**Response `201`:** Created project object.
- `400` if `name` is empty.
- `409` if a project with that name already exists.

---

### `GET /api/projects/:id`

Get a single project.

**Response `200`:** Project object. `404` if not found.

---

### `PATCH /api/projects/:id`

Update project name and/or description.

**Request body:** `{ "name": "New name", "description": "New description" }` (both optional).

**Response `200`:** Updated project object. `400` if name is set to empty string.

---

### `DELETE /api/projects/:id`

Delete a project. Fails if any records are still associated with it.

**Response `200`:** `{ "message": "Deleted" }`.
- `409` if records exist: `{ "error": "...", "counts": { "memorials": 3, "burialEntries": 0, "graveCards": 0 } }`.

---

## Grave Cards

### `GET /api/grave-cards`

List all grave card records.

**Response `200`:** Array of grave card objects.

---

### `GET /api/grave-cards/csv`

Export all grave cards as a CSV file.

**Response `200`:** `text/csv` attachment with timestamped filename.

---

## Burial Register

### `GET /api/volume-ids`

Returns distinct volume IDs present in the burial register table. Used for autocomplete in the UI.

**Response `200`:** `["vol1", "vol2"]`

---

## Schemas

### `POST /api/schemas/propose`

Analyse document images and generate a JSON Schema proposal using AI.

**Request:** `multipart/form-data` with one or more image files.

**Response `200`:**
```json
{
  "schema": { "$schema": "...", "properties": { ... } },
  "fieldCount": 12
}
```

---

### `GET /api/schemas`

List all stored custom schemas.

**Response `200`:** Array of schema metadata objects.

---

### `GET /api/schemas/:id`

Get a single schema by ID.

**Response `200`:** Schema definition. `404` if not found.

---

### `POST /api/schemas`

Create a custom schema and its corresponding database table.

**Request body:** JSON Schema definition.

**Response `201`:** Created schema with `id`.

---

### `PUT /api/schemas/:id`

Update an existing schema. Adding columns is allowed; removing fields or changing types is not.

**Request body:** Updated JSON Schema definition.

**Response `200`:** Updated schema. `400` if attempting to remove fields or change types.

---

## Cost & Providers

### `GET /api/cost-estimate`

Estimate cost for a planned batch before uploading.

**Query params:**

| Param | Required | Description |
|-------|----------|-------------|
| `fileCount` | Yes | Number of image files |
| `provider` | Yes | `openai`, `anthropic`, `gemini`, `mistral` |
| `sourceType` | Yes | `memorial`, `burial_register`, `grave_record_card` |
| `pdfCount` | No | Number of PDFs (each counted separately by page) |

**Response `200`:**
```json
{
  "estimatedCostUsd": 0.42,
  "breakdown": { "inputTokens": 150000, "outputTokens": 45000 }
}
```

---

### `GET /api/providers/status`

Check API key validation status for all configured providers.

**Response `200`:**
```json
{
  "openai": { "valid": true, "model": "gpt-5.4" },
  "anthropic": { "valid": true, "model": "claude-opus-4-6" },
  "gemini": { "valid": false, "error": "Invalid API key" },
  "mistral": { "valid": true, "model": "mistral-ocr-latest" }
}
```

---

## Mobile Upload

### `POST /api/mobile/upload`

Single-image upload endpoint for the iOS companion app. Accepts JPEG/PNG only. 50MB limit.

**Request:** `multipart/form-data`

| Field | Type | Description |
|-------|------|-------------|
| `image` | File | JPEG or PNG image |
| `provider` | string | AI provider |
| `sourceType` | string | Record type |

**Response `200`:** `{ "queueId": "abc123" }`. `400` if file type is invalid.

---

## Performance Monitoring

### `GET /api/performance/stats`

Aggregate performance statistics.

### `GET /api/performance/recent`

Recent performance metric entries.

### `GET /api/performance/summary`

Generated summary report of performance over the tracking window.

### `GET /api/performance/system`

Current system metrics: memory usage, CPU, uptime.

### `GET /api/performance/dashboard`

Combined dashboard payload (stats + recent + system + alerts).

### `GET /api/performance/alerts`

Recent alert events that crossed a threshold.

### `GET /api/performance/alerts/stats`

Aggregate alert counts by type and severity.

### `GET /api/performance/thresholds`

Current alert threshold configuration.

### `PUT /api/performance/thresholds`

Update alert thresholds.

**Request body:**
```json
{
  "responseTime": { "warning": 10000, "critical": 30000, "severe": 60000 },
  "successRate": { "warning": 0.95, "critical": 0.90, "severe": 0.80 }
}
```

### `GET /api/performance/cleanup`

Current cleanup/retention configuration.

### `PUT /api/performance/cleanup`

Update retention policy (max entries, max age).

### `POST /api/performance/cleanup`

Immediately purge metrics older than the retention threshold.

### `POST /api/performance/clear`

Clear all metrics data.

---

## Common Error Shapes

| Status | Meaning |
|--------|---------|
| `400` | Invalid input (missing required field, bad ID format, empty name) |
| `404` | Resource not found |
| `409` | Conflict (duplicate name, delete blocked by associated records) |
| `500` | Unexpected server error — check `logs/error.log` |

All errors return `{ "error": "<message>" }`.
