# Manual Testing Plan: Burial Register Extension

**Purpose:** Verify the burial register extension works correctly before processing ~210 pages  
**Status:** Pre-pilot validation  
**Estimated Time:** 2-3 hours

---

## Prerequisites

- [ ] Database migration run: `node scripts/migrate-add-burial-register-table.js`
- [ ] Test page images available (2-3 sample pages from Volume 1)
- [ ] API keys configured for both OpenAI and Anthropic
- [ ] Server running: `npm start` or `npm run dev`

---

## Test 1: Frontend UI - Source Type Selection

### 1.1 Source Type Dropdown
- [ ] Navigate to upload page (`/`)
- [ ] Verify source type dropdown is visible
- [ ] Verify dropdown has three options:
  - [ ] Record Sheet (default)
  - [ ] Monument Photo
  - [ ] Burial Register
- [ ] Select "Burial Register"
- [ ] Verify Volume ID field appears
- [ ] Verify Volume ID field has default value "vol1"
- [ ] Select "Record Sheet" again
- [ ] Verify Volume ID field disappears

### 1.2 Volume ID Input
- [ ] Select "Burial Register" source type
- [ ] Verify Volume ID input field is visible
- [ ] Change Volume ID to "vol2"
- [ ] Verify value persists when selecting files
- [ ] Change back to "vol1"

### 1.3 Form Data Submission
- [ ] Open browser DevTools → Network tab
- [ ] Select "Burial Register" source type
- [ ] Set Volume ID to "vol1"
- [ ] Select a test page image
- [ ] Click "Submit Files"
- [ ] Verify in Network tab that request includes:
  - [ ] `source_type: "burial_register"`
  - [ ] `volume_id: "vol1"`
  - [ ] `aiProvider: "openai"` (or selected provider)
- [ ] Verify request is sent to `/upload` endpoint

**Expected Result:** UI correctly shows/hides Volume ID field and sends correct form data.

---

## Test 2: Single Page Processing - GPT Provider

### 2.1 Upload and Process
- [ ] Select "Burial Register" source type
- [ ] Set Volume ID to "vol1"
- [ ] Select provider: "OpenAI" (GPT)
- [ ] Upload 1 test page image
- [ ] Click "Submit Files"
- [ ] Monitor processing page
- [ ] Wait for processing to complete
- [ ] Verify redirect to results page

### 2.2 Verify Page JSON Storage
- [ ] Check file system: `data/burial_register/vol1/pages/openai/`
- [ ] Verify page JSON file created: `page_{NNN}.json`
- [ ] Open page JSON file
- [ ] Verify structure matches schema:
  - [ ] `volume_id` present and correct
  - [ ] `page_number` present and correct
  - [ ] `parish_header_raw` present
  - [ ] `county_header_raw` present
  - [ ] `year_header_raw` present
  - [ ] `entries` array present
  - [ ] Each entry has required fields
- [ ] Verify entries array has expected number of entries

### 2.3 Verify Database Storage
- [ ] Connect to database: `sqlite3 data/memorials.db`
- [ ] Run query: `SELECT COUNT(*) FROM burial_register_entries WHERE ai_provider = 'openai' AND volume_id = 'vol1';`
- [ ] Verify count matches number of entries in page JSON
- [ ] Run query: `SELECT * FROM burial_register_entries WHERE ai_provider = 'openai' AND volume_id = 'vol1' LIMIT 1;`
- [ ] Verify entry has all required fields:
  - [ ] `volume_id`, `page_number`, `row_index_on_page`, `entry_id`
  - [ ] Entry fields: `name_raw`, `abode_raw`, `burial_date_raw`, etc.
  - [ ] Header metadata: `parish_header_raw`, `county_header_raw`, `year_header_raw`
  - [ ] Model metadata: `model_name`, `ai_provider`, `prompt_template`
  - [ ] Processing metadata: `file_name`, `processed_date`
- [ ] Verify `uncertainty_flags` stored as JSON string (e.g., `["illegible_date"]`)
- [ ] Verify `entry_id` format: `vol1_p{NNN}_r{NNN}`

### 2.4 Verify CSV Export
- [ ] Run export script: `node scripts/export-burial-register-csv.js openai vol1`
- [ ] Verify script completes without errors
- [ ] Check file created: `data/burial_register/vol1/csv/burials_vol1_openai.csv`
- [ ] Open CSV file
- [ ] Verify CSV has headers matching pilot plan schema
- [ ] Verify row count matches database entry count
- [ ] Verify column order matches pilot plan
- [ ] Verify `uncertainty_flags` appears as JSON string in CSV
- [ ] Spot-check a few rows for data correctness

**Expected Result:** Single page processed correctly, stored in DB, and exported to CSV.

---

## Test 3: Single Page Processing - Claude Provider

### 3.1 Upload and Process
- [ ] Select "Burial Register" source type
- [ ] Set Volume ID to "vol1"
- [ ] Select provider: "Anthropic" (Claude)
- [ ] Upload same test page image (or different one)
- [ ] Click "Submit Files"
- [ ] Monitor processing
- [ ] Wait for completion

### 3.2 Verify Separate Storage
- [ ] Check file system: `data/burial_register/vol1/pages/anthropic/`
- [ ] Verify page JSON file created in separate directory
- [ ] Verify database has entries with `ai_provider = 'anthropic'`
- [ ] Verify entries have same `entry_id` but different `ai_provider` (if same page)
- [ ] Run export: `node scripts/export-burial-register-csv.js anthropic vol1`
- [ ] Verify CSV created: `burials_vol1_anthropic.csv`
- [ ] Verify CSV has correct data

**Expected Result:** Claude processing works identically to GPT, with separate storage.

---

## Test 4: Dual Provider Processing (Same Page)

### 4.1 Process Same Page Twice
- [ ] Process page with GPT (as in Test 2)
- [ ] Process same page with Claude (as in Test 3)
- [ ] Verify both page JSON files exist in separate directories

### 4.2 Verify Database Entries
- [ ] Query: `SELECT entry_id, ai_provider FROM burial_register_entries WHERE volume_id = 'vol1' AND page_number = {page_num};`
- [ ] Verify same `entry_id` appears twice (once per provider)
- [ ] Verify different `ai_provider` values
- [ ] Verify UNIQUE constraint works (can't insert duplicate)
- [ ] Try to insert duplicate manually (should fail)

### 4.3 Verify CSV Exports
- [ ] Export GPT CSV: `node scripts/export-burial-register-csv.js openai vol1`
- [ ] Export Claude CSV: `node scripts/export-burial-register-csv.js anthropic vol1`
- [ ] Open both CSVs
- [ ] Verify both have same number of rows (same page)
- [ ] Verify `entry_id` values match between CSVs
- [ ] Verify data may differ (different model interpretations)

**Expected Result:** Same page can be processed with both providers, entries stored separately, CSVs generated correctly.

---

## Test 5: Multi-Page Batch Processing

### 5.1 Upload Multiple Pages
- [ ] Select "Burial Register" source type
- [ ] Set Volume ID to "vol1"
- [ ] Select provider: "OpenAI"
- [ ] Upload 3-5 test page images
- [ ] Click "Submit Files"
- [ ] Monitor processing
- [ ] Wait for all pages to complete

### 5.2 Verify All Pages Processed
- [ ] Check page JSON files: `data/burial_register/vol1/pages/openai/`
- [ ] Verify one JSON file per page: `page_001.json`, `page_002.json`, etc.
- [ ] Verify page numbers are sequential and correct
- [ ] Query database: `SELECT COUNT(DISTINCT page_number) FROM burial_register_entries WHERE ai_provider = 'openai' AND volume_id = 'vol1';`
- [ ] Verify count matches number of pages uploaded
- [ ] Query: `SELECT page_number, COUNT(*) as entries FROM burial_register_entries WHERE ai_provider = 'openai' AND volume_id = 'vol1' GROUP BY page_number ORDER BY page_number;`
- [ ] Verify each page has entries
- [ ] Verify entry counts are reasonable (not 0, not extremely high)

### 5.3 Verify CSV Export Ordering
- [ ] Run export: `node scripts/export-burial-register-csv.js openai vol1`
- [ ] Open CSV
- [ ] Verify rows ordered by: `volume_id`, `page_number`, `row_index_on_page`
- [ ] Verify all pages included
- [ ] Verify no duplicate entries

**Expected Result:** Multiple pages processed correctly, all stored, CSV ordered correctly.

---

## Test 6: Edge Cases and Error Handling

### 6.1 Empty/Missing Fields
- [ ] Process a page that might have missing data
- [ ] Verify null/empty fields handled gracefully
- [ ] Verify database accepts NULL values for optional fields
- [ ] Verify CSV exports NULL values correctly

### 6.2 Invalid Volume ID
- [ ] Try uploading with empty Volume ID
- [ ] Verify default "vol1" is used
- [ ] Try uploading with special characters in Volume ID
- [ ] Verify handling (should work or show clear error)

### 6.3 Processing Errors
- [ ] Monitor console/logs during processing
- [ ] Verify errors are logged clearly
- [ ] Verify processing continues if one page fails
- [ ] Verify error messages are descriptive

### 6.4 CSV Export Edge Cases
- [ ] Export when no entries exist: `node scripts/export-burial-register-csv.js openai vol999`
- [ ] Verify graceful handling (empty CSV or clear error)
- [ ] Export with invalid provider name
- [ ] Verify clear error message

**Expected Result:** Edge cases handled gracefully with clear error messages.

---

## Test 7: Regression Testing - Existing Functionality

### 7.1 Record Sheet Processing
- [ ] Select "Record Sheet" source type
- [ ] Upload a memorial record sheet image
- [ ] Verify processing works as before
- [ ] Verify data stored in `memorials` table (not `burial_register_entries`)
- [ ] Verify no burial register files created

### 7.2 Monument Photo Processing
- [ ] Select "Monument Photo" source type
- [ ] Upload a monument photo
- [ ] Verify processing works as before
- [ ] Verify data stored in `memorials` table
- [ ] Verify no burial register files created

**Expected Result:** Existing functionality unchanged, no regressions.

---

## Test 8: Data Validation

### 8.1 Entry ID Format
- [ ] Query database: `SELECT entry_id FROM burial_register_entries LIMIT 10;`
- [ ] Verify format: `vol1_p{NNN}_r{NNN}` (zero-padded)
- [ ] Verify page numbers are 3 digits (001, 002, etc.)
- [ ] Verify row indices are 3 digits (001, 002, etc.)

### 8.2 Uncertainty Flags
- [ ] Query: `SELECT uncertainty_flags FROM burial_register_entries WHERE uncertainty_flags IS NOT NULL LIMIT 5;`
- [ ] Verify stored as JSON string (e.g., `["illegible_date","partial_name"]`)
- [ ] Verify can be parsed: `JSON.parse(uncertainty_flags)`
- [ ] Verify appears correctly in CSV

### 8.3 Metadata Injection
- [ ] Query: `SELECT page_number, parish_header_raw, county_header_raw, year_header_raw FROM burial_register_entries WHERE page_number = {page_num} LIMIT 5;`
- [ ] Verify all entries from same page have same header values
- [ ] Verify headers are not NULL (if present in page JSON)

**Expected Result:** Data format and validation working correctly.

---

## Test 9: Performance and Monitoring

### 9.1 Processing Time
- [ ] Time single page processing
- [ ] Verify reasonable processing time (< 30 seconds per page)
- [ ] Monitor API rate limits
- [ ] Verify no excessive API calls

### 9.2 Database Performance
- [ ] Verify database queries are fast
- [ ] Check indexes are being used
- [ ] Verify no database locks or timeouts

### 9.3 File System
- [ ] Verify page JSON files are reasonable size
- [ ] Verify directory structure is clean
- [ ] Verify no orphaned files

**Expected Result:** Performance acceptable, no bottlenecks.

---

## Test 10: Integration - End-to-End Workflow

### 10.1 Complete Workflow
- [ ] Upload 2-3 pages with GPT
- [ ] Wait for processing
- [ ] Export GPT CSV
- [ ] Upload same pages with Claude
- [ ] Wait for processing
- [ ] Export Claude CSV
- [ ] Verify both CSVs can be opened in spreadsheet software
- [ ] Verify data structure matches pilot plan schema
- [ ] Verify ready for fusion logic

**Expected Result:** Complete workflow works end-to-end, ready for pilot.

---

## Test Results Summary

### Pass/Fail Checklist
- [ ] Test 1: Frontend UI - **PASS / FAIL**
- [ ] Test 2: Single Page GPT - **PASS / FAIL**
- [ ] Test 3: Single Page Claude - **PASS / FAIL**
- [ ] Test 4: Dual Provider - **PASS / FAIL**
- [ ] Test 5: Multi-Page Batch - **PASS / FAIL**
- [ ] Test 6: Edge Cases - **PASS / FAIL**
- [ ] Test 7: Regression - **PASS / FAIL**
- [ ] Test 8: Data Validation - **PASS / FAIL**
- [ ] Test 9: Performance - **PASS / FAIL**
- [ ] Test 10: End-to-End - **PASS / FAIL**

### Issues Found
- [ ] Issue 1: [Description]
- [ ] Issue 2: [Description]
- [ ] Issue 3: [Description]

### Notes
- [ ] Any observations or concerns
- [ ] Recommendations for improvements

---

## Quick Reference Commands

```bash
# Database migration
node scripts/migrate-add-burial-register-table.js

# Start server
npm start
# or
npm run dev

# Export CSVs
node scripts/export-burial-register-csv.js openai vol1
node scripts/export-burial-register-csv.js anthropic vol1

# Database queries
sqlite3 data/memorials.db
SELECT COUNT(*) FROM burial_register_entries WHERE ai_provider = 'openai';
SELECT * FROM burial_register_entries WHERE volume_id = 'vol1' LIMIT 5;
```

---

## Success Criteria

✅ All tests pass  
✅ No regressions in existing functionality  
✅ Data structure matches pilot plan schema  
✅ CSVs can be generated and opened correctly  
✅ Ready to process ~210 pages with confidence  

---

**Last Updated:** 2025-01-27  
**Status:** Ready for Manual Testing

