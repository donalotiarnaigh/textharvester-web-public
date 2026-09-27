# LLM Audit Logging E2E Test Guide

## Overview

The automated E2E test (`scripts/test-audit-logging-e2e.js`) verifies that the LLM audit logging feature (Issue #133) is working correctly by:

1. Processing actual sample images from the project
2. Verifying audit log entries are created in the database
3. Validating that full prompts and responses are captured
4. Testing cross-references between tables
5. Generating a detailed test report

## Quick Start

### Prerequisites

API keys must be available in `.env` file:
```bash
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GEMINI_API_KEY=AIza... (optional)
```

### Run the Test

```bash
npm run test:audit-e2e
```

The test will:
1. Initialize a fresh database with all tables
2. Find sample images in `sample_data/source_sets/`
3. Process 1 memorial image using OpenAI API
4. Query the `llm_audit_log` table
5. Generate a report showing all captured data

### Expected Output

```
✅ VALIDATION CHECKS:
   • Audit log table exists: ✓
   • Entries created: ✓
   • processing_id captured: ✓
   • Full system_prompt stored: ✓
   • Full user_prompt stored: ✓
   • Raw response captured: ✓
   • Token counts recorded: ✓
   • Response times tracked: ✓
```

## Test Output Details

The report shows:

**Processing Summary**
- Number of files processed
- Source type and provider used
- Processing status

**Audit Log Entries**
- Number of entries captured
- Provider and model used
- Prompt sizes (bytes)
- Response size (before JSON parsing)
- Token usage (input/output)
- Response time (milliseconds)

**Cross-References**
- Verification that audit entries match memorials table
- processing_id correlation

**Sample Content**
- First 100 chars of system prompt
- First 100 chars of user prompt
- Sample JSON response (first 5 keys)

## Manual Verification

After running the test, inspect the database directly:

```bash
# View all audit log entries
sqlite3 data/memorials.db "SELECT * FROM llm_audit_log;"

# View latest entry details
sqlite3 data/memorials.db "
  SELECT
    processing_id,
    provider,
    model,
    LENGTH(system_prompt) as system_prompt_bytes,
    LENGTH(user_prompt) as user_prompt_bytes,
    LENGTH(raw_response) as response_bytes,
    input_tokens,
    output_tokens,
    response_time_ms,
    status
  FROM llm_audit_log
  ORDER BY id DESC
  LIMIT 5;
"

# Export to JSON for eval dataset building
sqlite3 -json data/memorials.db "
  SELECT
    processing_id,
    provider,
    model,
    system_prompt,
    user_prompt,
    raw_response,
    input_tokens,
    output_tokens
  FROM llm_audit_log
  WHERE status = 'success'
  ORDER BY timestamp DESC;
" > audit_export.json
```

## What Gets Logged

Each audit log entry captures:

| Field | Example | Use Case |
|-------|---------|----------|
| `processing_id` | `54ef89e8-b816-49c4-8f6e-5936f1a6186e` | Cross-reference with memorials/burial_registers/grave_cards |
| `provider` | `openai` | Provider identification |
| `model` | `gpt-5.4` | Model version tracking |
| `system_prompt` | `You are an expert OCR system...` | Full rendered system prompt |
| `user_prompt` | `You're an expert in OCR...` | Complete user instructions |
| `raw_response` | `{"memorial_number": {...}}` | **Raw response BEFORE JSON parsing** (key for debugging) |
| `input_tokens` | `3488` | Input token usage |
| `output_tokens` | `113` | Output token usage |
| `response_time_ms` | `2669` | API latency tracking |
| `status` | `success` or `error` | Completion status |
| `error_message` | `Rate limit exceeded` | Error details if failed |
| `timestamp` | `2026-03-09 21:19:44` | When the API call was made |

## Key Features

✅ **Full Prompt Capture**
- Complete system prompt (including instructions)
- Complete user prompt (including image analysis instructions)
- No truncation or sampling

✅ **Raw Response Storage**
- Response stored BEFORE JSON parsing
- Enables debugging of JSON parse failures
- Supports validation of model output

✅ **Always-On Logging**
- No sampling (unlike operational logs which sample at 5%)
- Controlled by `config.audit.enabled` (default: true)
- Fire-and-forget pattern (errors logged but don't affect processing)

✅ **Correlation IDs**
- Every entry keyed with `processing_id` from #127
- Enables cross-referencing with memorials/burial_registers/grave_cards
- Supports building gold-standard eval datasets (#121)

## Troubleshooting

### "No API keys found"
Set environment variables before running:
```bash
export OPENAI_API_KEY="sk-..."
npm run test:audit-e2e
```

Or use with specific provider:
```bash
OPENAI_API_KEY="sk-..." npm run test:audit-e2e
```

### "No sample images found"
Verify sample data exists:
```bash
ls sample_data/source_sets/memorials/
ls sample_data/source_sets/burial_registers/
ls sample_data/source_sets/monument_photos/
```

### "llm_audit_log table not created"
Initialize database manually:
```bash
node bin/textharvester system init-db
```

Verify table was created:
```bash
sqlite3 data/memorials.db ".tables" | grep llm_audit_log
```

## For Eval Dataset Building (Issue #121)

Export audit log entries to build gold-standard dataset:

```bash
# Export all successful entries as JSON
sqlite3 -json data/memorials.db "
  SELECT
    processing_id,
    provider,
    model,
    system_prompt,
    user_prompt,
    raw_response,
    input_tokens,
    output_tokens,
    response_time_ms
  FROM llm_audit_log
  WHERE status = 'success'
  ORDER BY timestamp DESC;
" > eval/fixtures/raw-model-outputs.json

# Now hand-label the raw_response field and save to eval/gold-standard/
```

This provides the complete data needed for building evaluation metrics.

## Related Issues

- **#127** - Request Correlation ID (processing_id)
- **#121** - Extraction Accuracy Measurement (uses audit log for training data)
- **#130** - Token & Cost Tracking (audit log also tracks token usage)

## See Also

- `src/utils/llmAuditLog.js` - Core audit logging implementation
- `src/services/SystemService.js` - Database initialization
- `config.json` - `audit.enabled` configuration
- `issues.md` - Issue #133 status
