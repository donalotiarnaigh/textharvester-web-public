# Technical Design: Burial Register Pilot Extension

## 1. Overview

This document outlines the technical design for extending textharvester-web to support the St Luke's Burial Register pilot project. The extension treats each burial register page as a **batch of N individual entries**, reusing the existing flat-record pipeline with minimal divergence.

### Design Principle

> **Treat each PDF page exactly like a "batch of N individual images", each producing a flat-per-entry record.**  
> The page-level JSON becomes metadata, not a separate validation/storage layer.

### Key Differences from Current System

| Aspect | Current (Memorials) | New (Burial Register) |
|--------|---------------------|------------------------|
| **Data Model** | 1 image → 1 record | 1 page → N records (batch expansion) |
| **Structure** | Flat JSON | Page JSON → flattened to N flat entries |
| **Output** | SQLite + optional CSV | SQLite + required CSV (same structure) |
| **Processing** | Single provider per run | Dual provider runs (GPT + Claude) |
| **Schema** | Fixed memorial fields | Custom burial register fields (same flat shape) |
| **Validation** | Per-record | Per-entry (reuses existing logic) |
| **Storage** | DB only | DB + page JSON (reference artifact) |

## 2. Architecture Overview

### 2.1 Comparison with Existing Flows

**Existing Flow (Record Sheets & Monument Photos):**
```
Image Upload
    ↓
[Image Processing] (optimize if needed)
    ↓
[AI Provider] → Flat JSON (one record)
    ↓
[Validate & Convert]
    ↓
[Store in DB] → memorials table (1 row per image)
    ↓
[Optional CSV Export] (via results page)
```

**New Flow (Burial Register) - Aligned:**
```
Image Upload
    ↓
[Image Processing] (optimize if needed)
    ↓
[AI Provider] → Page JSON (with entries array)
    ↓
[Validate Page JSON] → Schema/types check
    ↓
[Flatten] → N flat entry records (like existing flow)
    ↓
[Store Page JSON] → File system (reference artifact only)
    ↓
[Validate Each Entry] → Reuse existing validation logic
    ↓
[Store in DB] → Multiple INSERTs (reuse existing insert logic)
    ↓
[CSV Export Script] → Required export (run after batch, simple SELECT query)
```

**Key Differences:**

| Aspect | Record Sheets/Monuments | Burial Register |
|--------|------------------------|------------------|
| **Data Structure** | Flat JSON | Page JSON → flattened to N flat entries |
| **DB Rows per Image** | 1 row | N rows (batch expansion) |
| **Storage** | DB only | DB + page JSON (reference) + CSV |
| **Flattening Step** | Not needed | Required (after page validation, before per-entry validation) |
| **CSV Generation** | Optional (on-demand) | Required (automatic, simple SELECT) |
| **Page Metadata** | Not captured | Injected into each entry during flattening |
| **Validation** | Per-record | Per-entry (identical logic) |
| **Insert Logic** | Single INSERT | N INSERTs (same logic, looped) |

### 2.2 High-Level Flow (Aligned)

```
Page Image Upload
    ↓
[File Queue] (existing)
    ↓
[Image Processing] (existing)
    ↓
[AI Provider] → Page JSON (with entries array)
    ↓
[Validate Page JSON] → Schema/types check
    ↓
[Flatten Step] → N flat entry records
    ↓
[Store Page JSON] → File system (reference artifact)
    ↓
[Existing Validation] → Per-entry (reuse existing logic)
    ↓
[Existing Insert Logic] → N INSERTs (loop existing function)
    ↓
[CSV Export Script] → Required export (run after batch, simple SELECT query)
```

### 2.2 Component Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Existing Components                  │
├─────────────────────────────────────────────────────────┤
│  fileQueue.js │ imageProcessor.js │ modelProviders/     │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│                  New Components                          │
├─────────────────────────────────────────────────────────┤
│  BurialRegisterPrompt.js  (prompt template)             │
│  burialRegisterFlattener.js  (page JSON → flat entries) │
│  burialRegisterStorage.js  (page JSON + entry storage)   │
│  export-burial-register-csv.js  (CSV export script)     │
└─────────────────────────────────────────────────────────┘
```

## 3. Core Components

### 3.1 Prompt Template: `BurialRegisterPrompt.js`

**Location:** `src/utils/prompts/templates/BurialRegisterPrompt.js`

**Purpose:** Define the prompt and JSON schema for burial register extraction.

**Key Features:**
- Extends `BasePrompt` class
- Defines page-level fields (volume_id, page_number, headers)
- Defines entry-level fields (entry_no_raw, name_raw, etc.)
- Provider-specific formatting (OpenAI vs Anthropic)
- Uncertainty flag handling

**Schema Structure:**
```javascript
{
  volume_id: string,
  page_number: integer,
  parish_header_raw: string,
  county_header_raw: string,
  year_header_raw: string,
  page_marginalia_raw: string | null,
  model_name: string,
  model_run_id: string,
  entries: [
    {
      row_index_on_page: integer,
      entry_id: string,
      entry_no_raw: string | null,
      name_raw: string | null,
      abode_raw: string | null,
      burial_date_raw: string | null,
      age_raw: string | null,
      officiant_raw: string | null,
      marginalia_raw: string | null,
      extra_notes_raw: string | null,
      row_ocr_raw: string | null,
      uncertainty_flags: string[]
    }
  ]
}
```

**Implementation Notes:**
- Use `getPromptText()` to define extraction instructions
- Use `getProviderPrompt()` for provider-specific formatting
- Implement `validateAndConvertPage(pageDataRaw)` - validates provider response (page JSON with entries array)
- Implement `validateAndConvertEntry(entry)` - validates flat entry object (after flattening)
- These are separate functions because they validate different shapes:
  - `validateAndConvertPage`: validates `{ volume_id, page_number, entries: [...] }`
  - `validateAndConvertEntry`: validates flat entry `{ entry_id, name_raw, ... }`
- Handle uncertainty flags as array of strings (converted to JSON string for storage)

### 3.2 Flattener: `burialRegisterFlattener.js`

**Location:** `src/utils/burialRegisterFlattener.js`

**Purpose:** Convert validated page JSON to N flat entry records (flattening after page-level validation, before per-entry validation).

**Key Functions:**

```javascript
/**
 * Flatten validated page JSON to entry records (after page validation, before per-entry validation)
 * @param {Object} pageData - Validated page JSON with entries array
 * @param {Object} metadata - Processing metadata (provider, model, filePath)
 * @returns {Array<Object>} Array of flat entry records (ready for per-entry validation)
 */
function flattenPageToEntries(pageData, metadata)

/**
 * Generate entry ID
 * @param {string} volumeId - Volume identifier
 * @param {number} pageNumber - Page number
 * @param {number} rowIndex - Row index on page
 * @returns {string} Unique entry ID (e.g., "vol1_p001_r003")
 */
function generateEntryId(volumeId, pageNumber, rowIndex)

/**
 * Inject page metadata into entry
 * @param {Object} entry - Entry from entries array
 * @param {Object} pageData - Page-level data (headers, volume_id, etc.)
 * @param {Object} metadata - Processing metadata
 * @returns {Object} Entry with all metadata injected
 */
function injectPageMetadata(entry, pageData, metadata)
```

**Responsibilities:**
- Flatten validated page JSON to N flat entry records
- Inject page-level metadata into each entry (volume_id, page_number, headers)
- Generate entry IDs
- Produce flat records compatible with existing per-entry validation logic
- Called after page-level validation, before per-entry validation

### 3.3 CSV Export Script: `scripts/export-burial-register-csv.js`

**Location:** `scripts/export-burial-register-csv.js`

**Purpose:** Generate CSV from database (run manually after batch processing).

**Usage:**
```bash
node scripts/export-burial-register-csv.js {provider} {volumeId}
# Example: node scripts/export-burial-register-csv.js gpt vol1
```

**Implementation:**
- Simple SQL query: `SELECT * FROM burial_register_entries WHERE ai_provider = ? AND volume_id = ? ORDER BY volume_id, page_number, row_index_on_page`
- Use existing `jsonToCsv` utility from `dataConversion.js`
- Write to file: `burials_vol1_{provider}.csv`
- **Not called during processing** - run separately after batch completion
- Can be run for both providers to generate GPT and Claude CSVs

### 3.4 Storage Module: `burialRegisterStorage.js`

**Location:** `src/utils/burialRegisterStorage.js`

**Purpose:** Store page JSON as reference artifact and manage entry insertion.

**Key Functions:**

```javascript
/**
 * Store page-level JSON as reference artifact (does not affect ingestion)
 * @param {Object} pageData - Page JSON
 * @param {string} provider - Provider name
 * @param {string} volumeId - Volume identifier
 * @param {number} pageNumber - Page number
 * @returns {Promise<string>} Path to stored JSON file
 */
async function storePageJSON(pageData, provider, volumeId, pageNumber)

/**
 * Store entries using existing insert logic (looped N times)
 * @param {Array<Object>} entries - Flattened entry records
 * @param {string} provider - Provider name
 * @returns {Promise<void>}
 */
async function storeEntries(entries, provider)
```

**Implementation Notes:**
- Page JSON stored to: `data/burial_register/{volumeId}/pages/{provider}/page_{NNN}.json`
- Page JSON is **reference artifact only** - not part of DB schema or ingestion logic
- Entry storage reuses existing `storeMemorial`-like function, called N times
- No batch-level storage logic required

**Storage Structure:**
```
data/
  burial_register/
    vol1/
      pages/
        gpt/
          page_001.json
          page_002.json
          ...
        claude/
          page_001.json
          page_002.json
          ...
      csv/
        burials_vol1_gpt.csv
        burials_vol1_claude.csv
```

### 3.5 Database Schema: `burial_register_entries` Table

**Location:** `src/utils/database/schema.js` (add to existing schema)

**Purpose:** Store flattened burial register entries matching CSV schema.

**Table Schema:**
```sql
CREATE TABLE IF NOT EXISTS burial_register_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    -- Core fields
    volume_id TEXT NOT NULL,
    page_number INTEGER NOT NULL,
    row_index_on_page INTEGER NOT NULL,
    entry_id TEXT NOT NULL,  -- Provider-agnostic, not unique (same entry_id for GPT and Claude)
    -- Entry fields
    entry_no_raw TEXT,
    name_raw TEXT,
    abode_raw TEXT,
    burial_date_raw TEXT,
    age_raw TEXT,
    officiant_raw TEXT,
    marginalia_raw TEXT,
    extra_notes_raw TEXT,
    row_ocr_raw TEXT,
    -- Header metadata (repeated per row)
    parish_header_raw TEXT,
    county_header_raw TEXT,
    year_header_raw TEXT,
    -- Model metadata
    model_name TEXT NOT NULL,  -- e.g., "gpt-5.1" or "claude-4-sonnet" (from provider.getModelVersion())
    model_run_id TEXT,  -- Optional: run identifier for tracking
    uncertainty_flags TEXT,  -- JSON-encoded array of strings (e.g., ["illegible_date","partial_name"])
    -- Processing metadata
    file_name TEXT NOT NULL,  -- Standardized: use file_name in DB, fileName in JS code
    ai_provider TEXT NOT NULL,  -- e.g., "openai" or "anthropic"
    prompt_template TEXT,
    prompt_version TEXT,
    processed_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    -- Indexes for querying and joining
    UNIQUE(volume_id, file_name, row_index_on_page, ai_provider)
);

-- Composite index for main CSV query pattern
CREATE INDEX idx_burial_provider_volume_page 
  ON burial_register_entries(ai_provider, volume_id, page_number, row_index_on_page);

-- Additional indexes for other query patterns
CREATE INDEX idx_burial_entry_id ON burial_register_entries(entry_id);
CREATE INDEX idx_burial_volume_page ON burial_register_entries(volume_id, page_number);
```

**Key Design Points:**
- Unique constraint on `(volume_id, file_name, row_index_on_page, ai_provider)` ensures one entry per provider per file/row, preventing duplicates while allowing different files with same page_number
- `entry_id` is provider-agnostic (e.g., `vol1_p001_r003`) - same value for GPT and Claude rows, enabling easy joining
- `entry_id` is NOT UNIQUE (allows same entry_id for different providers)
- `uncertainty_flags` stored as JSON-encoded array of strings (e.g., `["illegible_date","partial_name"]`)
- All fields match CSV column names exactly
- Composite index supports main query pattern (provider + volume + page ordering)

## 4. Integration Points

### 4.1 Flow Comparison: Existing vs New (Reference)

**Existing Flow (Record Sheets/Monument Photos) in `fileProcessing.js`:**

```javascript
async function processFile(filePath, options = {}) {
  // 1. Image processing (optimize if needed)
  const base64Image = await optimizeImageForProvider(filePath, providerName);
  
  // 2. Get prompt (memorialOCR or monumentPhotoOCR)
  const promptInstance = getPrompt(providerName, promptTemplate, promptVersion);
  
  // 3. Call AI provider → Get flat JSON
  const rawExtractedData = await provider.processImage(base64Image, userPrompt, {...});
  // Returns: { memorial_number, first_name, last_name, year_of_death, inscription }
  
  // 4. Validate and convert
  const extractedData = promptInstance.validateAndConvert(rawExtractedData);
  
  // 5. Add metadata
  extractedData.fileName = filename;
  extractedData.ai_provider = providerName;
  // ... other metadata
  
  // 6. Store directly in database (1 row per image)
  await storeMemorial(extractedData);
  // INSERT INTO memorials (memorial_number, first_name, ...) VALUES (...)
  
  // 7. Clean up file
  await fs.unlink(filePath);
  
  return extractedData;  // Single record
}
```

**New Flow (Burial Register) in `fileProcessing.js` - Aligned:**

```javascript
async function processFile(filePath, options = {}) {
  // 1. Image processing (optimize if needed) - SAME
  const base64Image = await optimizeImageForProvider(filePath, providerName);
  
  // 2. Get prompt (burialRegister) - DIFFERENT
  const promptInstance = getPrompt(providerName, 'burialRegister', promptVersion);
  
  // 3. Call AI provider → Get page JSON - DIFFERENT
  const pageDataRaw = await provider.processImage(base64Image, userPrompt, {...});
  // Returns: { volume_id, page_number, entries: [...], ... }
  
  // 4. Validate page JSON before flattening - NEW STEP
  const pageData = promptInstance.validateAndConvertPage(pageDataRaw);
  // Validates page-level schema and types
  
  // 5. Flatten immediately to N flat entries - NEW STEP
  const entries = flattenPageToEntries(pageData, {
    provider: providerName,
    model: provider.getModelVersion(),
    filePath: filePath
  });
  // Returns: [entry1, entry2, ...] - each is flat, like existing records
  
  // 6. Store validated page JSON as reference artifact - NEW STEP
  await storePageJSON(pageData, providerName, pageData.volume_id, pageData.page_number);
  
  // 7. Validate and store each entry (reuse existing logic) - DIFFERENT (looped)
  const processedEntries = [];
  for (const entry of entries) {
    // Validate entry (separate from page validation)
    const validatedEntry = promptInstance.validateAndConvertEntry(entry);
    
    // Add metadata (same as existing flow)
    validatedEntry.fileName = path.basename(filePath);
    validatedEntry.ai_provider = providerName;
    validatedEntry.model_name = provider.getModelVersion();  // e.g., "gpt-5.1" or "claude-4-sonnet"
    validatedEntry.prompt_template = 'burialRegister';
    validatedEntry.prompt_version = promptInstance.version;
    validatedEntry.source_type = 'burial_register';
    
    // Reuse existing insert logic (but to burial_register_entries table)
    await storeBurialRegisterEntry(validatedEntry);
    processedEntries.push(validatedEntry);
  }
  
  // 8. Clean up file - SAME
  await fs.unlink(filePath);
  
  return { entries: processedEntries, pageData: pageData };  // Return both for reference
  // Note: CSV generation happens separately via export script/route, not per-page
}
```

**Key Implementation Differences (Minimized):**

1. **Prompt Selection:**
   - Existing: `memorialOCR` or `monumentPhotoOCR` (flat structure)
   - New: `burialRegister` (returns page JSON, but immediately flattened)

2. **Data Structure:**
   - Existing: Single flat object
   - New: Page JSON → immediately flattened to N flat objects

3. **Validation:**
   - Existing: Per-record validation
   - New: Per-entry validation (identical logic, looped)

4. **Storage:**
   - Existing: One `INSERT` per image → `memorials` table
   - New: N `INSERT`s per image → `burial_register_entries` table (same logic, looped)

5. **Additional Steps:**
   - New: Immediate flattening (before validation)
   - New: Page JSON storage (reference artifact only, doesn't affect ingestion)
   - New: CSV generation (required, but simple SELECT query)

6. **Return Value:**
   - Existing: Single record object
   - New: Array of entry objects (each identical shape to existing records)

### 4.2 Implementation: Extend `fileProcessing.js`

**Modifications:**
- Detect `source_type === 'burial_register'`
- Use `BurialRegisterPrompt` instead of memorial prompts
- Validate page JSON before flattening
- Flatten to N entries and process each with existing validation/insert pattern
- Store page JSON as reference artifact

**Code Pattern:**
```javascript
// In processFile() - after getting rawExtractedData from provider
if (sourceType === 'burial_register') {
  // 1. Burial register: model returns page JSON
  const pageDataRaw = rawExtractedData;  // Page JSON from AI provider
  
  // 2. Validate page JSON before flattening
  const pageData = promptInstance.validateAndConvertPage(pageDataRaw);
  // Validates page-level schema and types
  
  // 3. Flatten immediately to N flat entries
  const entries = flattenPageToEntries(pageData, {
    provider: providerName,
    model: provider.getModelVersion(),
    filePath: filePath
  });
  // Returns: [entry1, entry2, ...] - each is flat, like existing records
  
  // 4. Store validated page JSON as reference artifact
  await storePageJSON(pageData, providerName, pageData.volume_id, pageData.page_number);
  
  // 5. Process each entry exactly like existing flow (but to burial_register_entries)
  const processedEntries = [];
  for (const entry of entries) {
    // Validate entry (separate validation function)
    const validatedEntry = promptInstance.validateAndConvertEntry(entry);
    
    // Add metadata (same pattern as existing)
    validatedEntry.fileName = filename;
    validatedEntry.ai_provider = providerName;
    validatedEntry.model_name = provider.getModelVersion();
    validatedEntry.prompt_template = 'burialRegister';
    validatedEntry.prompt_version = promptInstance.version;
    validatedEntry.source_type = 'burial_register';
    
    // Reuse existing insert pattern (but to burial_register_entries)
    await storeBurialRegisterEntry(validatedEntry);
    processedEntries.push(validatedEntry);
  }
  
  return { entries: processedEntries, pageData };
} else {
  // Existing memorial/record sheet processing path (unchanged)
  const extractedData = promptInstance.validateAndConvert(rawExtractedData);
  extractedData.fileName = filename;
  extractedData.ai_provider = providerName;
  // ... add metadata
  
  await storeMemorial(extractedData);
  return extractedData;
}
```

### 4.2 Extend Upload Handler

**Modifications:**
- Add `burial_register` as valid source_type
- Validate prompt template selection
- Set output directory based on volume_id

**Code Pattern:**
```javascript
// In uploadHandler.js
const validSourceTypes = ['record_sheet', 'monument_photo', 'burial_register'];
const volumeId = req.body.volume_id || 'vol1';
// Set output directory: data/burial_register/{volumeId}/
```

### 4.3 New Route: CSV Download (Optional)

**Location:** `src/routes/burialRegisterRoutes.js` (optional)

**Endpoints:**
- `GET /api/burial-register/csv/:provider` - Download provider CSV

**Note:** CSV files can also be accessed directly from the file system. API endpoints are optional for convenience.

## 5. Data Flow

### 5.1 Single Page Processing Flow (Aligned)

```
1. User uploads page image
   ↓
2. File enqueued with metadata (provider, source_type='burial_register')
   ↓
3. Image processed and optimized (existing logic)
   ↓
4. AI provider called with BurialRegisterPrompt
   ↓
5. Page JSON received: { volume_id, page_number, entries: [...], ... }
   ↓
6. Validate page JSON (schema/types check)
   ↓
7. Flatten: entries[] → [entry1, entry2, ...] (flat records)
   ↓
8. Store validated page JSON: data/burial_register/vol1/pages/{provider}/page_{NNN}.json
   (reference artifact only, doesn't affect ingestion)
   ↓
9. For each entry (loop):
   - Validate entry (reuse existing validation logic)
   - Add metadata (same pattern as existing)
   - INSERT into burial_register_entries (reuse existing insert pattern)
   ↓
10. CSV generation happens separately via export script (not per-page)
    Run after batch completion: node scripts/export-burial-register-csv.js {provider} {volumeId}
```

### 5.2 Dual Provider Processing Flow

```
For each page:
  1. Process with GPT → store entries in DB → store GPT page JSON
  2. Process with Claude → store entries in DB → store Claude page JSON

After all pages processed:
  3. Run export script twice:
     - node scripts/export-burial-register-csv.js gpt vol1 → burials_vol1_gpt.csv
     - node scripts/export-burial-register-csv.js claude vol1 → burials_vol1_claude.csv
  4. Manual fusion can be done using spreadsheet software or external scripts
     (Join by volume_id, page_number, row_index_on_page)
```

### 5.3 CSV Generation Flow (Simplified)

```
1. Query database: SELECT * FROM burial_register_entries 
   WHERE ai_provider = ? AND volume_id = ?
   ORDER BY volume_id, page_number, row_index_on_page
   ↓
2. Use existing jsonToCsv utility (from dataConversion.js)
   ↓
3. Write to file: burials_vol1_{provider}.csv
   (No flattening needed - entries already flat in DB)
```

## 6. Implementation Phases

### Phase 1: Core Prompt and Processing
- [ ] Create `BurialRegisterPrompt.js` with schema
- [ ] Implement field definitions and validation
- [ ] Test prompt with sample page images
- [ ] Verify JSON structure matches pilot plan schema

### Phase 2: Flattening and Storage
- [ ] Create `burialRegisterFlattener.js`
- [ ] Implement immediate flattening (page JSON → N flat entries)
- [ ] Implement metadata injection (page headers into each entry)
- [ ] Implement entry ID generation
- [ ] Create storage directory structure for page JSON
- [ ] Test flattening produces existing-flow-compatible records

### Phase 3: Database Schema
- [ ] Add `burial_register_entries` table to database schema
- [ ] Create migration script
- [ ] Create `storeBurialRegisterEntry()` function (reuse existing insert pattern)
- [ ] Test entry storage and retrieval

### Phase 4: CSV Generation
- [ ] Create `scripts/export-burial-register-csv.js` export script
- [ ] Implement simple SELECT query for CSV generation
- [ ] Reuse existing `jsonToCsv` utility
- [ ] Test CSV output format matches pilot plan
- [ ] Verify GPT and Claude CSVs can be generated separately

### Phase 5: Integration
- [ ] Modify `fileProcessing.js` to add burial_register branch
- [ ] Implement immediate flattening before validation
- [ ] Reuse existing validation logic per-entry (looped)
- [ ] Reuse existing insert pattern (looped N times)
- [ ] Update `uploadHandler.js` for burial_register source_type
- [ ] Test end-to-end single provider flow
- [ ] Verify entries stored correctly and CSV generated

### Phase 6: Dual Provider Support
- [ ] Implement batch processing for both providers
- [ ] Test GPT and Claude runs on same pages
- [ ] Verify separate CSV files are generated via export script

### Phase 7: API and Routes (Optional)
- [ ] Create `burialRegisterRoutes.js` (optional)
- [ ] Implement CSV download endpoints (optional)
- [ ] Test API endpoints

### Phase 8: Testing and Validation
- [ ] Test with sample pages from Volume 1
- [ ] Validate CSV structure matches pilot plan
- [ ] Verify fusion logic produces expected results
- [ ] Performance testing with multiple pages

## 7. Key Design Decisions

### 7.1 Storage Strategy

**Decision:** Aligned with existing flow - DB for entries, page JSON as reference artifact

**Rationale:**
- Maximum reuse of existing storage patterns
- Page JSON is reference only (doesn't affect ingestion)
- Entries stored exactly like existing records (just N per page)
- CSV generation is simple SELECT query (required export)
- Minimal divergence from existing codebase

**Implementation:**
- Create `burial_register_entries` table matching CSV schema
- Store each flattened entry as a row (reuse existing insert pattern)
- Page JSON stored to file system as reference artifact (not in DB)
- CSV generated from database via simple SELECT query
- No batch-level storage logic required

**Trade-offs:**
- Page JSON stored separately (but doesn't affect ingestion)
- Multiple INSERTs per page (but same logic, just looped)
- Benefits: maximum code reuse, minimal branching, easy to maintain

### 7.2 Processing Model

**Decision:** Process each page twice (once per provider) rather than single run with both

**Rationale:**
- Allows independent error handling per provider
- Easier to compare provider performance
- Matches pilot plan workflow
- Can run providers in parallel if needed

**Trade-offs:**
- 2x API calls per page
- More complex queue management
- Need to track which provider is processing

### 7.3 Entry ID Generation

**Decision:** Generate entry IDs as `{volume_id}_p{page_number:03d}_r{row_index:03d}`

**Rationale:**
- Unique and human-readable
- Easy to join across providers
- Matches pilot plan entry_id concept

**Example:** `vol1_p001_r003`

### 7.4 Uncertainty Flags

**Decision:** Store as JSON-encoded array of strings

**Rationale:**
- Handles flags that may contain commas or spaces (e.g., "multi_line_name_split")
- Consistent format across JSON and CSV (JSON string is valid CSV cell value)
- Easy to parse: `JSON.parse(uncertainty_flags)` and `JSON.stringify([...])`

**Format:** `"uncertainty_flags": "[\"illegible_date\",\"partial_name\"]"` (stored as TEXT)

### 7.5 Fusion Approach

**Decision:** Manual fusion outside textharvester

**Rationale:**
- Fusion can be done easily in spreadsheet software (Excel, Google Sheets) or external scripts
- More flexible for pilot evaluation
- Reduces system complexity
- Pilot plan fusion rules can be applied manually or via external scripts
- Combined CSV will be generated outside textharvester-web

**Implementation:**
- textharvester-web generates two CSVs: `burials_vol1_gpt.csv` and `burials_vol1_claude.csv`
- Manual fusion joins by `(volume_id, page_number, row_index_on_page)`
- Fusion rules applied externally (spreadsheet formulas or external script)
- Combined CSV created outside the system

## 8. Configuration

### 8.1 New Config Options

Add to `config.json`:

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

### 8.2 Environment Variables

```bash
# Optional: Output directory (overrides config.json if set)
BURIAL_REGISTER_OUTPUT_DIR=./data/burial_register
```

**Precedence:** Environment variables override `config.json` values.

## 9. Testing Strategy

### 9.1 Unit Tests

- Prompt template validation
- Entry ID generation
- Flattening logic
- CSV generation

### 9.2 Integration Tests

- End-to-end page processing
- Dual provider processing
- CSV file generation

### 9.3 Sample Data

- Create test page images (synthetic or anonymized)
- Expected JSON responses
- Expected CSV outputs

## 10. Future Considerations

### 10.1 Scalability

- For full volume processing, consider:
  - Batch processing optimizations
  - Progress tracking across many pages
  - Error recovery and resume capability

### 10.2 UI Integration

- Add burial register mode to upload page
- Display processing progress
- Show CSV download links
- Preview entries before export

### 10.3 Database Integration

- Database storage is now part of the design (hybrid approach)
- CSV remains primary deliverable format
- Database enables querying, validation, and UI integration

## 11. Dependencies

### 11.1 New Dependencies

- `csv-writer` or similar for CSV generation (or use existing `dataConversion.js`)
- No new major dependencies required

### 11.2 Existing Dependencies Used

- All existing dependencies (express, multer, sharp, etc.)
- Prompt system (BasePrompt, etc.)
- Provider system (OpenAI, Anthropic)

## 12. File Structure

```
textharvester-web/
├── src/
│   ├── utils/
│   │   ├── prompts/
│   │   │   └── templates/
│   │   │       └── BurialRegisterPrompt.js  [NEW]
│   │   ├── burialRegisterFlattener.js  [NEW]
│   │   └── burialRegisterStorage.js  [NEW]
│   ├── scripts/
│   │   └── export-burial-register-csv.js  [NEW]
│   ├── routes/
│   │   └── burialRegisterRoutes.js  [NEW - OPTIONAL]
│   └── controllers/
│       └── uploadHandler.js  [MODIFY]
├── data/
│   └── burial_register/
│       └── vol1/
│           ├── pages/
│           │   ├── gpt/
│           │   └── claude/
│           └── csv/
│               ├── burials_vol1_gpt.csv
│               └── burials_vol1_claude.csv
└── config.json  [MODIFY]
```

## 13. Success Criteria

- [ ] Can process burial register pages with GPT
- [ ] Can process burial register pages with Claude
- [ ] Generates correct JSON structure per page
- [ ] Generates CSV files matching pilot plan schema
- [ ] All fields from pilot plan are captured
- [ ] Uncertainty flags are preserved
- [ ] Can handle ~210 pages efficiently
- [ ] CSV export scripts generate GPT and Claude CSVs correctly
- [ ] CSVs can be manually fused using spreadsheet software or external scripts
- [ ] Maximum code reuse from existing flow (validation, insert logic)
- [ ] Page JSON stored as reference artifact (doesn't affect ingestion)

## 14. Alignment Summary

### Core Principle
**Treat each PDF page as a "batch of N individual images", each producing a flat-per-entry record.**

### Flow Comparison

**Existing Flow:**
```
Image → AI → Flat JSON → Validate → INSERT → Optional CSV
```

**Aligned New Flow:**
```
Image → AI → Page JSON
    ↓ flatten (immediate)
N Flat JSONs → Validate each → N INSERTs → Required CSV
```

### Only Differences That Remain

1. **Multi-record expansion**: 1 page → N rows (batch processing)
2. **Page JSON reference**: Stored to disk as artifact (doesn't affect ingestion)
3. **CSV required**: Simple SELECT query export (not optional)

### What Stays the Same

- ✅ Validation logic (per-entry, identical to existing)
- ✅ Insert pattern (same logic, looped N times)
- ✅ Data structure (flat records, compatible with existing)
- ✅ Error handling (reuse existing patterns)
- ✅ Metadata attachment (same pattern)

### Benefits of This Alignment

- **Maximum code reuse**: Minimal new code, mostly reuse existing functions
- **Minimal branching**: Simple conditional in `fileProcessing.js`
- **Easy maintenance**: Changes to existing flow benefit burial register too
- **Consistent patterns**: Developers familiar with existing flow understand new flow
- **Smooth scaling**: Easy to extend to multiple volumes

---

**Document Version:** 2.0  
**Last Updated:** 2025-01-XX  
**Author:** Technical Design Team

