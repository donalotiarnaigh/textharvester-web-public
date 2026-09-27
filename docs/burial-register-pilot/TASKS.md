# Burial Register Pilot - Task List

Sequential task list for implementing the burial register pilot extension. Complete tasks in order, checking off each item as you go.

---

## Phase 1: Foundation - Prompt Template and Schema

### 1.1 Create BurialRegisterPrompt Class (Split into 3 PRs)

**PR 1: Basic Structure (1.1.1-1.1.4)** - COMPLETE
- [x] **1.1.1** Create `src/utils/prompts/templates/BurialRegisterPrompt.js` class extending `BasePrompt`
- [x] **1.1.2** Define page-level fields (volume_id, page_number, headers) in BurialRegisterPrompt
- [x] **1.1.3** Define entry-level fields (entry_no_raw, name_raw, abode_raw, etc.) in BurialRegisterPrompt
- [x] **1.1.4** Implement `getPromptText()` method with extraction instructions

**PR 2: Provider Prompts (1.1.5-1.1.6)**
- [x] **1.1.5** Implement `getProviderPrompt(provider)` for OpenAI formatting
- [x] **1.1.6** Implement `getProviderPrompt(provider)` for Anthropic formatting

**PR 3: Validation Methods (1.1.7-1.1.9)**
- [x] **1.1.7** Implement `validateAndConvertPage(pageDataRaw)` for page JSON validation
- [x] **1.1.8** Implement `validateAndConvertEntry(entry)` for entry validation
- [x] **1.1.9** Handle uncertainty_flags as array of strings in validation

### 1.2 Register Prompt Template (Single PR: 1.2.1-1.2.6)
- [x] **1.2.1** Import `BurialRegisterPrompt` in `src/utils/prompts/templates/providerTemplates.js`
- [x] **1.2.2** Create prompt instances for OpenAI (similar to `memorialOCRTemplates`)
- [x] **1.2.3** Create prompt instances for Anthropic (similar to `memorialOCRTemplates`)
- [x] **1.2.4** Add `'burialRegister'` case to `getPrompt()` function in providerTemplates.js
- [x] **1.2.5** Test: `getPrompt('openai', 'burialRegister', 'latest')` returns correct instance
- [x] **1.2.6** Test: `getPrompt('anthropic', 'burialRegister', 'latest')` returns correct instance

### 1.3 Test Prompt with Sample Data (Single PR: 1.3.1-1.3.6)
- [x] **1.3.1** Create test file with sample page JSON structure
- [x] **1.3.2** Test `validateAndConvertPage()` with valid page JSON
- [x] **1.3.3** Test `validateAndConvertPage()` with invalid page JSON (missing fields)
- [x] **1.3.4** Test `validateAndConvertEntry()` with valid entry
- [x] **1.3.5** Test `validateAndConvertEntry()` with invalid entry
- [x] **1.3.6** Verify error messages are clear and descriptive

---

## Phase 2: Flattening Logic

### 2.1 Create Flattener Module (Single PR: 2.1.1-2.1.4)
- [x] **2.1.1** Create `src/utils/burialRegisterFlattener.js` module
- [x] **2.1.2** Implement `generateEntryId(volumeId, pageNumber, rowIndex)` function
  - Format: `vol1_p001_r003` with zero-padding
- [x] **2.1.3** Implement `injectPageMetadata(entry, pageData, metadata)` function
  - Inject volume_id, page_number, row_index_on_page
  - Inject header metadata (parish_header_raw, county_header_raw, year_header_raw)
  - Inject processing metadata (provider, model, filePath)
- [x] **2.1.4** Implement `flattenPageToEntries(pageData, metadata)` function
  - Iterate through `pageData.entries` array
  - Generate entry_id for each entry
  - Inject page metadata into each entry
  - Return array of flat entry objects

### 2.2 Test Flattening Logic (Single PR: 2.2.1-2.2.7)
- [x] **2.2.1** Create test with sample page JSON containing 3 entries
- [x] **2.2.2** Verify flattening produces exactly 3 flat entry objects
- [x] **2.2.3** Verify each entry has correct entry_id format
- [x] **2.2.4** Verify page headers are injected into each entry
- [x] **2.2.5** Verify processing metadata is injected into each entry
- [x] **2.2.6** Test edge case: empty entries array
- [x] **2.2.7** Test edge case: missing headers

---

## Phase 3: Database Schema and Storage

### 3.1 Create Database Migration Script (Single PR: 3.1.1-3.1.8)
- [x] **3.1.1** Create `scripts/migrate-add-burial-register-table.js` migration script
- [x] **3.1.2** Define `burial_register_entries` table schema with all required columns
  - Core fields: volume_id, page_number, row_index_on_page, entry_id
  - Entry fields: entry_no_raw, name_raw, abode_raw, burial_date_raw, age_raw, officiant_raw, marginalia_raw, extra_notes_raw, row_ocr_raw
  - Header metadata: parish_header_raw, county_header_raw, year_header_raw
  - Model metadata: model_name, model_run_id, uncertainty_flags (TEXT for JSON)
  - Processing metadata: file_name, ai_provider, prompt_template, prompt_version, processed_date
- [x] **3.1.3** Add UNIQUE constraint: `(volume_id, page_number, row_index_on_page, ai_provider)`
- [x] **3.1.4** Create composite index: `idx_burial_provider_volume_page`
- [x] **3.1.5** Create index: `idx_burial_entry_id`
- [x] **3.1.6** Create index: `idx_burial_volume_page`
- [x] **3.1.7** Test migration script runs successfully
- [x] **3.1.8** Verify migration is idempotent (can run multiple times)

### 3.2 Create Storage Functions (Single PR: 3.2.1-3.2.4)
- [x] **3.2.1** Create `src/utils/burialRegisterStorage.js` module
- [x] **3.2.2** Implement `storePageJSON(pageData, provider, volumeId, pageNumber)` function
  - Create directory: `data/burial_register/{volumeId}/pages/{provider}/`
  - Write file: `page_{NNN:03d}.json`
  - Return path to stored file
- [x] **3.2.3** Implement `storeBurialRegisterEntry(entry)` function
  - Use existing database connection pattern
  - Insert into `burial_register_entries` table
  - Handle uncertainty_flags as JSON string (JSON.stringify)
  - Map `fileName` (JS) to `file_name` (DB)
  - Return inserted record ID
- [x] **3.2.4** Export both functions from module

### 3.3 Test Storage Functions (Single PR: 3.3.1-3.3.7)
- [x] **3.3.1** Test `storePageJSON()` with sample page data
- [x] **3.3.2** Verify file created in correct directory structure
- [x] **3.3.3** Verify file content matches input JSON
- [x] **3.3.4** Test `storeBurialRegisterEntry()` with sample entry
- [x] **3.3.5** Verify entry appears in database with all fields
- [x] **3.3.6** Verify uncertainty_flags stored as JSON string
- [x] **3.3.7** Test storing multiple entries from same page

---

## Phase 4: File Processing Integration

### 4.1 Modify fileProcessing.js (Split into 3 PRs for reviewability)

**PR 1: Setup and Branch (4.1.1-4.1.3)**
- [x] **4.1.1** Import `burialRegisterFlattener` in `src/utils/fileProcessing.js`
- [x] **4.1.2** Import `burialRegisterStorage` in `src/utils/fileProcessing.js`
- [x] **4.1.3** Add conditional branch: `if (sourceType === 'burial_register')` in `processFile()`

**PR 2: Core Processing Flow (4.1.4-4.1.8)**
- [x] **4.1.4** In burial register branch: Get prompt using `getPrompt(providerName, 'burialRegister', promptVersion)`
- [x] **4.1.5** In burial register branch: Call provider `processImage()` to get page JSON
- [x] **4.1.6** In burial register branch: Validate page JSON with `validateAndConvertPage(pageDataRaw)`
- [x] **4.1.7** In burial register branch: Flatten with `flattenPageToEntries(pageData, {...})`
- [x] **4.1.8** In burial register branch: Store page JSON with `storePageJSON(...)`

**PR 3: Entry Processing and Regression (4.1.9-4.1.13)**
- [x] **4.1.9** In burial register branch: Loop through entries, validate each with `validateAndConvertEntry(entry)`
- [x] **4.1.10** In burial register branch: Add metadata to each entry (fileName, ai_provider, model_name, etc.)
- [x] **4.1.11** In burial register branch: Store each entry with `storeBurialRegisterEntry(validatedEntry)`
- [x] **4.1.12** In burial register branch: Return `{ entries: processedEntries, pageData }`
- [x] **4.1.13** Verify existing memorial flow still works (no regression)

### 4.2 Update Upload Handler (Single PR: 4.2.1-4.2.6)
- [x] **4.2.1** Add `'burial_register'` to valid source types in `src/controllers/uploadHandler.js`
- [x] **4.2.2** Extract `volume_id` from request body (default to 'vol1')
- [x] **4.2.3** Set output directory based on volume_id: `data/burial_register/{volumeId}/`
- [x] **4.2.4** Pass `source_type: 'burial_register'` to file queue
- [x] **4.2.5** Pass `promptTemplate: 'burialRegister'` to file queue
- [x] **4.2.6** Ensure volume_id is available in file metadata

### 4.3 Update File Queue (Single PR: 4.3.1-4.3.5)
- [x] **4.3.1** Review current file metadata structure in `src/utils/fileQueue.js`
- [x] **4.3.2** Ensure `promptTemplate` is passed to `processFile()` in fileQueue
- [x] **4.3.3** Ensure `source_type` is passed to `processFile()` in fileQueue
- [x] **4.3.4** Update `processFile()` call to include new metadata
- [x] **4.3.5** Verify existing queue functionality unchanged

### 4.4 Test End-to-End Single Provider Flow (Single PR: 4.4.1-4.4.7)
- [x] **4.4.1** Test: Upload single burial register page image
- [x] **4.4.2** Test: Process with GPT provider
- [x] **4.4.3** Verify page JSON stored correctly
- [x] **4.4.4** Verify all entries stored in database
- [x] **4.4.5** Verify return value structure
- [x] **4.4.6** Test: Process same page with Claude provider
- [x] **4.4.7** Verify no errors in processing

---

## Phase 5: CSV Export

### 5.1 Create CSV Export Script (Single PR: 5.1.1-5.1.8)
- [x] **5.1.1** Create `scripts/export-burial-register-csv.js` script
- [x] **5.1.2** Accept command-line arguments: `{provider} {volumeId}`
- [x] **5.1.3** Connect to database in script
- [x] **5.1.4** Implement SQL query: `SELECT * FROM burial_register_entries WHERE ai_provider = ? AND volume_id = ? ORDER BY volume_id, page_number, row_index_on_page`
- [x] **5.1.5** Import and use `jsonToCsv()` from `dataConversion.js`
- [x] **5.1.6** Write CSV to: `data/burial_register/{volumeId}/csv/burials_{volumeId}_{provider}.csv`
- [x] **5.1.7** Handle uncertainty_flags (JSON string) in CSV output
- [x] **5.1.8** Add error handling and logging

### 5.2 Test CSV Export (Single PR: 5.2.1-5.2.9)
- [x] **5.2.1** Insert test entries into database (GPT entries)
- [x] **5.2.2** Insert test entries into database (Claude entries)
- [x] **5.2.3** Run export script for GPT: `node scripts/export-burial-register-csv.js gpt vol1`
- [x] **5.2.4** Run export script for Claude: `node scripts/export-burial-register-csv.js claude vol1`
- [x] **5.2.5** Verify GPT CSV file created
- [x] **5.2.6** Verify Claude CSV file created
- [x] **5.2.7** Verify CSV column order matches pilot plan
- [x] **5.2.8** Verify all entries included in CSV
- [x] **5.2.9** Verify uncertainty_flags format in CSV

---

## Phase 6: Configuration

### 6.1 Update config.json (Single PR: 6.1.1-6.1.3)
- [x] **6.1.1** Add `burialRegister` section to `config.json`
  - `outputDir`: `"./data/burial_register"`
  - `volumeId`: `"vol1"`
  - `csv.includeHeaders`: `true`
  - `csv.encoding`: `"utf-8"`
- [x] **6.1.2** Document environment variable override: `BURIAL_REGISTER_OUTPUT_DIR`
- [x] **6.1.3** Verify config is loaded correctly in code

---

## Phase 7: Integration Testing

### 7.1 Test Dual Provider Processing (Single PR: 7.1.1-7.1.8)
- [x] **7.1.1** Upload same page twice (once with GPT, once with Claude)
- [x] **7.1.2** Verify both page JSON files created in separate directories
- [x] **7.1.3** Verify both sets of entries in database
- [x] **7.1.4** Verify entries have same entry_id but different ai_provider
- [x] **7.1.5** Verify UNIQUE constraint works (can't insert duplicate)
- [x] **7.1.6** Run CSV export for GPT provider
- [x] **7.1.7** Run CSV export for Claude provider
- [x] **7.1.8** Verify both CSVs generated correctly

### 7.2 Test Multi-Page Batch (Single PR: 7.2.1-7.2.7)
- [x] **7.2.1** Upload 3-5 page images
- [x] **7.2.2** Process all pages with GPT provider
- [x] **7.2.3** Process all pages with Claude provider
- [x] **7.2.4** Verify all page JSON files created
- [x] **7.2.5** Verify all entries in database
- [x] **7.2.6** Verify CSV export includes all entries
- [x] **7.2.7** Verify correct ordering in CSV (volume, page, row)

### 7.3 Validate CSV Schema (Single PR: 7.3.1-7.3.6)
- [x] **7.3.1** Compare CSV columns to pilot plan schema
- [x] **7.3.2** Verify all required fields present in CSV
- [x] **7.3.3** Verify column order matches pilot plan
- [x] **7.3.4** Verify data types match expectations
- [x] **7.3.5** Verify uncertainty_flags format in CSV
- [x] **7.3.6** Create sample CSV for review

---

## Phase 8: Documentation and Cleanup

### 8.1 Update Documentation (Single PR: 8.1.1-8.1.5)
- [x] **8.1.1** Document new prompt template in README
- [x] **8.1.2** Document CSV export script usage
- [x] **8.1.3** Document database schema changes
- [x] **8.1.4** Add usage examples to documentation
- [x] **8.1.5** Update API documentation (if routes added)

### 8.2 Code Review and Cleanup (Single PR: 8.2.1-8.2.6)
- [x] **8.2.1** Review all new code for consistency
- [x] **8.2.2** Remove or adjust debug logging levels
- [x] **8.2.3** Verify error handling is comprehensive
- [x] **8.2.4** Check for code duplication
- [x] **8.2.5** Ensure naming conventions consistent
- [x] **8.2.6** Add JSDoc comments where needed

---

## Phase 9: Pilot Preparation

### 9.1 Prepare Test Data (Single PR: 9.1.1-9.1.4)
- [x] **9.1.1** Identify sample pages for testing
- [x] **9.1.2** Create expected output examples
- [x] **9.1.3** Document test scenarios
- [x] **9.1.4** Prepare validation checklist

### 9.2 Pilot Run Preparation (Single PR: 9.2.1-9.2.5)
- [x] **9.2.1** Verify all ~210 pages are accessible
- [x] **9.2.2** Set up processing environment
- [x] **9.2.3** Prepare monitoring/logging setup
- [x] **9.2.4** Create backup procedures
- [x] **9.2.5** Document pilot run steps

---

## Phase 10: Frontend UI Support

### 10.1 Add Source Type Selection UI (Single PR: 10.1.1-10.1.8)
- [x] **10.1.1** Create `public/js/modules/index/sourceTypeSelection.js` module (similar to modelSelection.js)
- [x] **10.1.2** Add source type selector UI component to `index.html` (radio buttons or dropdown)
  - Options: Record Sheet, Monument Photo, Burial Register
  - Default: Record Sheet
- [x] **10.1.3** Add volume ID input field to `index.html` (conditionally visible)
  - Default value: "vol1"
  - Label: "Volume ID"
  - Placeholder: "e.g., vol1"
- [x] **10.1.4** Implement show/hide logic for volume ID field based on source type selection
- [x] **10.1.5** Update `fileUpload.js` to capture source type selection
- [x] **10.1.6** Update `fileUpload.js` to capture volume ID when burial register is selected
- [x] **10.1.7** Update `fileUpload.js` `sending` event handler to append `source_type` and `volume_id` to formData
- [x] **10.1.8** Test: Verify form data sent matches backend expectations

### 10.2 Test Frontend Integration (Single PR: 10.2.1-10.2.5)
- [x] **10.2.1** Test record_sheet upload (default behavior)
- [x] **10.2.2** Test monument_photo upload
- [x] **10.2.3** Test burial_register upload with volume ID
- [x] **10.2.4** Verify backend receives correct parameters for each source type
- [x] **10.2.5** Verify backend processing works correctly for each source type

**Related Issue:** https://github.com/donalotiarnaigh/textharvester-web-public/issues

---

## Phase 11: Simultaneous Dual Provider Processing

### 11.1 Enable Simultaneous GPT and Claude Processing (Single PR: 11.1.1-11.1.8)
- [ ] **11.1.1** Add "Both (GPT + Claude)" option to provider dropdown in UI
- [ ] **11.1.2** Modify `uploadHandler.js` to duplicate files for both providers when "both" selected
- [ ] **11.1.3** Update progress tracking to handle completion per `(filePath, provider)` pair
- [ ] **11.1.4** Update `fileQueue.js` to track completion when all providers finish each file
- [ ] **11.1.5** Implement error handling for partial failures (one provider succeeds, other fails)
- [ ] **11.1.6** Update UI progress display to show both providers' status
- [ ] **11.1.7** Update results page to display results from both providers
- [ ] **11.1.8** Test with sample files to verify simultaneous processing works

**Related Issue:** https://github.com/donalotiarnaigh/textharvester-web-public/issues

---

## Summary

**Total Tasks:** 148  
**Completed Tasks:** 140 (94.6%)
**Remaining Tasks:** 8 (5.4%)
**Total PRs:** ~22-27 (tasks grouped into logical PR-sized chunks)  
**Critical Path:** Phases 1-5 must be completed sequentially  
**Estimated Completion:** Ready for pilot run after Phase 7

**Phase Completion Status:**
- ✅ Phase 1: Prompt template (Foundation) - 100% Complete
- ✅ Phase 2: Flattening logic - 100% Complete
- ✅ Phase 3: Database schema and storage - 100% Complete
- ✅ Phase 4: File processing integration - 100% Complete
- ✅ Phase 5: CSV export - 100% Complete
- ✅ Phase 6: Configuration - 100% Complete
- ✅ Phase 7: Integration testing - 100% Complete
- ✅ Phase 8: Documentation and cleanup - 100% Complete
- ✅ Phase 9: Pilot preparation - 100% Complete
- ✅ Phase 10: Frontend UI support - 100% Complete
- ⏳ Phase 11: Simultaneous dual provider processing - 0% Complete

**Remaining Work:**
- Phase 11: Simultaneous GPT and Claude processing (8 tasks)

**PR Grouping Strategy:**
- Related tasks are grouped into single PRs for efficient review
- Each PR is independently testable and reviewable
- Large phases (like 4.1) are split into multiple PRs for manageability
- Test tasks are grouped with their corresponding implementation tasks

**Quick Reference:**
- Phase 1: Prompt template (Foundation)
- Phase 2: Flattening logic
- Phase 3: Database schema and storage
- Phase 4: File processing integration
- Phase 5: CSV export
- Phase 6: Configuration (can be done in parallel)
- Phase 7: Integration testing (requires all previous)
- Phase 8: Documentation and cleanup
- Phase 9: Pilot preparation
- Phase 10: Frontend UI support
- Phase 11: Simultaneous dual provider processing (new)

---

**Last Updated:** 2025-12-04  
**Status:** Phases 1-10 Complete (100%), Phase 11 Pending (0%) - Simultaneous Dual Provider Processing Feature

