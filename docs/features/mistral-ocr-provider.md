# Mistral OCR Provider

## Overview

TextHarvester supports Mistral as an AI provider for OCR processing, using a **two-step pipeline** that combines Mistral's dedicated OCR model with its chat model for structured data extraction.

This makes Mistral particularly well-suited for handwritten historical documents such as burial registers, where a specialist text-extraction model outperforms general-purpose vision chat models.

## How It Works

```
Image (base64)
    │
    ▼
Step 1: POST /v1/ocr  (mistral-ocr-latest)
    │   Returns markdown text per page
    ▼
Step 2: POST /v1/chat/completions  (mistral-large-latest)
          System: structured prompt template
          User: OCR markdown + extraction instructions
    │   Returns structured JSON
    ▼
{ content: parsedJSON, usage: { input_tokens, output_tokens, pages_processed } }
```

Unlike OpenAI, Anthropic, and Gemini — which accept image + prompt in a single call — Mistral's OCR endpoint is a pure text-extraction service. The chat step then structures that text into the JSON schema expected by TextHarvester.

## Configuration

### Environment Variables

```bash
MISTRAL_API_KEY=your_api_key_here
AI_PROVIDER=mistral   # optional — sets default provider
```

### `config.json`

```json
{
  "mistral": {
    "ocrModel": "mistral-ocr-latest",
    "chatModel": "mistral-large-latest",
    "maxTokens": 8000
  },
  "costs": {
    "mistral": {
      "mistral-large-latest": {
        "inputPerMToken": 2.00,
        "outputPerMToken": 6.00,
        "perPageCost": 0.002
      }
    }
  }
}
```

Both `ocrModel` and `chatModel` are overridable without code changes.

## CLI Usage

```bash
# Single file
node src/cli/index.js ingest path/to/image.jpg --provider mistral --source-type memorial

# Burial register
node src/cli/index.js ingest path/to/register.jpg --provider mistral --source-type burial_register

# Batch
node src/cli/index.js ingest "sample_data/**/*.jpg" --provider mistral --source-type memorial

# Check costs
node src/cli/index.js system cost
```

## Cost Tracking

Mistral costs combine two components:

| Component | Rate |
|-----------|------|
| Chat input tokens | $2.00 / M tokens |
| Chat output tokens | $6.00 / M tokens |
| OCR pages processed | $0.002 / page |

The `pages_processed` field in the usage object drives the per-page cost. The `system cost` CLI command aggregates all three components.

## Supported Source Types

Mistral works with all TextHarvester source types:

- `memorial` — gravestone inscription OCR
- `burial_register` — handwritten register pages (recommended use case)
- `monument_photo` — monument/structure photos
- `grave_record_card` — grave record cards
- `typographic_analysis` — detailed typographic and iconographic analysis
- `monument_classification` — DEBS monument classification

## Performance Characteristics

- **OCR step**: Typically fast (< 5s per image)
- **Chat step**: Variable depending on response complexity (10–60s)
- **Burial registers**: ~45s per page for multi-entry structured extraction
- **Retry behaviour**: The chat step is wrapped in `withRetry` (up to 3 retries with exponential backoff); OCR failures are hard errors (not retried)

## Prompt Templates

Each source type has a Mistral-specific system prompt. The chat prompt follows the same messages-array format used by Anthropic and Gemini:

```javascript
{
  systemPrompt: 'You are an expert OCR system specializing in heritage and genealogical data extraction.',
  messages: [
    { role: 'user', content: userPrompt }
  ]
}
```

## Error Handling

| Error | Behaviour |
|-------|-----------|
| Missing `MISTRAL_API_KEY` | `FatalError` thrown at startup / config validation |
| OCR API failure | Hard error, not retried |
| Chat API failure | Retried up to `config.retry.maxProviderRetries` times |
| JSON parse failure | Validation retry with format-enforcement preamble |
| Auth error (401/403) | Classified as `FatalError`, stops processing |

## Audit Logging

All Mistral requests are written to the `llm_audit_log` table with:
- `provider: 'mistral'`
- `model: 'mistral-large-latest'` (the chat model)
- Full system and user prompts
- Raw response text (before JSON parsing)
- Token counts and response time
- `pages_processed` is recorded in the usage object but not in the audit log schema

## Technical Notes

- The `@mistralai/mistralai` SDK v2.x is ESM-only. Jest compatibility is maintained via a manual CJS stub at `__mocks__/@mistralai/mistralai.js`.
- Usage fields from the Mistral SDK are camelCase (`promptTokens`, `completionTokens`) and are normalised to `input_tokens` / `output_tokens` in the provider.
- The OCR endpoint accepts `data:image/jpeg;base64,...` image URLs — all images are treated as JPEG regardless of original format (consistent with the existing pipeline).

---

*Implemented in PR #235, resolving issue #234.*
