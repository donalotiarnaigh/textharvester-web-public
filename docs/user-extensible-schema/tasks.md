# Implementation Plan: User-Extensible Schema

- [x] 1. Phase 1: Foundation (Schema Management & Storage)
  - _Goal: Enable storage and retrieval of custom schema definitions and manage dynamic tables._
  - [x] 1.1a Write tests for `SchemaDDLGenerator` (Utility) (TDD: Red)
    - **Happy path**: Input valid JSON schema -> Output correct SQL CREATE TABLE string. Includes standard columns.
    - **Unhappy path**: Invalid types, reserved SQL keywords in names (test sanitization logic).
    - _Requirements: 1.3, 3.4, 4.1_

  - [x] 1.1b Write tests for `SchemaManager` (Service) (TDD: Red)
    - **Happy path**: Create valid schema (calls DDL generator), retrieve by ID, support for versioning.
    - **Unhappy path**: Duplicate name handling, database transaction rollback on DDL failure.
    - _Requirements: 1.1, 1.3_
  
  - [x] 1.2 Implement `SchemaManager` & Database Updates
    - Create `custom_schemas` table in `src/utils/database.js`.
    - Implement `createSchema(def)`, `getSchema(id)`, and `listSchemas()` in `src/services/SchemaManager.js`.
    - Implement DDL execution logic to create dynamic tables (e.g., `CREATE TABLE custom_xyz...`).
    - _Requirements: 1.3, 3.4_
  
  - [x] 1.3 Refactor & Verify
    - Ensure tests pass (Green).
    - Ensure database connection safety (transactions where possible).
    - _Requirements: 3.6_

- [ ] 2. Phase 2: Schema Generator (LLM Integration)
  - _Goal: Analyze example files and generate valid JSON schemas._
  - [x] 2.1 Write tests for `SchemaGenerator` (TDD: Red)
    - **Happy path**: Mock LLM response -> returns structured `SchemaDefinition`.
    - **Security**: Test "malicious" field names (e.g., `drop_table`, `User--`) are sanitized safely to prevent injection.
    - **Unhappy path**: Malformed LLM response -> retry logic/error; Ambiguous structure -> error.
    - _Requirements: 1.1, 1.2, 4.2_
  
  - [x] 2.2 Implement `SchemaGenerator`
    - Implement `src/services/SchemaGenerator.js`.
    - Add methods to construct the "Analysis Prompt" (sending image to LLM).
    - Implement parsing logic to convert LLM JSON to standard JSON Schema.
    - Implement field name sanitization (SQL safe names).
    - _Requirements: 1.2, 1.3_

  - [x] 2.3 Refactor & Verify
    - Ensure tests pass (Green).
    - Optimize system prompt for token usage (Cost Management consideration).
    - _Requirements: 4.1_

- [ ] 3. Phase 3: Dynamic Ingestion Pipeline
  - _Goal: Update ingestion to support "Dynamic Mode" routing._
  - [x] 3.1 Write tests for `DynamicProcessor` + Observability (TDD: Red)
    - **Happy path**: Valid `schemaId` + file -> correct Prompt construction -> Valid SQL Insert.
    - **Observability**: Verify logs contain `SchemaID`, `FieldCausingError`, `RawValue` when validation fails.
    - **Unhappy path**: Invalid `schemaId` -> Error; LLM output mismatch -> Validation Error flag; SQL insertion failure (type mismatch).
    - _Requirements: 2.1, 2.2, 3.1, 3.5, 4.3_

  - [x] 3.2 Implement `DynamicProcessor` <!-- id: 3.2 -->
    - [x] Implement `processFileWithSchema`
    - [x] Integrate with `SchemaManager`
    - [x] Ensure 3.1 tests pass
    - Implement validation logic using `ajv` or similar against the stored JSON schema.
    - Implement dynamic INSERT query builder.
    - _Requirements: 2.1, 3.1_
    
  - [x] 3.3 Integrate with `IngestService` <!-- id: 3.3 -->
    - [x] Modify `src/services/IngestService.js` to check for `options.schemaId`.
    - [x] If present, route to `DynamicProcessor` instead of hardcoded flows.
    - _Requirements: 2.1_

- [ ] 4. Phase 4: CLI Integration
  - _Goal: Expose new functionality via command line._
  - [x] 4.1 Write tests for CLI commands (TDD: Red)
    - Test `th schema propose` args parsing.
    - Test `th ingest --schema` flag handling.
    - _Requirements: 1.1, 2.1_

  - [x] 4.2 Implement `src/cli/schema.js`
    - Implement `propose` command (calls Generator).
    - Implement `list` command (calls Manager).
    - Register new commands in `bin/textharvester`.
    - _Requirements: 1.1, 2.1_

- [ ] 5. Phase 5: API Layer (for future GUI)
  - _Goal: Expose endpoints for the frontend wizard._
  - [x] 5.1 Write tests for API Endpoints (TDD: Red)
    - **Happy path**: `POST /api/schemas/propose` returns analysis; `POST /api/schemas` persists it.
    - **Unhappy path**: Invalid payloads, missing files.
    - _Requirements: 1.1, 1.2_
  
  - [x] 5.2 Implement Routes in `src/routes/api.js`
    - Add schema management endpoints.
    - Wire up to `SchemaManager` and `SchemaGenerator`.
    - _Requirements: 1.1_

- [ ] 6. Phase 6: Frontend Implementation (Vanilla JS)
  - _Goal: Implement the "Schema Builder" wizard and management UI._
  - [x] 6.1 Implement Schema Management Pages
    - [x] Create `public/schemas.html`: Table listing custom schemas (ID, Name, Date).
    - [x] Create `public/js/modules/schemas/list.js`: Logic to fetch and render schemas.
    - [x] Add "Schemas" link to main navigation.
    - _Requirements: 1.1_
    
  - [x] 6.2 Implement "New Schema" Wizard
    - [x] Create `public/schema-wizard.html` and `public/js/modules/schemas/wizard.js`:
      - **Step 1**: Multi-file upload component (Dropzone).
      - **Step 2**: Progress indicator (polling/streaming analysis status).
      - **Step 3**: Schema Editor (Form to rename fields, change types, add/remove fields).
    - _Requirements: 1.1, 1.2_
    
  - [x] 6.3 Integrate Frontend with API
    - [x] Connect Wizard logic to `POST /api/schemas`.
    - [x] Handle success/error states (using existing UI utilities).
    - _Requirements: 1.2_

  - [x] 6.4 Update "Harvest" Page
    - [x] Update `index.html` (or relevant harvest UI) to fetch dynamic schemas from `GET /api/schemas`.
    - [x] When a custom schema is selected, pass `schemaId` to the ingest payload.
    - _Requirements: 2.1_

- [ ] 7. Phase 7: Verification & Cleanup
  - [x] 7.1 End-to-End Integration Test
    - [x] Create a mock document or use a sample file
- [x] Run `th schema propose`
- [x] Save the schema
- [x] Run `th ingest --schema <id>`
- [x] Verify data in the new SQLite table (Verified with script and CSV export).
    - _Requirements: 1.1, 2.1, 3.1_
  
  - [x] 7.2 Documentation & Cleanup
    - [x] Create a verification walkthrough.
    - [x] Ensure all temp files are cleaned up.
    - _Requirements: Non-functional_
