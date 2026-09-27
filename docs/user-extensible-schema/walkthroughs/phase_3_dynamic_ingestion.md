# Phase 3 Walkthrough: Dynamic Ingestion Pipeline

**Date:** 2025-12-28
**Feature:** User-Extensible Schema (UXS)

## Overview
Phase 3 focused on the runtime "engine" of the User-Extensible Schema feature. We implemented the `DynamicProcessor`, which allows the system to ingest files using user-defined schemas rather than hardcoded logic. This involved creating extensive tests, implementing the processor class, and integrating it into the core `IngestService`.

## Completed Tasks

### 3.1 Write Tests for `DynamicProcessor`
- **Goal:** Establish a robust test suite before implementation (TDD).
- **Outcome:**
  - Created `__tests__/utils/dynamicProcessing.test.js`.
  - Defined tests for "Happy Path" (valid schema/file), "Observability" (detailed validation logging), and "Unhappy Paths" (invalid IDs, DB failures).
  - Used mocks for `SchemaManager`, `db`, `logger`, and `modelProviders`.

### 3.2 Implement `DynamicProcessor`
- **Goal:** Implement the logic to process files using custom schemas.
- **Implementation:**
  - **Component:** `src/utils/dynamicProcessing.js`
  - **Logic:**
    1.  **Schema Retrieval:** Fetches schema definition via `SchemaManager`.
    2.  **Context Prep:** Loads and optimizes images (checking provider limits).
    3.  **LLM Interaction:** Uses the schema's `system_prompt` and `user_prompt_template`.
    4.  **Validation:** VALIDATES the LLM's JSON output against `json_schema` using **Ajv**.
    5.  **Dynamic Insertion:** constructs a safe SQL `INSERT` statement for the dynamic table.
  - **Dependencies:** Added `ajv` for robust JSON validation.

### 3.3 Integrate with `IngestService`
- **Goal:** Update the main ingestion pipeline to support dynamic routing.
- **Implementation:**
  - Modified `src/services/IngestService.js`.
  - Added logic to `processOne`: checks for `options.schemaId`.
  - If present, bypasses standard processing and delegates to `DynamicProcessor`.
  - If absent, falls back to legacy `processFile`.
- **Testing:** Updated `__tests__/services/IngestService.test.js` to verify routing logic.

## Verification
- **Unit Tests:**
  - `npm test __tests__/utils/dynamicProcessing.test.js` (4/4 passed)
  - `npm test __tests__/services/IngestService.test.js` (11/11 passed)
- **Regression:**
  - Ran full test suite (`npm test`). Result: **115 Suites Passed, 913 Tests Passed**.

## Next Steps
- **Phase 4:** CLI Integration (`src/cli/schema.js`) to expose this functionality to end users.
