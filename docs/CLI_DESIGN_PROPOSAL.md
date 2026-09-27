# TextHarvester CLI Design Proposal

## 1. Vision
To provide a first-class Command Line Interface (CLI) for TextHarvester that offers 100% feature parity with the web application. The CLI will enable "headless" automation, easier batch processing integration, and system administration without requiring a browser or persistent web server.

## 2. Core Command Structure
The CLI will be a single binary/script (e.g., `textharvester` or `th`) with subcommands corresponding to the major domains of the application.

### Global Options
- `--config <path>`: Path to config file (default: `./config.json`)
- `--verbose, -v`: Enable detailed info logging. Use `-vv` for debug logging.
- `--quiet, -q`: Suppress non-error output.
- `--log-format <text|json>`: Output format. JSON is useful for piping to other tools.
- `--debug-api`: Print full raw request/response payloads from AI providers.

### Logging Strategy
Verbose logging is a critical feature for an AI pipeline tool. The CLI will support:
- **Standard (`-v`)**: Progress steps, file names, token usage summaries.
- **Debug (`-vv`)**: Internal function calls, DB query params, configuration resolution.
- **API Debug (`--debug-api`)**: Full JSON bodies of requests to OpenAI/Anthropic and their raw responses. Critical for prompt tuning.
- **Structured Logging (`--log-format json`)**: Emits one JSON object per log line, allowing aggregation by external tools (e.g., `jq`, CloudWatch).

### Commands

#### 1. Ingest (Inputs)
Replicates the "Upload" functionality.
```bash
# Process a single file or glob of files
th ingest <path> --source-type <type> [options]

# Examples
th ingest ./scans/*.jpg --source-type record_sheet --provider openai
th ingest ./register.pdf --source-type burial_register --volume-id vol1
th ingest ./cards.pdf --source-type grave_record_card
```
**Options:**
- `--provider`: AI provider (openai, anthropic) [default: openai]
- `--prompt-template`: Custom template name [default: based on source]
- `--replace`: Replace existing records if found [default: false]
- `--batch-size`: Number of concurrent uploads [default: 3]

#### 2. Process (Queue Management)
Replicates the background processing and queue management.
*Note: In CLI mode, `ingest` effectively runs processing immediately unless a "daemon" mode is implemented. For parity, we can offer a command to run the worker loop if files are manually placed in a staging area.*
```bash
# Run the worker to process any pending files in the queue/folder
th process start

# Check status
th process status
```

#### 3. Query (Results)
Replicates the "Results" page and filtering.
```bash
# List all processed records
th query list --source-type memorial --limit 50

# Get specific record
th query get <id>

# Search/Filter
th query search "Smith" --year 1850
```

#### 4. Export (Downloads)
Replicates the "Download JSON/CSV" functionality.
```bash
# Export to standard out or file
th export --format <csv|json> --destination ./output.csv

# Export specific source type
th export --source-type grave_record_card --format csv
```

#### 5. System (Maintenance)
Replicates the various scripts in `scripts/`.
```bash
th system init-db
th system clear-queue
th system migrate <migration-name>
```

## 3. Web vs. CLI Parity Assessment

| Web Feature | Proposed CLI Command | Parity Feasibility | Implementation Notes |
|-------------|----------------------|--------------------|----------------------|
| **File Upload** | `th ingest <files...>` | **High (100%)** | Can reuse `fileQueue.js` and `processFile`. CLI is actually better for bulk local files (glob support). |
| **Provider Selection** | `--provider <name>` | **High (100%)** | Already supported in `processFile` options. |
| **Progress Bar** | Termial Progress Bar | **High (100%)** | Use `cli-progress` to visualize `queueMonitor` stats. |
| **Results Table** | `th query list` | **Medium** | rich terminal tables (via `cli-table3`) can show data, but interactive sorting/filtering is harder. |
| **Search/Filter** | `th query search` | **High** | SQL allows this easily. Arguments naturally map to SQL `WHERE` clauses. |
| **CSV/JSON Download** | `th export` | **High (100%)** | Reuse `resultsManager.js` logic directly (just write to fs instead of res.send). |
| **Cancel Processing** | `Ctrl+C` / `th process stop` | **High** | `Ctrl+C` is standard. Separate stop command requires shared state (PID file or DB flag). |
| **Config/Settings** | `--flags` | **High** | CLI is arguably better for config via flags/env vars than a web UI. |

## 4. Implementation Strategy

### Architecture
Refactor the codebase to separate "Controller Logic" (HTTP specific) from "Business Logic" (Core functionality).
*   **Current**: `resultsManager.js` handles both DB retrieval *and* HTTP response formatting.
*   **Refactored**: `services/ResultsService.js` handles DB retrieval. `resultsManager.js` calls Service -> sends HTTP. `CLI` calls Service -> prints to stdout.

### Libraries
*   **Commander.js**: For argument parsing.
*   **Inquirer.js**: For interactive prompts (optional, if we want `th interactive`).
*   **Chalk / Ora**: For styling and spinners.

### Steps
1.  **Refactor `processFile`**: Ensure it is completely decoupled from any Express request context (already mostly true).
2.  **Refactor `resultsManager`**: Extract export logic (`jsonToCsv`, DB queries) into reusable functions that return streams/strings, not write to `res`.
3.  **Create Entrypoint**: `bin/textharvester` executable.
4.  **Map Commands**: Implement the commands defined in Section 2 using the refactored services.

## 5. Conclusion
Achieving 100% functional parity is highly feasible. The "visual" parity of the results table is the only gap, but CLI users typically prefer piped output (JSON/CSV) over interactive ASCII tables for complex data. The CLI would actually *exceed* the web app in power for bulk operations and pipeline integration.
