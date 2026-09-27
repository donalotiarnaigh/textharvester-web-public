# Walkthrough: Phase 2 - Schema Generator

**Feature**: User-Extensible Schema  
**Status**: Completed  
**Date**: 2025-12-28

## Overview
Phase 2 implemented the `SchemaGenerator` service, which is responsible for analyzing example documents (via LLM) and producing strict, safe JSON Schemas for dynamic table creation. This component is the bridge between unstructured inputs (images/PDFs) and structured database tables.

## Implementation Details

### 1. `SchemaGenerator` Service
Located at `src/services/SchemaGenerator.js`.
- **System Prompt**: Centralized `SYSTEM_PROMPT` ensures consistent LLM behavior, optimized for token usage.
- **Sanitization**: Robust `_sanitizeName` method ensures all generated table and column names are SQL-safe (snake_case, no reserved keywords, no leading numbers).
- **Parsing**: Safely parses LLM JSON responses, handling errors and malformed outputs.

### 2. Testing Strategy
Located at `__tests__/services/SchemaGenerator.test.js`.
- **Happy Path**: Verifies that valid LLM responses result in correctly structured `SchemaDefinition` objects.
- **Security**: Explicitly tests SQL injection attempts (e.g., `DROP TABLE`) and ensures they are sanitized into safe strings (e.g., `custom_drop_table`).
- **Prompt Verification**: Ensures the correct system prompt is injected into the LLM call.
- **Error Handling**: Verifies behavior for invalid JSON and unstructured data.

## Verification Results

All tests passed successfully across three development tasks (2.1 - 2.3).

| Task | Description | Outcome |
| :--- | :--- | :--- |
| **2.1** | Write Tests | **RED** (Expected failure of new tests) |
| **2.2** | Implement Logic | **GREEN** (All functionality implemented & passed) |
| **2.3** | Refactor & Verify | **GREEN** (Prompt optimization verified) |

### Key Commands Run
```bash
npm test __tests__/services/SchemaGenerator.test.js
npm run lint src/services/SchemaGenerator.js
```

## Next Steps
Proceed to **Phase 3: Dynamic Ingestion Pipeline**, which will use this generator to process files dynamically based on their assigned schema.
