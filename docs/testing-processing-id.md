# Testing the processing_id Feature

> ⚠️ **Stale document — the helper script no longer exists.**
> `test-processing-id.sh` was **deliberately removed** in commit `ab9b2b8`
> ("Remove root-level test scripts: test-issue-38.sh, test-processing-id.sh,
> verify-grave-card-pipeline.js"). Every `./test-processing-id.sh` command below
> will fail with `command not found`.
>
> The `processing_id` feature itself is still in the codebase and is covered by the
> suite under `__tests__/` — run `npm test`. This document is retained only as a
> record of the original manual testing approach; treat the commands as historical.

## Overview

The `processing_id` feature adds UUIDv4-based request correlation IDs to track individual files through the entire OCR processing pipeline. This document explains how to test this feature using the provided test helper script.

## Table of Contents

1. [Quick Start](#quick-start)
2. [Understanding File Deletion](#understanding-file-deletion)
3. [Test Script Usage](#test-script-usage)
4. [Manual Testing](#manual-testing)
5. [Verification Methods](#verification-methods)
6. [Troubleshooting](#troubleshooting)

## Quick Start

### Dry Run (No API Calls Required)

Test the script without making actual API calls:

```bash
./test-processing-id.sh --dry-run
```

This shows you exactly what commands would be executed without processing any files.

### Test with Real API Keys

If you have OpenAI API key configured:

```bash
./test-processing-id.sh
```

This will:
1. Copy sample data to a temporary directory
2. Process files via the CLI (one for each record type)
3. Verify processing_id was stored in the database
4. Show results in a formatted table

## Understanding File Deletion

### Why Files Are Deleted

The `processFile()` function in `src/utils/fileProcessing.js` automatically deletes input files after successful processing:

```javascript
// After storing in database
await fs.unlink(filePath);
log.info(`Cleaned up processed file: ${filePath}`);
```

This is intentional behavior to:
- Prevent accidental re-processing of the same file
- Clean up uploaded files after they're stored in the database
- Free disk space after successful ingestion

### Safe Testing Strategy

The test helper script protects sample data by:

1. **Copying** files from `sample_data/source_sets/` to a temporary directory
2. **Processing** the copies (not originals)
3. **Deleting** only the copies after processing
4. **Preserving** original sample data for repeated tests

```
sample_data/source_sets/ (PROTECTED)
    ↓ [copy]
/tmp/textharvester-test-xxx/ (TEMPORARY)
    ↓ [process & delete]
Database: processing_id stored ✓
```

## Test Script Usage

### Location

```bash
./test-processing-id.sh
```

The script is located at the project root.

### Basic Commands

#### Test All Record Types

```bash
# Dry run (no API calls)
./test-processing-id.sh --dry-run

# Real test (requires API key)
./test-processing-id.sh
```

#### Test Specific Record Types

```bash
# Test memorials only
./test-processing-id.sh --type memorial

# Test burial registers only
./test-processing-id.sh --type register

# Test monument photos only
./test-processing-id.sh --type monument
```

#### Test with Different Providers

```bash
# Test with Anthropic
./test-processing-id.sh --provider anthropic

# Test with Gemini
./test-processing-id.sh --provider gemini
```

#### Verbose Logging

```bash
# Show detailed logs (including [pid:XXXXXXXX] prefixes)
./test-processing-id.sh --verbose
```

### Full Command Syntax

```bash
./test-processing-id.sh [OPTIONS]

OPTIONS:
  -t, --type TYPE       Record type: memorial, register, monument, all (default: all)
  -p, --provider PROV   Provider: openai, anthropic, gemini (default: openai)
  -v, --verbose         Enable verbose logging
  -d, --dry-run         Show commands without running
  -h, --help            Show help message
```

### Example Workflows

**Workflow 1: Test All Types with OpenAI**

```bash
# Preview what will happen
./test-processing-id.sh --dry-run

# Actually run the test
./test-processing-id.sh --verbose
```

**Workflow 2: Test Memorials with Anthropic**

```bash
./test-processing-id.sh --type memorial --provider anthropic --verbose
```

**Workflow 3: Quick Test Without Details**

```bash
./test-processing-id.sh --type register
```

## Manual Testing

If you prefer to manually test without the helper script:

### Option 1: Copy to Temporary Directory

```bash
# Create temp test directory
mkdir -p /tmp/textharvester-test
cd /tmp/textharvester-test

# Copy sample files from project
cp ~/projects/textharvester-web/sample_data/source_sets/memorials/page_5.jpg memorial_test.jpg
cp ~/projects/textharvester-web/sample_data/source_sets/burial_registers/register_book1.jpg register_test.jpg
cp ~/projects/textharvester-web/sample_data/source_sets/monument_photos/ducltf-0420.jpg monument_test.jpg

# Process files from project root
cd ~/projects/textharvester-web

node bin/textharvester ingest /tmp/textharvester-test/memorial_test.jpg \
  --source-type monument_photo --verbose

node bin/textharvester ingest /tmp/textharvester-test/register_test.jpg \
  --source-type burial_register --verbose

node bin/textharvester ingest /tmp/textharvester-test/monument_test.jpg \
  --source-type monument_photo --verbose
```

### Option 2: Use test_inputs Directory

```bash
# Copy to project test directory
cp sample_data/source_sets/memorials/*.jpg sample_data/test_inputs/
cp sample_data/source_sets/burial_registers/*.jpg sample_data/test_inputs/

# Process from test_inputs (can be regenerated anytime)
node bin/textharvester ingest sample_data/test_inputs/page_5.jpg \
  --source-type monument_photo
```

**Note:** If test_inputs files are deleted after processing, regenerate from source_sets anytime.

## Verification Methods

### Method 1: Query the Database Directly

After processing, verify processing_id was stored:

```bash
# Memorials
sqlite3 data/memorials.db \
  "SELECT id, file_name, processing_id FROM memorials ORDER BY id DESC LIMIT 1;"

# Burial Registers
sqlite3 data/memorials.db \
  "SELECT id, file_name, processing_id FROM burial_register_entries ORDER BY id DESC LIMIT 1;"

# Grave Cards
sqlite3 data/memorials.db \
  "SELECT id, file_name, processing_id FROM grave_cards ORDER BY id DESC LIMIT 1;"
```

### Method 2: Use CLI to Query Results

```bash
# Show last processed record
node bin/textharvester query list --limit 1

# Show with full details
node bin/textharvester query list --limit 1 --output table
```

### Method 3: Check Logs for [pid:] Prefix

When running with `--verbose`, look for the scoped logger prefix:

```
[INFO] [pid:4cb97918] Processing file: memorial_test.jpg
[INFO] [pid:4cb97918] Extracting text from image...
[INFO] [pid:4cb97918] OCR response validated successfully
[INFO] [pid:4cb97918] Memorial stored in database with ID: 42
```

All logs from a single file processing share the same `[pid:XXXXXXXX]` prefix, making it easy to trace the entire processing chain for that file.

### Method 4: Export to CSV and Inspect

```bash
# Export memorials with processing_id column
node bin/textharvester export memorials --output memorials.csv

# Check if processing_id column is present
head -1 memorials.csv | tr ',' '\n' | grep -n processing_id

# View specific record
grep "test" memorials.csv | cut -d, -f1,5,21  # Adjust column numbers as needed
```

## What to Expect

### Successful Test Output

```
✓ Copied memorial image
✓ Copied burial register image
✓ Copied monument photo

✓ Ingestion completed

✓ Check above for processing_id (UUID format)

╔══════════════════════════════════════════════════════════════╗
║ Test Summary                                                 ║
╚══════════════════════════════════════════════════════════════╝

✓ Test completed successfully!
ℹ processing_id feature verified in database
ℹ Original sample data preserved in sample_data/source_sets
```

### Expected Database Output

```
id          file_name               processing_id
──────────  ──────────────────────  ────────────────────────────────────────
42          memorial_test.jpg       4cb97918-9a46-437a-b1a0-cf18b6340cd1
43          register_test.jpg       550e8400-e29b-41d4-a716-446655440000
44          monument_test.jpg       12345678-1234-4567-8901-234567890abc
```

### Expected Log Output (Verbose Mode)

```
[INFO] [pid:4cb97918] Processing file: memorial_test.jpg
[INFO] [pid:4cb97918] Extracting text from image...
[DEBUG] [pid:4cb97918] API call took 1234ms
[INFO] [pid:4cb97918] OCR response validated successfully
[INFO] [pid:4cb97918] Memorial stored in database with ID: 42
[INFO] [pid:4cb97918] Cleaned up processed file: /tmp/textharvester-test-xxx/memorial_test.jpg
```

## Troubleshooting

### Problem: Script Not Found

**Error:** `command not found: ./test-processing-id.sh`

**Solution:**
```bash
# Make sure you're in the project root
cd ~/projects/textharvester-web

# Make script executable
chmod +x test-processing-id.sh

# Run it
./test-processing-id.sh
```

### Problem: No API Key Configured

**Error:** `Error: OpenAI API key not found`

**Solution:**

Option 1: Set environment variable
```bash
export OPENAI_API_KEY="sk-..."
./test-processing-id.sh
```

Option 2: Use dry-run to preview without API calls
```bash
./test-processing-id.sh --dry-run
```

Option 3: Use different provider with configured key
```bash
./test-processing-id.sh --provider anthropic
```

### Problem: Database File Not Found

**Error:** `Error opening database`

**Solution:**

Initialize the database first:
```bash
npm run init-db
./test-processing-id.sh
```

### Problem: Sample Data Files Missing

**Error:** `No such file or directory: sample_data/source_sets/memorials/page_5.jpg`

**Solution:**

Check that you're in the project root:
```bash
ls sample_data/source_sets/  # Should list: memorials, monument_photos, burial_registers, grave_cards
```

If missing, clone the sample data from another branch or download from source.

### Problem: Permission Denied

**Error:** `permission denied: ./test-processing-id.sh`

**Solution:**
```bash
chmod +x test-processing-id.sh
./test-processing-id.sh
```

### Problem: No Records Stored

**Error:** Query returns no results after processing

**Possible Causes:**

1. **API call failed** — Check console output for API errors
2. **Validation failed** — Check logs for validation errors
3. **Database issue** — Verify database is writable: `ls -l data/memorials.db`

**Debugging:**
```bash
# Run with verbose logging
./test-processing-id.sh --verbose

# Check logs directly
cat logs/combined.log | tail -50

# Verify database accessibility
sqlite3 data/memorials.db "SELECT COUNT(*) FROM memorials;"
```

## Advanced Testing

### Test Across Multiple Providers

```bash
# Compare processing_id consistency across providers
./test-processing-id.sh --type memorial --provider openai
./test-processing-id.sh --type memorial --provider anthropic

# Each should have its own unique processing_id
sqlite3 data/memorials.db \
  "SELECT file_name, ai_provider, processing_id FROM memorials ORDER BY id DESC LIMIT 2;"
```

### Batch Test with Logging

```bash
# Capture full output to file for analysis
./test-processing-id.sh --verbose > test_run_$(date +%s).log 2>&1

# Review the log
cat test_run_*.log | grep "\[pid:"
```

### Monitor Real-Time Logs

In one terminal:
```bash
# Watch logs as they're written
tail -f logs/combined.log | grep "\[pid:"
```

In another terminal:
```bash
./test-processing-id.sh --verbose
```

## Reference: processing_id Implementation

### What Gets Tested

✅ **UUID Generation** — Each file gets a unique UUIDv4
✅ **Scoped Logging** — All logs prefixed with `[pid:XXXXXXXX]`
✅ **Database Storage** — processing_id persisted in all 3 tables
✅ **Frontend Display** — processing_id visible in detail views
✅ **CSV Export** — processing_id included in exports

### Files Modified (Issue #127)

- `src/utils/fileProcessing.js` — UUID generation & scoped logging
- `src/utils/database.js` — Schema & migrations
- `src/utils/burialRegisterStorage.js` — Storage layer
- `src/utils/graveCardStorage.js` — Grave card storage
- `public/js/modules/results/main.js` — Frontend display
- `src/controllers/resultsManager.js` — CSV export

### Related Documentation

- [Implementation Details](./ARCHITECTURE.md)
- [Database Schema](../src/utils/database/schema.js)

## Getting Help

For issues with the test script or processing_id feature:

1. Check the troubleshooting section above
2. Review logs with `tail -f logs/combined.log`
3. Run with `--verbose` flag for detailed output
4. Check [GitHub Issues](https://github.com/donalotiarnaigh/textharvester-web-public/issues)

## Summary

The `test-processing-id.sh` script provides a safe, repeatable way to test the processing_id feature:

| Aspect | Benefit |
|--------|---------|
| **Sample Data Protection** | Originals never touched, only copies processed |
| **Repeatability** | Can run infinite tests by regenerating from source_sets |
| **Verification** | Automatic database queries confirm processing_id storage |
| **Flexibility** | Test individual record types or all at once |
| **Debugging** | Verbose mode shows [pid:] prefix in all logs |

Start with `./test-processing-id.sh --dry-run` to preview, then `./test-processing-id.sh` for real testing!
