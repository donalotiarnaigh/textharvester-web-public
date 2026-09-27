# Prompt Caching

## Overview

TextHarvester uses provider-native prompt caching to reduce API costs when processing batches of files. Static content (system prompts, schemas, instruction text) is marked for caching so subsequent calls within a session pay a discounted rate rather than full input token pricing.

Caching is transparent — no configuration is required and no user-facing behaviour changes.

---

## Provider Behaviour

### Anthropic (claude-sonnet-4-5, claude-haiku-4-5)

Anthropic caching is **explicit**: the client must mark a content block with `cache_control: { type: "ephemeral" }` to instruct the API to cache everything up to and including that block.

**What is cached**: The combined prefix of system prompt + tool/schema definition + user instruction text. This prefix is approximately 1,500 tokens, comfortably above Anthropic's 1,024-token minimum.

**Cache placement**: The `cache_control` marker sits on the user text content block (the instruction text), immediately before the image in the message. The image is excluded from the cache because it changes with every file.

```
[system prompt]          ← static, ~33 tokens
[tool definition/schema] ← static, ~750 tokens
[user instruction text]  ← static, ~750 tokens  ← cache_control marker here
[image]                  ← dynamic, not cached
```

**Cost model**:
- First call in a session: cache write tokens charged at **125%** of the normal input rate (`cacheWritePerMToken`)
- Subsequent calls (cache hit): cached tokens charged at **10%** of normal input rate (`cacheReadPerMToken`)
- Net savings on a 10-file batch (Anthropic): ~81% reduction in system/schema/instruction token costs

**TTL**: 5 minutes, extended by each API call that hits the cache. Processing a large batch within a single session will consistently hit the cache; a gap of more than 5 minutes between files causes the next call to pay a full cache write.

**Model support**: `claude-opus-4-6` does **not** support prompt caching. Use `claude-sonnet-4-5` or `claude-haiku-4-5` to benefit from caching. The config default is `claude-opus-4-6` which will report `cache_creation_input_tokens: 0` in the audit log — this is expected, not a bug.

**Verification**: The `llm_audit_log` table records `cache_creation_tokens` and `cache_read_tokens` per call. A successful cache hit shows `cache_creation_tokens: 0` and `cache_read_tokens: ~1776` on the second and subsequent files in a batch.

---

### OpenAI (gpt-5.4)

OpenAI caching is **automatic**: no explicit markers are needed. The API caches the longest repeated prefix of any request that is ≥1,024 tokens, at a 50% discount.

**Cache key includes the image bytes.** For vision requests, the entire message (including the image content block) is part of the cache key. This means:

- **Cache hits occur on retries**: if the same file is reprocessed (e.g. after a validation failure), the second call hits the cache because both the prompt and the image are identical.
- **Cache hits do not occur across different files**: each document has a different image, giving a different cache key, so the first call for any new file is always a cache miss.

**Cost model**: `cachedInputPerMToken` in `config.json` sets the effective rate for cached tokens (currently $1.25/MTok vs $2.50/MTok full rate). `calculateCost()` applies this rate to `cache_read_input_tokens` extracted from `usage.prompt_tokens_details.cached_tokens`.

**Practical impact**: For normal single-pass processing, OpenAI caching provides no cost reduction. The benefit materialises only when files are retried (validation failures, rate limit retries), where the second attempt on the same image will show cached tokens in the audit log.

---

### Gemini (gemini-3.1-pro-preview)

Gemini prompt caching is **not implemented**. Gemini requires explicit `CachedContent` objects created via `GoogleAICacheManager` with a 2,048-token minimum per cached block. This is a stateful server-side resource (with its own lifecycle, creation cost, and cleanup requirements) and was out of scope for this feature.

The Gemini provider processes every call at full input token rates. There is no `cache_read_input_tokens` field in Gemini audit log entries.

---

## Cost Accounting

`calculateCost(usage, costConfig)` in `processingHelpers.js` handles three token categories:

| Token type | Field | Config key | Fallback |
|---|---|---|---|
| Regular input | `input_tokens` | `inputPerMToken` | — |
| Cache write | `cache_creation_input_tokens` | `cacheWritePerMToken` | `inputPerMToken` |
| Cache read | `cache_read_input_tokens` | `cacheReadPerMToken` or `cachedInputPerMToken` | `inputPerMToken` |
| Output | `output_tokens` | `outputPerMToken` | — |

Providers that do not return cache token fields default to 0, so the fallback to `inputPerMToken` is only used if a cache-specific rate is missing from `config.json`.

---

## Audit Log

The `llm_audit_log` table includes two cache columns added via migration:

| Column | Type | Description |
|---|---|---|
| `cache_creation_tokens` | INTEGER DEFAULT 0 | Tokens written to cache on this call (Anthropic only) |
| `cache_read_tokens` | INTEGER DEFAULT 0 | Tokens read from cache on this call (Anthropic + OpenAI) |

These are populated by all three providers. Non-zero `cache_read_tokens` on an Anthropic call confirms a cache hit.

> **Note for CLI users**: The `llmAuditLog.initialize()` migration only runs when the server starts (`server.js`). If you use the CLI without ever starting the server, the cache columns may not exist in an older `data/memorials.db`. Run the server once, or apply the migration manually:
> ```sql
> ALTER TABLE llm_audit_log ADD COLUMN cache_creation_tokens INTEGER DEFAULT 0;
> ALTER TABLE llm_audit_log ADD COLUMN cache_read_tokens INTEGER DEFAULT 0;
> ```

---

## Configuration

Relevant `config.json` sections:

```json
"anthropic": {
  "model": "claude-opus-4-6"
},
"costs": {
  "openai": {
    "gpt-5.4": { "inputPerMToken": 2.50, "outputPerMToken": 20.00, "cachedInputPerMToken": 1.25 }
  },
  "anthropic": {
    "claude-opus-4-6":   { "inputPerMToken": 5.00, "outputPerMToken": 25.00, "cacheWritePerMToken": 6.25, "cacheReadPerMToken": 0.50 },
    "claude-sonnet-4-5": { "inputPerMToken": 3.00, "outputPerMToken": 15.00, "cacheWritePerMToken": 3.75, "cacheReadPerMToken": 0.30 },
    "claude-haiku-4-5":  { "inputPerMToken": 1.00, "outputPerMToken":  5.00, "cacheWritePerMToken": 1.25, "cacheReadPerMToken": 0.10 }
  }
}
```

To enable Anthropic caching, change `anthropic.model` to `claude-sonnet-4-5` or `claude-haiku-4-5`.
