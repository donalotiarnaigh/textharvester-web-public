# Work Breakdown Structure: Burial Register Pilot

## Overview

This WBS outlines the sequential implementation plan for extending textharvester-web to support the St Luke's Burial Register pilot. Tasks are organized in dependency order and should be completed sequentially.

**Target:** Process ~210 pages from Volume 1 with GPT and Claude, generating two CSV files for manual fusion.

---

## Phase 1: Foundation - Prompt Template and Schema

### 1.1 Create BurialRegisterPrompt Class
**File:** `src/utils/prompts/templates/BurialRegisterPrompt.js`

**Tasks:**
- [ ] Create class extending `BasePrompt`
- [ ] Define page-level fields (volume_id, page_number, headers)
- [ ] Define entry-level fields (entry_no_raw, name_raw, abode_raw, etc.)
- [ ] Implement `getPromptText()` with extraction instructions
- [ ] Implement `getProviderPrompt(provider)` for OpenAI and Anthropic
- [ ] Implement `validateAndConvertPage(pageDataRaw)` - validates page JSON structure
- [ ] Implement `validateAndConvertEntry(entry)` - validates flat entry object
- [ ] Handle uncertainty_flags as array of strings

**Acceptance Criteria:**
- Prompt class extends BasePrompt correctly
- Both providers return properly formatted prompts
- Page validation checks required fields (volume_id, page_number, entries array)
- Entry validation checks entry-level fields
- Uncertainty flags handled as arrays

**Dependencies:** None

---

### 1.2 Register Prompt Template
**File:** `src/utils/prompts/templates/providerTemplates.js`

**Tasks:**
- [ ] Import `BurialRegisterPrompt`
- [ ] Create prompt instances for both providers (similar to `memorialOCRTemplates`)
- [ ] Add `'burialRegister'` case to `getPrompt()` function
- [ ] Test prompt retrieval: `getPrompt('openai', 'burialRegister', 'latest')`
- [ ] Test prompt retrieval: `getPrompt('anthropic', 'burialRegister', 'latest')`

**Acceptance Criteria:**
- `getPrompt('openai', 'burialRegister')` returns BurialRegisterPrompt instance
- `getPrompt('anthropic', 'burialRegister')` returns BurialRegisterPrompt instance
- Prompt instances have correct version and fields

**Dependencies:** 1.1

---

### 1.3 Test Prompt with Sample Data
**Tasks:**
- [ ] Create test file with sample page JSON structure
- [ ] Test `validateAndConvertPage()` with valid page JSON
- [ ] Test `validateAndConvertPage()` with invalid page JSON (missing fields)
- [ ] Test `validateAndConvertEntry()` with valid entry
- [ ] Test `validateAndConvertEntry()` with invalid entry
- [ ] Verify error messages are clear

**Acceptance Criteria:**
- Valid page JSON passes validation
- Invalid page JSON throws descriptive errors
- Valid entries pass validation
- Invalid entries throw descriptive errors

**Dependencies:** 1.1, 1.2

---

## Phase 2: Flattening Logic

### 2.1 Create Flattener Module
**File:** `src/utils/burialRegisterFlattener.js`

**Tasks:**
- [ ] Implement `generateEntryId(volumeId, pageNumber, rowIndex)` 
  - Format: `vol1_p001_r003`
  - Zero-pad page and row numbers
- [ ] Implement `injectPageMetadata(entry, pageData, metadata)`
  - Inject volume_id, page_number, row_index_on_page
  - Inject header metadata (parish_header_raw, county_header_raw, year_header_raw)
  - Inject processing metadata (provider, model, filePath)
- [ ] Implement `flattenPageToEntries(pageData, metadata)`
  - Iterate through `pageData.entries` array
  - Generate entry_id for each entry
  - Inject page metadata into each entry
  - Return array of flat entry objects

**Acceptance Criteria:**
- Entry IDs generated correctly: `vol1_p001_r003`
- Each entry has all required fields (core + headers + metadata)
- Flattened entries are flat objects (no nesting)
- All entries from page are included

**Dependencies:** 1.1

---

### 2.2 Test Flattening Logic
**Tasks:**
- [ ] Create test with sample page JSON (3 entries)
- [ ] Verify flattening produces 3 flat entry objects
- [ ] Verify each entry has correct entry_id
- [ ] Verify page headers are injected into each entry
- [ ] Verify processing metadata is injected
- [ ] Test edge cases (empty entries array, missing headers)

**Acceptance Criteria:**
- Flattening produces correct number of entries
- All entries have required fields populated
- Entry IDs are unique and correctly formatted
- Page metadata appears in all entries

**Dependencies:** 2.1

---

## Phase 3: Database Schema and Storage

### 3.1 Create Database Migration Script
**File:** `scripts/migrate-add-burial-register-table.js`

**Tasks:**
- [ ] Create migration script following existing pattern
- [ ] Define `burial_register_entries` table schema
  - Core fields: volume_id, page_number, row_index_on_page, entry_id
  - Entry fields: entry_no_raw, name_raw, abode_raw, burial_date_raw, age_raw, officiant_raw, marginalia_raw, extra_notes_raw, row_ocr_raw
  - Header metadata: parish_header_raw, county_header_raw, year_header_raw
  - Model metadata: model_name, model_run_id, uncertainty_flags (JSON string)
  - Processing metadata: file_name, ai_provider, prompt_template, prompt_version, processed_date
- [ ] Add UNIQUE constraint: `(volume_id, page_number, row_index_on_page, ai_provider)`
- [ ] Create composite index: `idx_burial_provider_volume_page`
- [ ] Create additional indexes: `idx_burial_entry_id`, `idx_burial_volume_page`
- [ ] Test migration script runs successfully

**Acceptance Criteria:**
- Table created with all required columns
- Constraints and indexes created correctly
- Migration script can be run multiple times (idempotent)
- No data loss from existing tables

**Dependencies:** None (can run independently)

---

### 3.2 Create Storage Functions
**File:** `src/utils/burialRegisterStorage.js`

**Tasks:**
- [ ] Implement `storePageJSON(pageData, provider, volumeId, pageNumber)`
  - Create directory structure: `data/burial_register/{volumeId}/pages/{provider}/`
  - Write page JSON to: `page_{NNN:03d}.json`
  - Return path to stored file
- [ ] Implement `storeBurialRegisterEntry(entry)`
  - Use existing database connection pattern
  - Insert into `burial_register_entries` table
  - Handle uncertainty_flags as JSON string (JSON.stringify)
  - Map `fileName` (JS) to `file_name` (DB)
  - Return inserted record ID
- [ ] Export both functions

**Acceptance Criteria:**
- Page JSON stored to correct directory structure
- File names formatted correctly: `page_001.json`, `page_002.json`
- Entries inserted into database successfully
- Uncertainty flags stored as JSON strings
- File name mapping works correctly

**Dependencies:** 3.1

---

### 3.3 Test Storage Functions
**Tasks:**
- [ ] Test `storePageJSON()` with sample page data
- [ ] Verify file is created in correct location
- [ ] Verify file content matches input
- [ ] Test `storeBurialRegisterEntry()` with sample entry
- [ ] Verify entry appears in database
- [ ] Verify uncertainty_flags stored as JSON string
- [ ] Test multiple entries from same page

**Acceptance Criteria:**
- Page JSON files created correctly
- Entries stored in database with all fields
- Uncertainty flags can be retrieved and parsed
- Multiple entries from same page stored correctly

**Dependencies:** 3.2

---

## Phase 4: File Processing Integration

### 4.1 Modify fileProcessing.js
**File:** `src/utils/fileProcessing.js`

**Tasks:**
- [ ] Import `burialRegisterFlattener` and `burialRegisterStorage`
- [ ] Add conditional branch: `if (sourceType === 'burial_register')`
- [ ] In burial register branch:
  - Get prompt: `getPrompt(providerName, 'burialRegister', promptVersion)`
  - Call provider: `provider.processImage(...)`
  - Validate page JSON: `promptInstance.validateAndConvertPage(pageDataRaw)`
  - Flatten: `flattenPageToEntries(pageData, {...})`
  - Store page JSON: `storePageJSON(pageData, providerName, ...)`
  - Loop through entries:
    - Validate entry: `promptInstance.validateAndConvertEntry(entry)`
    - Add metadata (fileName, ai_provider, model_name, etc.)
    - Store entry: `storeBurialRegisterEntry(validatedEntry)`
  - Return `{ entries: processedEntries, pageData }`
- [ ] Keep existing memorial flow unchanged

**Acceptance Criteria:**
- Burial register pages processed correctly
- Memorial pages still work (no regression)
- Page JSON validated before flattening
- All entries from page stored in database
- Page JSON stored as reference artifact
- Return value includes both entries and pageData

**Dependencies:** 1.2, 2.1, 3.2

---

### 4.2 Update Upload Handler
**File:** `src/controllers/uploadHandler.js`

**Tasks:**
- [ ] Add `'burial_register'` to valid source types (if source type validation exists)
- [ ] Extract `volume_id` from request body (default to 'vol1')
- [ ] Set output directory based on volume_id: `data/burial_register/{volumeId}/`
- [ ] Pass `source_type: 'burial_register'` to file queue
- [ ] Pass `promptTemplate: 'burialRegister'` to file queue
- [ ] Ensure volume_id is available in file metadata

**Acceptance Criteria:**
- Upload handler accepts burial_register source type
- Volume ID extracted and passed through
- Prompt template set to 'burialRegister'
- File queue receives correct metadata

**Dependencies:** 1.2

---

### 4.3 Update File Queue (if needed)
**File:** `src/utils/fileQueue.js`

**Tasks:**
- [ ] Review current file metadata structure
- [ ] Ensure `promptTemplate` and `source_type` are passed to `processFile()`
- [ ] Update `processFile()` call to include new metadata
- [ ] Verify queue passes all required options

**Acceptance Criteria:**
- File queue passes promptTemplate to processFile
- File queue passes source_type to processFile
- Existing functionality unchanged

**Dependencies:** 4.1, 4.2

---

### 4.4 Test End-to-End Single Provider Flow
**Tasks:**
- [ ] Upload single burial register page image
- [ ] Process with GPT provider
- [ ] Verify page JSON stored correctly
- [ ] Verify all entries stored in database
- [ ] Verify return value structure
- [ ] Test with Claude provider
- [ ] Verify no errors in processing

**Acceptance Criteria:**
- Single page processes successfully
- Page JSON file created
- All entries in database
- Both providers work correctly

**Dependencies:** 4.1, 4.2, 4.3

---

## Phase 5: CSV Export

### 5.1 Create CSV Export Script
**File:** `scripts/export-burial-register-csv.js`

**Tasks:**
- [ ] Accept command-line arguments: `{provider} {volumeId}`
- [ ] Connect to database
- [ ] Query: `SELECT * FROM burial_register_entries WHERE ai_provider = ? AND volume_id = ? ORDER BY volume_id, page_number, row_index_on_page`
- [ ] Use existing `jsonToCsv()` from `dataConversion.js`
- [ ] Write to file: `data/burial_register/{volumeId}/csv/burials_{volumeId}_{provider}.csv`
- [ ] Handle uncertainty_flags (JSON string) in CSV output
- [ ] Add proper error handling and logging

**Acceptance Criteria:**
- Script accepts provider and volumeId arguments
- CSV file generated with correct columns
- Rows ordered correctly (volume, page, row)
- Uncertainty flags appear as JSON strings in CSV
- File written to correct location

**Dependencies:** 3.1, 3.2

---

### 5.2 Test CSV Export
**Tasks:**
- [ ] Insert test entries into database (GPT and Claude)
- [ ] Run export script for GPT: `node scripts/export-burial-register-csv.js gpt vol1`
- [ ] Run export script for Claude: `node scripts/export-burial-register-csv.js claude vol1`
- [ ] Verify CSV files created
- [ ] Verify CSV column order matches pilot plan
- [ ] Verify all entries included
- [ ] Verify uncertainty_flags format in CSV

**Acceptance Criteria:**
- Both CSV files generated correctly
- Column order matches pilot plan schema
- All entries included
- CSV format is valid

**Dependencies:** 5.1

---

## Phase 6: Configuration

### 6.1 Update config.json
**File:** `config.json`

**Tasks:**
- [ ] Add `burialRegister` section:
  ```json
  {
    "burialRegister": {
      "outputDir": "./data/burial_register",
      "volumeId": "vol1",
      "csv": {
        "includeHeaders": true,
        "encoding": "utf-8"
      }
    }
  }
  ```
- [ ] Document environment variable override: `BURIAL_REGISTER_OUTPUT_DIR`
- [ ] Verify config is loaded correctly

**Acceptance Criteria:**
- Config section added
- Environment variable precedence documented
- Config accessible in code

**Dependencies:** None

---

## Phase 7: Integration Testing

### 7.1 Test Dual Provider Processing
**Tasks:**
- [ ] Upload same page twice (once with GPT, once with Claude)
- [ ] Verify both page JSON files created (separate directories)
- [ ] Verify both sets of entries in database
- [ ] Verify entries have same entry_id but different ai_provider
- [ ] Verify UNIQUE constraint works (can't insert duplicate)
- [ ] Run CSV export for both providers
- [ ] Verify both CSVs generated correctly

**Acceptance Criteria:**
- Same page can be processed with both providers
- Entries stored separately (different ai_provider)
- Entry IDs match across providers (for joining)
- Both CSVs generated successfully

**Dependencies:** 4.4, 5.1

---

### 7.2 Test Multi-Page Batch
**Tasks:**
- [ ] Upload 3-5 page images
- [ ] Process all pages with GPT
- [ ] Process all pages with Claude
- [ ] Verify all page JSON files created
- [ ] Verify all entries in database
- [ ] Verify CSV export includes all entries
- [ ] Verify correct ordering in CSV

**Acceptance Criteria:**
- Multiple pages process successfully
- All entries stored correctly
- CSV includes all entries in correct order
- No data loss or corruption

**Dependencies:** 7.1

---

### 7.3 Validate CSV Schema
**Tasks:**
- [ ] Compare CSV columns to pilot plan schema
- [ ] Verify all required fields present
- [ ] Verify column order matches pilot plan
- [ ] Verify data types match expectations
- [ ] Verify uncertainty_flags format
- [ ] Create sample CSV for review

**Acceptance Criteria:**
- CSV schema matches pilot plan exactly
- All fields from pilot plan present
- Column order correct
- Data format correct

**Dependencies:** 5.2

---

## Phase 8: Documentation and Cleanup

### 8.1 Update Documentation
**Tasks:**
- [ ] Document new prompt template in README
- [ ] Document CSV export script usage
- [ ] Document database schema changes
- [ ] Add examples of usage
- [ ] Update API documentation (if routes added)

**Acceptance Criteria:**
- Documentation complete and accurate
- Usage examples provided
- Schema documented

**Dependencies:** All previous phases

---

### 8.2 Code Review and Cleanup
**Tasks:**
- [ ] Review all new code for consistency
- [ ] Remove debug logging (or set to appropriate levels)
- [ ] Verify error handling is comprehensive
- [ ] Check for code duplication
- [ ] Ensure naming conventions consistent
- [ ] Add JSDoc comments where needed

**Acceptance Criteria:**
- Code follows project conventions
- Error handling complete
- Code is maintainable

**Dependencies:** All previous phases

---

## Phase 9: Pilot Preparation

### 9.1 Prepare Test Data
**Tasks:**
- [ ] Identify sample pages for testing
- [ ] Create expected output examples
- [ ] Document test scenarios
- [ ] Prepare validation checklist

**Acceptance Criteria:**
- Test data ready
- Validation criteria clear

**Dependencies:** 7.3

---

### 9.2 Pilot Run Preparation
**Tasks:**
- [ ] Verify all ~210 pages are accessible
- [ ] Set up processing environment
- [ ] Prepare monitoring/logging
- [ ] Create backup procedures
- [ ] Document pilot run steps

**Acceptance Criteria:**
- Environment ready for pilot
- Procedures documented
- Backup plan in place

**Dependencies:** 9.1

---

## Summary

**Total Phases:** 9  
**Estimated Complexity:** Medium-High  
**Key Dependencies:**
- Prompt template must be complete before integration
- Database schema must exist before storage functions
- Flattening must work before file processing integration
- Storage must work before CSV export

**Critical Path:**
1. Prompt Template (Phase 1)
2. Flattening Logic (Phase 2)
3. Database Schema (Phase 3)
4. File Processing Integration (Phase 4)
5. CSV Export (Phase 5)
6. Testing (Phase 7)

**Notes:**
- Phases 1-5 are sequential and must be completed in order
- Phase 6 (Configuration) can be done in parallel with other phases
- Phase 7 (Testing) requires all previous phases complete
- Phases 8-9 are final polish and preparation

---

**Last Updated:** 2025-01-XX  
**Status:** Draft - Ready for Implementation

