> **Text Harvester** — OCR and structured extraction for heritage records:
> memorial inscriptions, burial registers and grave record cards, using vision
> AI models.
>
> *This repository is a generated mirror: a single commit, no development
> history. See [MIRROR.md](MIRROR.md) — pull requests cannot be merged here.*

# Text Harvester

[![CI](https://github.com/donalotiarnaigh/textharvester-web-public/actions/workflows/ci.yml/badge.svg)](https://github.com/donalotiarnaigh/textharvester-web-public/actions/workflows/ci.yml)
[![License: ISC](https://img.shields.io/badge/License-ISC-blue.svg)](https://opensource.org/licenses/ISC)
[![Node.js](https://img.shields.io/badge/node-%3E%3D22.0.0-brightgreen)](https://nodejs.org)

Welcome to the Text Harvester, a community-driven web application designed to process and analyse handwritten text and optimised for record sheets used in the heritage sector. Utilising advanced Optical Character Recognition (OCR) technology, the app extracts handwritten inscriptions from record sheets, making historical data more accessible and preserving valuable information for future generations.

## Features

- **Drag-and-Drop File Upload**: Drag and drop JPEG images or PDFs into the drop zone for processing, or click to select individual files or entire folders. PDFs are automatically converted to JPEG in the background.
- **Progress Monitoring**: Real-time updates on the status of your uploads and OCR processing.
- **Multiple AI Providers**: Support for different vision AI models:
  - OpenAI GPT-5.4 (default)
  - Anthropic Claude Opus 4.6
  - Google Gemini 3.1 Pro
  - Mistral OCR (mistral-ocr-latest)
- **Source Types**:
  - **Memorial OCR**: Standard memorial/headstone transcription
  - **Burial Register**: Dedicated prompt template for burial register pages with per-entry CSV exports
  - **Grave Record Card**: Structured extraction from grave record cards
  - **Typographic Analysis**: Specialized extraction of lettering styles, historical characters, and botanical iconography
- **Confidence Scoring**: AI-assigned confidence per field, with automatic flagging for human review when scores fall below configurable thresholds
- **Cross-Field Validation**: Automatic detection of implausible ages, identical names, and other data quality issues
- **Token and Cost Tracking**: Per-request token usage and cost estimates, with configurable session cost caps
- **Retry Logic**: Two-layer retry system — provider-level retries for transient API failures, and validation-level retries for malformed responses
- **LLM Audit Logging**: Full prompt and response logging for debugging and eval dataset building
- **Request Correlation**: UUID-based `processing_id` per file for end-to-end audit tracing
- **Results Management**:
  - Choose to replace existing results or add to them
  - Download extracted text data in JSON or CSV formats
  - Custom filename support for downloads
  - "Needs Review" filtering and colour-coded confidence panels
- **Persistent Storage**: SQLite database ensures your data is safely stored and easily accessible
- **Automatic Backups**: Database backups are created automatically in the `backups/` directory

## Command Line Interface (CLI)

TextHarvester includes a full-featured CLI for headless operation, batch processing, and automation.

### Quick Start

```bash
# Check version
npm run th -- --version

# View help
npm run th -- --help
```

### Key Commands

- **`ingest`**: Batch process images using glob patterns.
- **`query`**: Search and filter processed records (supports `--needs-review` flag).
- **`export`**: Export data to JSON or CSV.
- **`system`**: Manage database and system status (includes `system cost` for cost reporting).

For detailed usage instructions, see [CLI Usage Guide](docs/cli/usage.md).

## Database

The application uses SQLite to store records across four tables. The database file is located in `data/memorials.db`.

### Memorials schema
```sql
CREATE TABLE IF NOT EXISTS memorials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    memorial_number TEXT,
    first_name TEXT,
    last_name TEXT,
    year_of_death TEXT CONSTRAINT valid_year CHECK (
        year_of_death IS NULL OR
        year_of_death = '-' OR
        year_of_death GLOB '*-*' OR
        (CAST(year_of_death AS INTEGER) >= 1500 AND CAST(year_of_death AS INTEGER) <= 2100)
    ),
    inscription TEXT,
    file_name TEXT,
    ai_provider TEXT,
    model_version TEXT,
    prompt_template TEXT,
    prompt_version TEXT,
    processed_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    source_type TEXT,
    site_code TEXT,
    transcription_raw TEXT,
    stone_condition TEXT,
    typography_analysis TEXT,
    iconography TEXT,
    structural_observations TEXT,
    confidence_scores TEXT,
    confidence_coverage REAL DEFAULT NULL,
    needs_review INTEGER DEFAULT 0,
    reviewed_at DATETIME,
    validation_warnings TEXT,
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    estimated_cost_usd REAL DEFAULT 0,
    processing_id TEXT
);

-- Indexes for optimized queries
CREATE INDEX idx_memorial_number ON memorials(memorial_number);
CREATE INDEX idx_name ON memorials(last_name, first_name);
CREATE INDEX idx_year ON memorials(year_of_death);
```

### Burial register schema
```sql
CREATE TABLE IF NOT EXISTS burial_register_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  volume_id TEXT NOT NULL,
  page_number INTEGER NOT NULL,
  row_index_on_page INTEGER NOT NULL,
  entry_id TEXT NOT NULL,
  entry_no_raw TEXT,
  name_raw TEXT,
  abode_raw TEXT,
  burial_date_raw TEXT,
  age_raw TEXT,
  officiant_raw TEXT,
  marginalia_raw TEXT,
  extra_notes_raw TEXT,
  row_ocr_raw TEXT,
  parish_header_raw TEXT,
  county_header_raw TEXT,
  year_header_raw TEXT,
  model_name TEXT,
  model_run_id TEXT,
  uncertainty_flags TEXT,
  file_name TEXT NOT NULL,
  ai_provider TEXT NOT NULL,
  prompt_template TEXT,
  prompt_version TEXT,
  processed_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  confidence_scores TEXT,
  confidence_coverage REAL DEFAULT NULL,
  needs_review INTEGER DEFAULT 0,
  reviewed_at DATETIME,
  validation_warnings TEXT,
  processing_id TEXT,
  UNIQUE(volume_id, file_name, row_index_on_page, ai_provider)
);

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_burial_provider_volume_page ON burial_register_entries(ai_provider, volume_id, page_number);
CREATE INDEX IF NOT EXISTS idx_burial_entry_id ON burial_register_entries(entry_id);
CREATE INDEX IF NOT EXISTS idx_burial_volume_page ON burial_register_entries(volume_id, page_number);
```

### Grave cards schema
```sql
CREATE TABLE IF NOT EXISTS grave_cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    file_name TEXT NOT NULL,
    section TEXT,
    grave_number TEXT,
    data_json TEXT,
    processed_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    ai_provider TEXT,
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    estimated_cost_usd REAL DEFAULT 0,
    processing_id TEXT
);
```

### LLM audit log schema
```sql
CREATE TABLE IF NOT EXISTS llm_audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    processing_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    system_prompt TEXT,
    user_prompt TEXT,
    image_size_bytes INTEGER DEFAULT 0,
    raw_response TEXT,
    input_tokens INTEGER DEFAULT 0,
    output_tokens INTEGER DEFAULT 0,
    response_time_ms INTEGER DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'success',
    error_message TEXT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### Data Types and Constraints
- `memorial_number`: Text (supports non-numeric identifiers)
- `year_of_death`: Text with validation (supports integers 1500-2100, date ranges, dashes, and NULL)
- `file_name`: Required field (NOT NULL)
- `ai_provider`: Tracks which AI service was used (e.g., 'openai', 'anthropic', 'gemini')
- `model_version`: Records the specific model version used
- `prompt_template`: Stores the prompt template used for extraction
- `prompt_version`: Tracks the version of the prompt used for extraction
- `processing_id`: UUID correlating a file through the entire processing pipeline
- `confidence_scores`: JSON object mapping field names to confidence values (0-1)
- `needs_review`: Flag set when any confidence score falls below the review threshold
- `validation_warnings`: JSON array of cross-field validation warnings
- `input_tokens` / `output_tokens` / `estimated_cost_usd`: Token usage and cost tracking per request
- `processed_date`: Timestamp of when the record was processed
- Optimized indexes for common search patterns

## How It Works

1. **Upload Your Files**:
   - Drag and drop JPEG images or PDFs into the drop zone or click to select files
   - PDFs are automatically converted to JPEG pages in the background
   - Choose whether to replace existing results or add to them
   - Support for both single files and entire folders
   - Process up to 1,000 files simultaneously

2. **Monitor Processing**:
   - Track progress on the processing page
   - Background processing allows continued app use
   - Real-time status updates (including PDF conversion progress)

3. **View and Download Results**:
   - View all processed results on the results page
   - Confidence scores shown per field with colour coding
   - "Needs Review" badge for records below the confidence threshold
   - Download in JSON or CSV format
   - Customize download filenames
   - Results persist between sessions

## Running the App Locally

To run Curlew TextHarvester locally, follow these steps:

1. **Clone the Repository**:
   ```sh
   git clone https://github.com/donalotiarnaigh/textharvester-web-public.git
   ```

2. **Install Dependencies**:
   ```sh
   cd textharvester-web
   npm install
   ```

3. **Set Up Configuration**:
   - Create a `.env` file in the root directory
   - Add required environment variables:
     ```
     PORT=3000
     # AI Provider Configuration
     # Set AI_PROVIDER to 'openai', 'anthropic', 'gemini' or 'mistral'
     AI_PROVIDER=openai
     # API Keys (add keys for the providers you intend to use)
     OPENAI_API_KEY=your_openai_api_key
     ANTHROPIC_API_KEY=your_anthropic_api_key
     GEMINI_API_KEY=your_gemini_api_key
     MISTRAL_API_KEY=your_mistral_api_key
     ```

4. **Run the App**:
   ```sh
   npm run local-start
   ```
   The app will run on `localhost:3000`

## Configuration

Application settings are managed in `config.json`. Key sections:

- **`openAI`** / **`anthropic`** / **`gemini`**: Per-provider model selection and token limits
- **`confidence`**: Thresholds for auto-accept (0.90), review (0.70), and reject (0.50)
- **`costs`**: Per-model token pricing and `maxCostPerSession` cap (default $5.00)
- **`retry`**: Provider-level retries (3), validation retries (1), backoff settings
- **`audit`**: Enable/disable LLM audit logging
- **`graveCard`**: Stitch padding, min resolution, max export interments
- **`burialRegister`**: Output directory, default volume ID, CSV options

## Technology

- **Express.js**: Web framework
- **SQLite**: Persistent data storage
- **Multer**: File upload handling
- **AI Vision Models**:
  - OpenAI GPT-5.4
  - Anthropic Claude Opus 4.6
  - Google Gemini 3.1 Pro
- **Node.js**: Runtime environment

## Data Management

- Uploaded images are processed and automatically cleaned up after use
- PDFs are converted to JPEG pages in the background before processing
- Extracted text is stored in SQLite database
- Regular database backups are maintained
- Option to replace or append to existing records
- Export functionality for data portability

### Burial register configuration

- Burial register outputs default to `./data/burial_register` with files organised by volume and provider.
- Configure defaults in `config.json` under the `burialRegister` section (output directory, default volume ID, CSV options).
- Override the output directory at runtime with the `BURIAL_REGISTER_OUTPUT_DIR` environment variable when needed.

### Burial register prompt template

The `BurialRegisterPrompt` extends the shared `BasePrompt` to describe both page-level metadata and entry-level fields for register pages. The template supports OpenAI, Anthropic, and Gemini providers, exposes provider-specific system/user prompts, and validates the returned JSON before flattening. Expected JSON structure:

```json
{
  "volume_id": "vol1",
  "page_number": 1,
  "parish_header_raw": "St Luke's",
  "county_header_raw": "Cork",
  "year_header_raw": "1896",
  "page_marginalia_raw": null,
  "entries": [
    {
      "row_index_on_page": 1,
      "entry_id": null,
      "entry_no_raw": "12",
      "name_raw": "Jane Doe",
      "abode_raw": "Douglas",
      "burial_date_raw": "12 Mar 1896",
      "age_raw": "48",
      "officiant_raw": "J. Smith",
      "marginalia_raw": null,
      "extra_notes_raw": null,
      "row_ocr_raw": "12 Jane Doe Douglas 12 Mar 1896 48 J. Smith",
      "uncertainty_flags": []
    }
  ]
}
```

### Burial register workflow and examples

1. **Prepare the database**: ensure the burial register table exists by running the migration:
   ```sh
   node scripts/migrate-add-burial-register-table.js
   ```
2. **Upload a page image** using the existing `/upload` endpoint with `source_type=burial_register` and the desired provider (e.g. `openai`, `anthropic`, or `gemini`). The upload handler stores page JSON under `data/burial_register/{volumeId}/pages/{provider}/` and flattens entries into the `burial_register_entries` table.
3. **Export per-entry CSVs** once a volume is processed:
   ```sh
   node scripts/export-burial-register-csv.js gpt vol1
   node scripts/export-burial-register-csv.js claude vol1
   ```
   The script normalises provider aliases (`gpt` → `openai`, `claude` → `anthropic`), reads entries from SQLite in volume/page order, and writes CSVs to `data/burial_register/{volumeId}/csv/`.

### Burial register API parameters

The existing `POST /upload` route accepts burial register uploads without additional endpoints. Include these fields with the request (e.g. multipart form):

- `file`: JPEG image(s) or PDF of register pages
- `source_type`: `burial_register`
- `aiProvider`: `openai`, `anthropic`, or `gemini`
- `volume_id` (optional): volume identifier, defaults to `vol1`
- `promptVersion` (optional): prompt version, defaults to `latest`

The prompt template automatically switches to `burialRegister` when `source_type` is `burial_register`.

### Typographic Analysis

The Typographic Analysis feature provides deep extraction of physical and stylistic attributes from memorial stones.

**Workflow:**
1. Select "Typographic Analysis" from the dropdown (or use `source_type=typographic_analysis`).
2. The system uses a specialized prompt (`TypographicAnalysisPrompt`) to extract detailed data.
3. Results are stored in the main `memorials` table with extended columns.

**Extended Data Fields:**
- **transcription_raw**: Strictly preserves visual characters (e.g., `ſ`, `J`, `U/V`) and line breaks.
- **stone_condition**: Structured assessment of legibility, weathering, and damage.
- **typography_analysis**: Identification of techniques (incised, relief), casing, and specific execution details.
- **iconography**: Detailed breakdown of decorative elements, using correct botanical terms (e.g., `cordate`, `trifoliate`) and religious symbols.
- **structural_observations**: Notes on the monument's shape, material, and borders.

## Support

For support, questions, or feedback, contact us at [daniel@curlew.ie](mailto:daniel@curlew.ie).

Thank you for using the Text Harvester web app!

## Testing Different AI Providers

The application includes utilities to test and compare different AI providers:

1. **Process a file with a specific provider**:
   ```sh
   node scripts/process-with-provider.js openai path/to/image.jpg
   # or
   node scripts/process-with-provider.js anthropic path/to/image.jpg
   # or
   node scripts/process-with-provider.js gemini path/to/image.jpg
   ```

2. **Compare results from all providers**:
   ```sh
   node scripts/test-providers.js path/to/image.jpg
   ```

3. **Switch the default provider** by changing the `AI_PROVIDER` environment variable in your `.env` file.

---

## Extended Documentation

| Document | Description |
|----------|-------------|
| [Architecture Overview](docs/ARCHITECTURE.md) | System diagram, data flow, module responsibilities |
| [API Reference](docs/API.md) | All endpoints with request/response schemas |
| [Configuration Reference](docs/CONFIG.md) | Every `config.json` key explained |
| [Operations Runbook](docs/operations/RUNBOOK.md) | Deployment, monitoring, incident response |
| [Feature Docs](docs/features/) | In-depth feature documentation |
| [Full Docs Index](docs/README.md) | All documentation in one place |
