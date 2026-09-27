# Retrospective: Grave Record Card Pipeline

**Date:** 2025-12-14
**Scope:** Design vs. Implementation Gap Analysis

## Overview
The Grave Record Card pipeline was successfully delivered with 100% coverage and 0% data loss. However, the implementation phase revealed several critical gaps in the initial Design and Requirements documentation. This document serves as a guide to prevent similar issues when implementing future record types.

## Critical Gaps & Lessons Learned

### 1. Frontend Concurrency & Queue Management
*   **The Issue:** The upload queue stalled after 5 files during the production run.
*   **Root Cause:** The `Dropzone.js` configuration set `parallelUploads: 5`. The design assumed "Blocking" uploads (like standard PDFs where conversion happens during the request), which naturally throttled the queue. However, the optimized Grave Card pipeline is "Non-Blocking" (instant 200 OK), causing the browser to fire 5 requests instantly and hit the limit without a trigger to process the rest of the queue.
*   **Missed in Docs:** The docs focused on "Upload Validation" logic but completely ignored **Queue Management Strategy** and concurrency behavior for high-speed uploads.
*   **Recommendation:** For future record types:
    *   Explicitly define the expected "Blocking" behavior of the upload endpoint.
    *   Ensure `fileUpload.js` has recursive queue-draining logic (e.g., calling `processQueue()` inside the `complete` event) handling both fast and slow endpoints.

### 2. Error Taxonomy & Retry Logic
*   **The Issue:** Files with invalid page counts (>2) entered an infinite retry loop instead of failing.
*   **Root Cause:** The `fileQueue` logic treated all errors as "transient" (network glitches) by default. The design docs specified *what* to validate (Page Count) but not *how* the pipeline should react to failure (Abort vs. Retry).
*   **Missed in Docs:** Lack of an **Error Taxonomy**. No distinction between "Validation Errors" (Fatal content issues) and "System Errors" (Transient outages).
*   **Recommendation:** Implement specific Error definitions for new types:
    *   **Fatal Errors (`fatal: true`):** Content validation failure (Wrong page count, corrupt file). **Action:** Mark as failed, do not retry.
    *   **Transient Errors:** timeout, 500 error. **Action:** Retry with backoff.

### 3. Identity Architecture (File vs. Content)
*   **The Issue:** Strategies relying on `grave_number` for uniqueness failed in practice.
*   **Reality:** AI extracted numbers are unreliable keys (ranges like "26+27", typos, or completely missing). In the production run, only 11% of extracted numbers matched the file number strictly.
*   **Missed in Docs:** `design.md` listed `grave_number` as a core identity column, implying it could be a unique constraint.
*   **Recommendation:** Enforce **Filename-as-ID** (Stable Identifier) for all digitization projects. AI-extracted data should always be treated as mutable attributes, never as database Primary/Unique keys.

### 4. Dynamic Data & Export Limits
*   **The Issue:** Hard-coded assumptions about list sizes (e.g., "Max 6 interments") were broken by real data (cards with 9+ interments), requiring last-minute refactoring to dynamic recursion.
*   **Missed in Docs:** Design preferred static configuration (`maxExportInterments: 8`) over dynamic handling.
*   **Recommendation:** Avoid hard-coded limits for open-ended data lists (Interments, Scriptures). Design the `export` logic to simpler "Flatten dynamically based on the max count in the current batch".

## Action Plan for Next Record Type

Before starting the next pipeline:
1.  [ ] **Audit Frontend Queue:** Verification test with 50+ dummy files to ensure queue draining works.
2.  [ ] **Define Fatal Errors:** List exactly which validation failures should trigger an immediate abort.
3.  [ ] **Confirm Identity Key:** Ensure the database schema uses a stable external ID (Filename/UUID) as the primary key.
4.  [ ] **Stress Test Schema:** Check if "List" fields (like Interments) can expand indefinitely in the export logic.
