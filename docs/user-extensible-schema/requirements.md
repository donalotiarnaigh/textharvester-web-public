# Requirements Document: User-Extensible Schema Generation

## Introduction
This feature enables users to extend the tool's capabilities by defining their own data extraction schemas through example files. Instead of relying on hardcoded schemas, users can provide examples (e.g., images of documents) which the system analyzes to generate a JSON schema. Once generated, the system automatically provisions a corresponding database table. This schema is then used to dynamically prompt the LLM for structured data extraction from new files, with results stored in the newly created table. This allows for rapid digitization of custom document types without engineering intervention.

## Requirements

### Requirement 1: Example-Based Schema Generation

**User Story:** As a user, I want to upload example files of a new document type, so that the system can automatically generate a JSON schema and database table for me.

#### Acceptance Criteria

**Happy Path:**
1. WHEN the user provides 1-5 example image files of a specific document type THEN the system SHALL analyze the visual structure and text to identify common data fields.
2. WHEN analysis is complete THEN the system SHALL generate a valid JSON schema defining the fields, data types, and structure.
3. IF the generated schema is valid THEN the system SHALL expose a candidate schema for user review.
4. WHEN the user approves the candidate schema THEN the system SHALL provision the database table with the defined columns.

**Unhappy Path:**
4. WHEN provided files are unreadable, corrupted, or unsupported formats THEN the system SHALL return an "invalid file format" error and halt processing.
5. WHEN the system cannot identify any consistent fields across the provided examples THEN the system SHALL return an "ambiguous structure" error.
6. IF the generated schema contains field names that are SQL reserved keywords THEN the system SHALL sanitize or alias them to ensure valid table creation.
7. IF a table with the proposed name already exists THEN the system SHALL return a "name conflict" error or prompt for a unique name.

### Requirement 2: Dynamic Extraction using Generated Schema

**User Story:** As a user, I want to use the generated schema to extract data from new files, so that I can digitize my custom documents without writing specific code.

#### Acceptance Criteria

**Happy Path:**
1. WHEN a user initiates processing for a file specifying a Custom Schema ID THEN the system SHALL retrieve the specific JSON schema associated with that ID.
2. IF the schema is valid THEN the system SHALL dynamically construct a prompt that includes the schema description to guide the LLM.
3. WHEN the LLM returns the extraction result THEN the system SHALL validate that the JSON output conforms strictly to the generated schema.

**Unhappy Path:**
4. WHEN a User specifies a Schema ID that does not exist THEN the system SHALL return a "Schema not found" error.
5. WHEN the LLM output is valid JSON but violates the schema constraints (e.g. missing required field) THEN the system SHALL flag the record as "validation failed" and log the discrepancy.
6. IF the prompt size with the injected schema exceeds the model's context window THEN the system SHALL fail gracefully with a "schema too complex" error.
7. IF the LLM fails to return JSON (e.g. returns plain text) THEN the system SHALL trigger a retry or mark the file as "extraction failed".

### Requirement 3: Automatic Data Persistence

**User Story:** As a user, I want extracted data to be automatically saved to the dedicated table, so that I can query and export it later.

#### Acceptance Criteria

**Happy Path:**
1. WHEN valid data is extracted and validated against the schema THEN the system SHALL construct a dynamic SQL INSERT statement for the target table.
2. IF the record contains standard metadata (e.g., source filename, processing timestamp) THEN the system SHALL store these in standard system columns present in every custom table.
3. WHEN the data is successfully inserted THEN the system SHALL return the new Record ID.

**Unhappy Path:**
4. WHEN the target database table has been deleted or modified manually since creation THEN the system SHALL return a "target table missing/invalid" error.
5. IF data type mismatches occur (e.g. trying to insert text into an integer column) THEN the system SHALL catch the database error and flag the record.
6. WHEN a database connection failure occurs during insertion THEN the system SHALL retry the operation with exponential backoff.
7. IF the extracted data contains characters incompatible with the database implementation (e.g., null bytes) THEN the system SHALL sanitize the input before insertion.

### Requirement 4: Non-Functional & Observability

**User Story:** As a developer/admin, I need the system to be robust and observable so that I can debug issues and ensure stability.

#### Acceptance Criteria

1. **Schema Limits**: The system SHALL enforce a maximum of 50 columns per custom schema to prevent SQLite performance degradation.
2. **Concurrency**: Ingestion into dynamic tables SHALL handle database locking gracefully (e.g., utilizing retry logic or WAL mode) to support sequential processing.
3. **Observability**: Validation failures keying off the dynamic schema SHALL be logged with specific context: `SchemaID`, `FieldCausingError`, and `RawValue`.
