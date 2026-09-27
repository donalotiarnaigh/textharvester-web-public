# Design Document: Grave Record Card Processing Pipeline

## Overview

The proposed solution automates the digitization of grave record cards by processing 2-sided PDFs, stitching them into single images, and using an LLM (Claude/GPT-4) to extract structured genealogical data. The design explicitly integrates with the existing `textharvester-web` architecture, leveraging the `PromptFactory`, `BaseProvider`, and `fileProcessing` utilities, while introducing specific storage and export handlers for the complex nested data.

## Architecture

### High-Level Architecture

The architecture follows the established `processFile` workflow in `textharvester-web`, extending it with a specialized pre-processing step for PDF stitching and a dedicated storage layer.

```mermaid
graph TB
    A[Input PDF] --> B[fileProcessing.js]
    B --> C{Source Type?}
    C -->|grave_record_card| D[GraveCardProcessor]
    D -->|Convert & Stitch| E[Stitched Image Buffer]
    C -->|monument/burial| F[Existing Logic]
    E --> G[PromptFactory]
    G -->|Get GraveCardPrompt| H[Provider (OpenAI/Anthropic)]
    H -->|Process Image| I[Raw JSON]
    I --> J[GraveCardPrompt.validateAndConvert]
    J -->|Validated Data| K[GraveCardStorage]
    K -->|Insert| L[(SQLite DB)]
    K -->|Export| M[Wide-Format CSV]
```

### Component Architecture

1.  **GraveCardProcessor** (New): Extends/Refactors `pdfConverter.js` to handle 2-page stitching logic specifically for grave cards.
2.  **GraveCardPrompt** (New): A new prompt template class extending `BasePrompt` to handle the specific schema and logic for grave cards, registered via `PromptFactory`.
3.  **GraveCardStorage** (New): Handles persistence of the complex nested data into SQLite and generates QA-ready flattened CSVs.
4.  **fileProcessing.js** (Existing): Updated to handle the new `grave_record_card` `source_type` and route to the new processor.

## Components and Interfaces

### Core Interfaces

(See `requirements.md` for the full `GraveRecord` schema).

The pipeline will utilize the existing data flow where `processFile` returns a `Promise<Object>` containing the validated data.

### Component 1: GraveCardProcessor (Evolution of pdfConverter)

Located in `src/utils/imageProcessing/graveCardProcessor.js`.

**Key Responsibilities:**
-   Accept a PDF path.
-   Validate page count (strictly 2 pages).
-   Convert pages to images (using `pdftocairo` like existing `pdfConverter`).
-   Stitch images vertically using `sharp` (consistent with `monumentCropper.js` usage).
-   Return a single base64 string or buffer for the AI provider.

### Component 2: GraveCardPrompt (Template)

Located in `src/utils/prompts/templates/GraveCardPrompt.js`.
Must extend `BasePrompt`.

**Key Responsibilities:**
-   Define the `GraveRecord` schema in `this.fields` (mapped to existing field types where possible).
-   `getPromptText`: Returns the strict prompt with transcription rules (`-` and `|`) and schema definition.
-   `validateAndConvert`: Implements the specific validation logic (e.g., vacant grave check).

### Component 3: GraveCardStorage & Data Export

Located in `src/utils/graveCardStorage.js`.

**Key Responsibilities:**
-   `storeGraveCard(data)`: Inserts record into `grave_cards` table.
-   `exportCardsToCsv()`: Flattens the nested `data_json` into a "Wide Format" CSV for manual QA.

**Database Schema (`grave_cards`):**
A hybrid approach storing high-level metadata in columns for indexing, and the full structure in JSON for fidelity.
-   `id` (INTEGER PRIMARY KEY)
-   `file_name` (TEXT NOT NULL)
-   `section` (TEXT)
-   `grave_number` (TEXT)
-   `data_json` (TEXT) - Stores the complete `GraveRecord` object to preserve structure.
-   `processed_date` (DATETIME)
-   `ai_provider` (TEXT)

**Export Strategy: Wide-Format CSV (Card-Centric)**
To facilitate manual QA, the JSON data will be flattened into individual columns.
-   **One row per card** (matches source file).
-   **Flat Fields**: `location_section`, `grave_status`, `dimensions_length_ft`, `inscription_text`, etc.
-   **Dynamic Columns for Interments**: The exporter will create numbered sets of columns for interments to ensure no data is hidden in JSON strings.
    -   `interment_1_name`, `interment_1_date`, `interment_1_age`
    -   `interment_2_name`, `interment_2_date`, `interment_2_age`
    -   ...up to the max found or a configured limit (e.g., 6).
-   **Result**: A fully tabular CSV where a QA person can easily correct a specific date or name in its own cell.

### Component 4: Integration in fileProcessing.js

**Key Responsibilities:**
-   Detect `source_type: 'grave_record_card'`.
-   Branch logic to call `GraveCardProcessor`.
-   Instantiate `GraveCardPrompt`.
-   Call `GraveCardStorage.storeGraveCard`.

## Data Models

**Configuration Updates (`config.json`):**
```json
{
  "graveCard": {
    "stitchPadding": 20,
    "minResolution": 1000,
    "maxExportInterments": 8
  }
}
```

## Error Handling

Reuses `src/utils/errorTypes.js`:
-   `ProcessingError`: For standard failures.
-   New `ValidationError` subtype if needed.

## Testing Strategy

1.  **Unit Tests**:
    -   `GraveCardPrompt.test.js`: Extensive JSON validation testing.
    -   `GraveCardProcessor.test.js`: Mocked `exec` calls for PDF conversion.
    -   `graveCardStorage.test.js`: Verify that `exportCardsToCsv` correctly flattens nested JSON into the expected wide-column format.
2.  **Integration**:
    -   `fileProcessing.test.js` update: Add a test case for `source_type: 'grave_record_card'`.
3.  **Data**: Use standard existing `__tests__/fixtures` pattern.

## Alignment with Existing Conventions
-   **Prompt Factory**: We will register the new prompt in `PromptFactory.js`.
-   **BasePrompt Extension**: We inherit all standard logging and validation utilities.
-   **File Processing**: We hook into the existing `processFile` function.
-   **Storage**: We introduce a dedicated `graveCardStorage.js` mirroring the pattern of `burialRegisterStorage.js` but adding the flattening logic for export.
