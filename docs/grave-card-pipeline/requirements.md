# Requirements Document: Grave Record Card Processing Pipeline

## Introduction

This feature introduces an automated pipeline designed to process digitized grave record cards. Specifically, it handles two-sided PDFs of grave cards (typically found in `.../data/raw/St Lukes Church_Grave Cards_Section A`), stitching them into single composite images for holistic AI analysis. The system uses a Large Language Model (LLM) to extract structured genealogical data into a custom JSON schema. A critical aspect is the strict enforcement of transcription conventions—specifically using dashes (`-`) for illegible characters and pipes (`|`) for line breaks—to ensure consistency with historical archiving standards and existing `MonumentPhotoOCR` pipelines.

## Requirements

### Requirement 1: PDF Processing and Image Stitching

**User Story:** As a researcher, I want to upload a two-sided grave record card PDF, so that it is converted into a single, vertically stitched image for full-context analysis.

#### Acceptance Criteria

**Happy Path:**
1. WHEN a valid PDF containing exactly 2 pages is processed, THEN the system SHALL convert both pages into high-resolution images.
2. IF the conversion is successful, THEN the system SHALL stitch the front page image above the back page image to create a single composite image.
3. WHEN the stitching is complete, THEN the system SHALL save the resulting image to the designated output path.

**Unhappy Path:**
4. WHEN a non-PDF file or a corrupted PDF is provided, THEN the system SHALL return an "Invalid File" error and stop processing.
5. WHEN a PDF with fewer or more than 2 pages is encountered, THEN the system SHALL return a "Page Count Error" indicating 2 pages are required.
6. IF the image conversion fails, THEN the system SHALL log a specific "Conversion Failed" error.
7. IF the resulting image resolution is below the minimum threshold (e.g., < 1000px width), THEN the system SHALL log a "Low Quality" warning.

### Requirement 2: AI-Powered Data Extraction (Specific Schema)

**User Story:** As a data archivist, I want the system to extract structured genealogical fields into a specific JSON schema with `card_metadata`, `location`, `grave`, `interments`, `inscription`, and `sketch` sections.

#### Acceptance Criteria

**Happy Path:**
1. WHEN the stitched image is processed, THEN the system SHALL return a JSON object strictly adhering to the provided `Grave Record Card` schema.
2. IF the card contains multiple deceased persons, THEN the system SHALL extract them into the `interments` array, each with `sequence_number`, `name`, `date_of_death`, `date_of_burial`, and `age_at_death`.
3. IF the card contains a back-side inscription, THEN the system SHALL extract it into the `inscription` object (`text`, `scripture_or_quote_refs`).
4. WHEN extracting `location`, `grave`, and `sketch` data, THEN the system SHALL populate fields like `section`, `grave_number`, `description_of_grave`, and `dimensions` according to strict type definitions (e.g., `dimensions.length_ft` as number).

**Unhappy Path:**
4. WHEN a required field (like `location.section`) is missing, THEN the system SHALL flag the record as invalid or request manual validation.
5. IF the AI service is unreachable, THEN the system SHALL retry with exponential backoff before failing.
6. WHEN the JSON response cannot be parsed, THEN the system SHALL capture the raw output and flag a "Parsing Error".

### Requirement 3: Transcription Convention Enforcement

**User Story:** As a quality controller, I want the system to strictly follow defined transcription rules (dashes for illegible text, pipes for line breaks), so that the digital records accurately reflect the physical artifacts and comply with existing project standards.

#### Acceptance Criteria

**Happy Path:**
1. WHEN the AI encounters illegible or damaged characters, THEN the system SHALL represent them as dashes (`-`) in the output string (e.g., `19--`).
2. IF a text field spans multiple lines implementation-wise (especially `inscription.text`), THEN the system SHALL replace physical line breaks with pipe characters (`|`).
3. WHEN constructing the prompt, THEN the system SHALL explicitly forbid usage of brackets like `[?]`, `[illegible]` or newlines `\n` in text fields, matching `MonumentPhotoOCRPrompt` standards.

**Unhappy Path:**
4. WHEN extracted text contains raw newline characters, THEN the system SHALL reject or normalize them to pipes.
5. IF the AI hallucinates guess content instead of dashes, THEN the system SHALL be prompted to prefer partial transcription over guessing.
6. WHEN validation runs, THEN the system SHALL warn if forbidden characters (e.g., `[`, `]`) are detected in text fields.

### Requirement 4: Schema Validation and Logic

**User Story:** As a developer, I want specific logical constraints enforced (e.g., vacant graves have no interments) so that the data integrity is maintained.

#### Acceptance Criteria

**Happy Path:**
1. WHEN the `grave.status` is "vacant", THEN the system SHALL enforce that the `interments` array is empty or max length 0 (as per schema `if/then` logic).
2. IF `dimensions` are provided, THEN the system SHALL validate that `length_ft`, `width_ft`, `height_ft` are numbers, or capture `raw_text` if unstructured.
3. WHEN `date_of_death` or `date_of_burial` are extracted, THEN the system SHALL use `partial_date` structure (`iso` for strict YYYY-MM-DD, `raw_text` for other formats).

**Unhappy Path:**
4. WHEN `grave.status` is "vacant" but `interments` contains data, THEN the system SHALL flag a "Logical Consistency Error".
5. IF `grave_number` is missing from `location`, THEN the system SHALL fail validation as it is a required field.
6. WHEN date formats are invalid in `iso` fields, THEN the system SHALL fallback to `raw_text` or flag an error.
