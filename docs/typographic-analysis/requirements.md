# Typographic Analysis Feature — Requirements Document

## Introduction

This feature adds a new **"Typographic Analysis"** source type to TextHarvester that produces comprehensive transcriptions with detailed typography, iconography, and stone condition analysis. Unlike existing OCR prompts that focus on extracting structured data fields (names, dates, memorial numbers), this feature captures the complete character of historical gravestone inscriptions for scholarly and archival purposes.

The feature is inspired by a client's "Gravestone OCR V2.3" prompt used with Gemini, which emphasizes:
- **Exact text reproduction** following genealogical database standards
- **Typographic fidelity** (preserving long-s "ſ", thorn "þ", superscripts, original case)
- **Mechanical description** of carved elements (geometric construction, not interpretive labels)
- **Botanical precision** (using neutral terms like "cordate" instead of "heart-shaped")

This feature integrates with the existing prompt template system (`src/utils/prompts/`) and database layer, adding new JSON-blob columns to store the rich analysis data while maintaining backward compatibility with existing workflows.

---

## Requirements

### Requirement 1: Typographic Analysis Prompt Template

**User Story:** As a genealogical researcher, I want to upload a monument photograph and receive a comprehensive typographic and iconographic analysis, so that I can document the complete character of the inscription beyond just the extracted text.

#### Acceptance Criteria

**Happy Path:**
1. WHEN a user uploads an image with `source_type=typographic_analysis` THEN the system SHALL process the image using the TypographicAnalysisPrompt template and return JSON containing both structured fields and analysis sections.
2. IF the monument contains historical typography (long-s, thorn, superscripts) THEN the system SHALL preserve these characters in the `transcription_raw` field and document their presence in `typography_analysis`.
3. WHEN the AI provider returns a valid response THEN the system SHALL validate the response against the TypographicAnalysis schema and store all fields including `stone_condition`, `typography_analysis`, `iconography`, and `structural_observations`.

**Unhappy Path:**
4. WHEN the AI provider returns malformed JSON THEN the system SHALL throw a `ProcessingError` with type `validation_error` and a descriptive message.
5. WHEN the image contains no readable text or carvings THEN the system SHALL throw a `ProcessingError` with type `empty_monument` indicating the monument could not be analyzed.
6. IF the AI provider is unavailable or times out THEN the system SHALL propagate the error with appropriate context for retry or user notification.
7. IF the `source_type` is `typographic_analysis` but the provider is not supported THEN the system SHALL throw an error listing supported providers.

---

### Requirement 2: Line-for-Line Transcription Fidelity

**User Story:** As an archivist, I want the transcription output to exactly match the number of horizontal text rows on the monument, so that my records preserve the original layout and line structure.

#### Acceptance Criteria

**Happy Path:**
1. WHEN the monument has multiple lines of text THEN the system SHALL produce a `transcription_raw` field with `|` separators matching the exact number of visible text rows.
2. IF the monument uses historical spelling or archaic characters THEN the system SHALL preserve the original spelling without correction in `transcription_raw`.
3. WHEN illegible characters are present THEN the system SHALL use single dashes (`-`) for each illegible character, maintaining character-count accuracy.

**Unhappy Path:**
4. WHEN the `transcription_raw` field is empty but other analysis fields are populated THEN the system SHALL throw a `ProcessingError` with type `validation_error` because transcription is mandatory.
5. WHEN the AI returns newline characters (`\n`) instead of pipe separators (`|`) THEN the system SHALL normalize them to `|` during validation.
6. IF the AI uses notation like `[?]`, `[illegible]`, or `[WEATHERED]` THEN the system SHALL reject the response and request re-processing with correct notation (dashes only).
7. IF the transcription contains more `|` separators than visible text rows THEN the system SHALL log a warning but accept the response (AI may detect rows the user doesn't see).

---

### Requirement 3: Iconography and Ornamentation Analysis

**User Story:** As a heritage researcher, I want the system to document carved decorative elements using precise mechanical and botanical terminology, so that I can study regional carving styles and motif patterns.

#### Acceptance Criteria

**Happy Path:**
1. WHEN the monument contains carved decorative elements THEN the system SHALL return an `iconography` object with `visual_motifs`, `geometric_elements`, `border_foliage`, and `style_technique` fields populated.
2. IF the monument contains compass-drawn elements (daisy wheels/hexfoils) THEN the system SHALL identify them by construction ("interlocking arcs of a single radius") and set `daisy_wheels: true`.
3. WHEN describing botanical elements THEN the system SHALL use neutral botanical terms (e.g., "cordate leaves", "undulating vine") rather than interpretive labels (e.g., "heart-shaped", "ivy").

**Unhappy Path:**
4. WHEN no decorative elements are present on the monument THEN the system SHALL return an `iconography` object with empty arrays and `null` values rather than omitting the field entirely.
5. WHEN the AI uses interpretive labels (e.g., "flower", "rosette") instead of geometric descriptions THEN the system SHALL accept the response but log a quality warning for potential prompt refinement.
6. IF the `iconography` object is malformed (wrong types, missing required sub-fields) THEN the system SHALL throw a `ProcessingError` with specific field validation details.
7. IF `style_technique.period` contains an anachronistic value (e.g., "Medieval" for a clearly Victorian stone) THEN the system SHALL accept the response (AI judgment) but include the raw value for human review.

---

### Requirement 4: Database Storage and Retrieval

**User Story:** As a system administrator, I want the typographic analysis data stored in queryable database columns, so that researchers can search and filter monuments by typography characteristics or iconography patterns.

#### Acceptance Criteria

**Happy Path:**
1. WHEN a typographic analysis result is stored THEN the system SHALL persist `stone_condition`, `typography_analysis`, `iconography`, `structural_observations`, and `transcription_raw` as TEXT columns (JSON serialized for complex objects).
2. IF the database does not have the new columns THEN the migration script SHALL add them without affecting existing data or requiring a schema version change.
3. WHEN retrieving results via `/results-data` THEN the system SHALL deserialize JSON columns and include them in the API response.

**Unhappy Path:**
4. WHEN storing a record with `null` analysis fields THEN the system SHALL store `NULL` in the database rather than empty strings or empty JSON objects.
5. WHEN the JSON serialization of `typography_analysis` or `iconography` exceeds SQLite's practical text limit (~1GB) THEN the system SHALL throw a storage error (extremely unlikely but handled).
6. IF a database migration is interrupted THEN the system SHALL leave the database in a consistent state (columns either fully added or not at all).
7. IF the `source_type` column does not yet exist in older installations THEN the migration SHALL add it with a default value of `NULL` for backward compatibility.

---

### Requirement 5: Backward Compatibility

**User Story:** As an existing TextHarvester user, I want my current workflows (memorial OCR, burial registers, grave cards) to continue working unchanged after this feature is added, so that I don't have to modify my existing processes.

#### Acceptance Criteria

**Happy Path:**
1. WHEN a user uploads an image with `source_type=memorial` or `source_type=monument_photo` THEN the system SHALL use the existing prompt templates and storage logic without any changes.
2. IF the new database columns are present but a non-typographic-analysis record is stored THEN the system SHALL leave those columns as `NULL`.
3. WHEN the `/results-data` endpoint returns records THEN the system SHALL include the new fields only when they are non-null, maintaining API response consistency.

**Unhappy Path:**
4. WHEN an older version of the codebase (without the new columns) receives a database with the new columns THEN the system SHALL ignore unknown columns and function normally.
5. WHEN the `TypographicAnalysisPrompt` class is not registered in the prompt factory but a user requests it THEN the system SHALL return a clear error message listing available source types.
6. IF a third-party integration sends a request with an unknown `source_type` THEN the system SHALL return a 400 error with a list of valid source types.
7. IF the migration script is run twice THEN the system SHALL detect existing columns and skip re-adding them (idempotent migration).

---
