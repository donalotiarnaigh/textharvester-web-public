# TextHarvester CLI Usage Guide

The TextHarvester CLI (`th`) provides a powerful interface for OCR processing, data management, and system administration without requiring a web browser. It is designed for both human operators and AI agents.

## Getting Started

The CLI is accessed via the `npm run th` script.

```bash
# Check version
npm run th -- --version

# Display help
npm run th -- --help
```

> **Note**: The `--` separator is required to pass arguments to the CLI instead of npm.

## Global Options

These options apply to all commands:

- `-c, --config <path>`: Path to config file (default: `./config.json`)
- `-v, --verbose`: Enable verbose logging (use `-vv` for debug)
- `-q, --quiet`: Suppress non-error output
- `--output <format>`: Output format: `json` (default), `table`, `csv`
- `--debug-api`: Log full API request/response payloads

## Commands

### `ingest`

Batch process images using OCR.

**Usage**:
```bash
npm run th -- ingest [options] <pattern>
```

**Options**:
- `-s, --source-type <type>`: Source type: `memorial`, `burial_register`, `grave_record_card` (default: "memorial")
- `-p, --provider <provider>`: AI provider: `openai`, `anthropic`
- `-b, --batch-size <number>`: Number of concurrent files to process (default: 3)
- `-r, --replace`: Replace existing records if file already processed

**Examples**:
```bash
# Process all JPGs in a folder using Anthropic
npm run th -- ingest "./scans/*.jpg" --provider anthropic

# Process burial register pages
npm run th -- ingest "./registers/*.jpg" --source-type burial_register
```

### `query`

Search and retrieve processed records.

**Usage**:
```bash
npm run th -- query <command> [options]
```

**Subcommands**:
- `list`: List records with optional filters.
  - Options: `--source-type`, `--limit`, `--offset`
- `get <id>`: Get a single record by ID.
  - Options: `--source-type`
- `search <term>`: Search records for a specific term.
  - Options: `--source-type`

**Examples**:
```bash
# List recent memorial records
npm run th -- query list --limit 10

# Search for "Smith"
npm run th -- query search "Smith"
```

### `export`

Export processed data to files or stdout.

**Usage**:
```bash
npm run th -- export [options]
```

**Options**:
- `-f, --format <format>`: Export format: `json`, `csv` (default: "json")
- `-d, --destination <path>`: Output file path (outputs to stdout if omitted)
- `-s, --source-type <type>`: Filter by source type
- `--force`: Overwrite existing file

**Examples**:
```bash
# Export all data to CSV
npm run th -- export --format csv --destination ./export.csv

# Export specific source type to JSON
npm run th -- export --source-type burial_register --format json --destination ./burials.json
```

### `system`

System administration tasks.

**Usage**:
```bash
npm run th -- system <command> [options]
```

**Subcommands**:
- `init-db`: Initialize database tables.
- `status`: Show system status (queue, counts).
- `clear-queue`: Clear the processing queue.
  - Options: `--confirm` (required)

**Examples**:
```bash
# Check system status
npm run th -- system status
```

## AI Agent Usage

The CLI is optimized for AI agents. By default, or when `--output json` is specified, commands return structured JSON output suitable for machine parsing.

**Success Response**:
```json
{
  "success": true,
  "data": { ... },
  "metadata": {
    "command": "ingest",
    "timestamp": "2023-10-27T10:00:00.000Z"
  }
}
```

**Error Response**:
```json
{
  "success": false,
  "error_code": "FILE_NOT_FOUND",
  "message": "File not found: ./missing.jpg",
  "details": { ... }
}
```

**Exit Codes**:
- `0`: Success (including partial success)
- `1`: Error (validation, system, permissions)
- `130`: Interrupted (SIGINT)
