# Configuration Reference

Complete reference for `config.json` at the project root. Environment variables take precedence over config file values where both are supported.

---

## Server

| Key | Default | Description |
|-----|---------|-------------|
| `port` | `3000` | HTTP server listening port. Override with `PORT` env var. |
| `environment` | `"development"` | Set to `"production"` in production deployments. Controls auto-browser launch and other dev-only behaviours. |

---

## File Upload

| Key | Default | Description |
|-----|---------|-------------|
| `supportedFileTypes` | `["image/jpeg", "image/jpg"]` | MIME types accepted by the web upload endpoint. PDFs are also accepted by the upload handler directly. |
| `uploadPath` | `"./uploads/"` | Directory where uploaded files are written before processing. |
| `upload.maxFileCount` | `100` | Maximum number of files per upload batch. |
| `upload.maxFileSize` | `"50mb"` | Maximum size per individual file. |
| `upload.maxConcurrent` | `3` | Number of files processed concurrently in the queue. |
| `upload.retryDelaySeconds` | `3` | Seconds to wait between automatic retry attempts on transient upload errors. |
| `upload.maxRetryCount` | `3` | Maximum number of automatic upload retry attempts. |

---

## Data Storage

| Key | Default | Description |
|-----|---------|-------------|
| `database.path` | `"./data/memorials.db"` | SQLite database file. Contains all four core tables. |
| `dataStorage.resultsPath` | `"./data/results/"` | Directory for processed result files. |
| `dataStorage.archivePath` | `"./data/archive/"` | Directory for archived data. |
| `dataStorage.tempPath` | `"./data/temp/"` | Temporary working directory for in-flight processing. |
| `dataStorage.backupInterval` | `86400000` | Milliseconds between automatic database backups (default: 24 hours). |
| `resultsPath` | `"./data/results.json"` | Legacy results JSON file path. |
| `processingCompleteFlagPath` | `"./data/processing_complete.flag"` | Sentinel file written when a processing batch finishes. |

---

## Logging

| Key | Default | Description |
|-----|---------|-------------|
| `logging.level` | `"info"` | Winston log level: `"error"`, `"warn"`, `"info"`, `"debug"`. |
| `logging.errorLogFile` | `"./logs/error.log"` | File for error-level log entries. |
| `logging.combinedLogFile` | `"./logs/combined.log"` | File for all log entries. |
| `logging.maxFiles` | `"14d"` | Log file retention window (daily rotation). |
| `logging.maxSize` | `"20m"` | Maximum log file size before rotation. |
| `logging.verboseMode` | `false` | When `true`: disables payload truncation, enables full debug output, disables sampling. Use for debugging — do not leave on in production. |
| `logging.payloadTruncation.enabled` | `true` | Truncate long API response payloads in log entries. |
| `logging.payloadTruncation.maxLength` | `500` | Maximum characters to log from any single payload string. |
| `logging.samplingRate.enabled` | `true` | Enable sampling to reduce log volume in production. |
| `logging.samplingRate.performanceMetrics` | `0.1` | Fraction of performance metric events logged (10%). |
| `logging.samplingRate.payloadLogging` | `0.05` | Fraction of API payload events logged (5%). |

---

## AI Providers

### OpenAI

| Key | Default | Description |
|-----|---------|-------------|
| `openAI.model` | `"gpt-5.4"` | Model name sent to the OpenAI API. |
| `openAI.maxTokens` | `4000` | Maximum completion tokens per request. |
| `openAI.localCache` | `true` | Cache responses locally to avoid duplicate API calls. |
| `openAI.cacheExpiry` | `604800000` | Cache TTL in milliseconds (default: 7 days). |
| `openAI.reasoningEffort` | `null` | Optional reasoning effort parameter (`"low"`, `"medium"`, `"high"`). `null` omits the parameter. |

### Anthropic

| Key | Default | Description |
|-----|---------|-------------|
| `anthropic.model` | `"claude-opus-4-6"` | Model name sent to the Anthropic API. |
| `anthropic.maxTokens` | `4000` | Maximum completion tokens per request. |
| `anthropic.localCache` | `true` | Cache responses locally. |
| `anthropic.cacheExpiry` | `604800000` | Cache TTL in milliseconds (default: 7 days). |

### Google Gemini

| Key | Default | Description |
|-----|---------|-------------|
| `gemini.model` | `"gemini-3.1-pro-preview"` | Model name sent to the Google Generative AI API. |
| `gemini.maxTokens` | `8000` | Maximum completion tokens per request. |
| `gemini.localCache` | `true` | Cache responses locally. |
| `gemini.cacheExpiry` | `604800000` | Cache TTL in milliseconds (default: 7 days). |

### Mistral

| Key | Default | Description |
|-----|---------|-------------|
| `mistral.ocrModel` | `"mistral-ocr-latest"` | Model used for OCR image processing. |
| `mistral.chatModel` | `"mistral-large-latest"` | Model used for structured data extraction chat calls. |
| `mistral.maxTokens` | `8000` | Maximum tokens per request. |

---

## Cost Tracking

All pricing is per million tokens (USD). Used by the cost estimator and session cap.

### `costs.openai`

| Model | Input | Output | Cached Input |
|-------|-------|--------|--------------|
| `gpt-5.4` | $2.50 | $20.00 | $1.25 |

### `costs.anthropic`

| Model | Input | Output | Cache Write | Cache Read |
|-------|-------|--------|-------------|------------|
| `claude-opus-4-6` | $5.00 | $25.00 | $6.25 | $0.50 |
| `claude-sonnet-4-5` | $3.00 | $15.00 | $3.75 | $0.30 |
| `claude-haiku-4-5` | $1.00 | $5.00 | $1.25 | $0.10 |

### `costs.gemini`

| Model | Input | Output |
|-------|-------|--------|
| `gemini-3.1-pro-preview` | $1.25 | $5.00 |
| `gemini-2.5-flash` | $0.075 | $0.30 |

### `costs.mistral`

| Model | Input | Output | Per Page |
|-------|-------|--------|----------|
| `mistral-large-latest` | $2.00 | $6.00 | $0.002 |

### Session cap

| Key | Default | Description |
|-----|---------|-------------|
| `costs.maxCostPerSession` | `5.00` | Maximum USD spend per processing session. When reached, IngestService logs a warning and stops queuing new files. |

---

## Retry Logic

Two-layer retry system. See `src/utils/retryHelper.js` for implementation.

| Key | Default | Description |
|-----|---------|-------------|
| `retry.maxProviderRetries` | `3` | Number of times to retry a failed provider API call (rate limits, timeouts, parse errors). |
| `retry.validationRetries` | `1` | Number of times to retry the full processImage + validateAndConvert cycle when schema validation fails. |
| `retry.baseDelayMs` | `1000` | Base delay before first retry, in milliseconds. |
| `retry.maxDelayMs` | `10000` | Maximum delay cap for exponential backoff, in milliseconds. |
| `retry.jitterMs` | `1000` | Random jitter added to backoff delays to prevent thundering herd. |

---

## Confidence Scoring

Controls automatic review flagging. See `src/utils/prompts/BasePrompt.js`.

| Key | Default | Description |
|-----|---------|-------------|
| `confidence.enabled` | `true` | Enable per-field confidence scoring. |
| `confidence.autoAcceptThreshold` | `0.90` | Records with all fields ≥0.90 are accepted without review. |
| `confidence.reviewThreshold` | `0.70` | Records with any field between 0.70–0.90 are flagged `needs_review = 1`. |
| `confidence.rejectThreshold` | `0.50` | Fields below 0.50 are treated as unreliable (cross-field validators cap to ≤0.40). |

---

## Feature Flags

| Key | Default | Description |
|-----|---------|-------------|
| `audit.enabled` | `true` | Enable full LLM prompt/response audit logging to the `llm_audit_log` table. Set `false` as an emergency kill switch. |
| `schemaConstrained.enabled` | `false` | Enable schema-constrained output mode (experimental). |
| `activeLearning.enabled` | `true` | Enable active learning feedback loop. |
| `activeLearning.disagreeThreshold` | `0.5` | Confidence threshold below which a record is flagged for active learning review. |
| `activeLearning.langfuseEnabled` | `false` | Send active learning events to Langfuse (requires `LANGFUSE_*` env vars). |

---

## Domain-Specific Settings

### Burial Register

| Key | Default | Description |
|-----|---------|-------------|
| `burialRegister.outputDir` | `"./data/burial_register"` | Output directory for per-volume burial register CSV files. |
| `burialRegister.volumeId` | `"vol1"` | Default volume ID used when none is specified. |
| `burialRegister.csv.includeHeaders` | `true` | Include column headers in exported CSV files. |
| `burialRegister.csv.encoding` | `"utf-8"` | Character encoding for CSV output. |
| `burialRegister.apiTimeout` | `90000` | Timeout in milliseconds for burial register API calls (90 seconds — longer because pages contain many entries). |

### Grave Record Cards

| Key | Default | Description |
|-----|---------|-------------|
| `graveCard.stitchPadding` | `20` | Pixel padding applied when stitching multi-panel grave card images. |
| `graveCard.minResolution` | `1000` | Minimum image resolution (px) for grave card processing. |
| `graveCard.maxExportInterments` | `8` | Maximum number of interment records included in a single grave card export. |

### Monument Cropping

| Key | Default | Description |
|-----|---------|-------------|
| `monumentCropping.enabled` | `false` | Auto-crop monument images to isolate the inscription area. |
| `monumentCropping.minWidth` | `400` | Minimum crop width in pixels. |
| `monumentCropping.minHeight` | `400` | Minimum crop height in pixels. |
| `monumentCropping.aspectRatioMin` | `0.5` | Minimum allowed aspect ratio for cropped region (width/height). |
| `monumentCropping.aspectRatioMax` | `2.0` | Maximum allowed aspect ratio for cropped region. |

---

## Local Development

These settings only apply when `environment` is `"development"`.

| Key | Default | Description |
|-----|---------|-------------|
| `local.autoLaunchBrowser` | `true` | Automatically open the app in a browser on server start. |
| `local.defaultBrowser` | `"chrome"` | Browser to launch (`"chrome"`, `"firefox"`, `"safari"`). |
| `local.saveLastSession` | `true` | Persist session state between restarts. |
| `local.autoBackup` | `true` | Automatically back up the database on startup. |

---

## Environment Variables

Set in `.env` (local) or via deployment platform (production). These override the corresponding config.json values.

| Variable | Required | Description |
|----------|----------|-------------|
| `PORT` | No | Server port. Overrides `config.port`. |
| `OPENAI_API_KEY` | For OpenAI provider | OpenAI API key (`sk-proj-...`). |
| `ANTHROPIC_API_KEY` | For Anthropic provider | Anthropic API key (`sk-ant-...`). |
| `GEMINI_API_KEY` | For Gemini provider | Google Generative AI API key. |
| `MISTRAL_API_KEY` | For Mistral provider | Mistral AI API key. |

At least one provider key must be set. The app starts without keys but all processing will fail until a valid key is configured. Key status is visible at `GET /api/providers/status`.
