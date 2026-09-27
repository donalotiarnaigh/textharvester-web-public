# TextHarvester CLI Requirements Document

## Introduction

This document specifies the requirements for a first-class Command Line Interface (CLI) for TextHarvester that offers 100% feature parity with the web application. The CLI will enable "headless" automation, easier batch processing integration, and system administration without requiring a browser or persistent web server.

### Primary Users: AI Agents

**The CLI is designed with AI agents as the primary users.** While human operators can use the CLI directly, the majority of users will interface with TextHarvester through an AI proxy agent using natural language. This design philosophy has important implications:

- **Structured Output First**: Machine-parseable output (JSON) is the default; human-readable formatting is opt-in
- **Predictable Behavior**: Consistent exit codes, error formats, and output schemas enable reliable agent orchestration
- **Self-Documenting**: Commands include `--help` with examples that AI agents can parse to understand usage
- **Idempotent Operations**: Where possible, operations are safe to retry without side effects
- **Clear Error Messages**: Error output follows a consistent structure that agents can parse and act upon

### Key Use Cases

The CLI addresses several key use cases:
- **AI Agent Orchestration**: AI coding assistants and automation agents can invoke TextHarvester commands and parse structured results
- **Batch Processing**: Process large volumes of images from the command line with glob patterns
- **Pipeline Integration**: Integrate TextHarvester into automated workflows and CI/CD pipelines
- **System Administration**: Manage database, queues, and exports without a browser
- **Developer Experience**: Debug and test processing with verbose logging and API introspection

The CLI will be a single Node.js entry point (`bin/textharvester`) with subcommands corresponding to the major domains: ingestion (upload), processing (queue), querying (results), exporting (downloads), and system maintenance.

---

## Requirements

### Requirement 1: File Ingestion

**User Story:** As a data processing operator, I want to process files from the command line with glob patterns, so that I can batch-process large volumes of images without a web browser.

#### Acceptance Criteria

**Happy Path:**
1. WHEN the user runs `th ingest ./scans/*.jpg --source-type memorial` THEN the system SHALL read all matching files and process them through the OCR pipeline
2. IF the user specifies `--provider anthropic` THEN the system SHALL route all processing to the Anthropic API instead of OpenAI
3. WHEN the user ingests files with `--batch-size 5` THEN the system SHALL process up to 5 files concurrently and display progress for each

**Unhappy Path:**
4. WHEN the user provides a path that matches no files (e.g., `./nonexistent/*.jpg`) THEN the system SHALL exit with error code 1 and display "No files matched the pattern: ./nonexistent/*.jpg"
5. WHEN the user specifies an invalid `--source-type` value THEN the system SHALL exit with error code 1 and list valid source types (memorial, burial_register, grave_record_card)
6. IF the AI provider API returns an error (rate limit, auth failure, server error) THEN the system SHALL log the error details, record the file as failed, continue processing remaining files, and report a summary at completion
7. IF a file is corrupted or unreadable (invalid image format, permission denied) THEN the system SHALL skip the file with an error message and continue processing the rest of the batch

---

### Requirement 2: Query and Results Retrieval

**User Story:** As a researcher, I want to search and filter processed records from the command line, so that I can quickly find specific entries without navigating the web UI.

#### Acceptance Criteria

**Happy Path:**
1. WHEN the user runs `th query list --source-type memorial --limit 50` THEN the system SHALL display the 50 most recent memorial records in a formatted table
2. IF the user runs `th query search "Smith" --year 1850` THEN the system SHALL return all records where any text field contains "Smith" and year_of_death is 1850
3. WHEN the user runs `th query get <id>` THEN the system SHALL display the full details of the record with that ID in a formatted output

**Unhappy Path:**
4. WHEN the user queries with a non-existent ID (`th query get 999999`) THEN the system SHALL exit with error code 1 and display "Record not found: 999999"
5. WHEN the database is empty or no records match the filter THEN the system SHALL display "No records found matching criteria" and exit with code 0
6. IF the database file is missing or corrupted THEN the system SHALL exit with error code 1 and display "Database error: <specific error message>"
7. IF the user provides an invalid filter parameter (e.g., `--year abc`) THEN the system SHALL exit with error code 1 and display "Invalid value for --year: expected integer, got 'abc'"

---

### Requirement 3: Data Export

**User Story:** As an archivist, I want to export processed data in multiple formats from the command line, so that I can integrate the extracted text into other systems and create deliverables.

#### Acceptance Criteria

**Happy Path:**
1. WHEN the user runs `th export --format csv --destination ./output.csv` THEN the system SHALL write all records to the specified CSV file with appropriate headers
2. IF the user specifies `--source-type grave_record_card --format json` THEN the system SHALL export only grave card records in JSON format
3. WHEN the user runs `th export --format csv` without `--destination` THEN the system SHALL write the CSV content to stdout for piping to other tools

**Unhappy Path:**
4. WHEN the destination directory does not exist (e.g., `--destination ./nonexistent/output.csv`) THEN the system SHALL exit with error code 1 and display "Directory does not exist: ./nonexistent"
5. WHEN the user specifies an unsupported format (e.g., `--format xml`) THEN the system SHALL exit with error code 1 and list valid formats (csv, json)
6. IF the destination file already exists and `--force` is not provided THEN the system SHALL prompt for confirmation or exit with error code 1 in non-interactive mode
7. IF there are no records to export THEN the system SHALL exit with code 0 and display "No records to export for the specified criteria"

---

### Requirement 4: System Administration

**User Story:** As a system administrator, I want to manage the TextHarvester database and processing queue from the command line, so that I can maintain the system without accessing a web interface.

#### Acceptance Criteria

**Happy Path:**
1. WHEN the user runs `th system init-db` THEN the system SHALL create all required database tables if they don't exist and display "Database initialized successfully"
2. IF the user runs `th system status` THEN the system SHALL display current queue length, database record counts by source type, and last processing timestamp
3. WHEN the user runs `th system clear-queue` THEN the system SHALL remove all pending items from the processing queue and display the count of removed items

**Unhappy Path:**
4. WHEN `th system init-db` fails due to file permissions THEN the system SHALL exit with error code 1 and display "Database initialization failed: Permission denied for ./data/memorials.db"
5. WHEN the user runs `th system clear-queue` with `--confirm` missing in non-interactive mode THEN the system SHALL exit with error code 1 and display "Destructive operation requires --confirm flag"
6. IF a system operation is interrupted (SIGINT) THEN the system SHALL perform cleanup, log the interruption, and exit with code 130
7. IF the user runs an unknown system subcommand THEN the system SHALL exit with error code 1 and list available system commands

---

### Requirement 5: Logging and Debugging

**User Story:** As a developer debugging AI prompts, I want detailed logging including full API request/response bodies, so that I can troubleshoot extraction issues and tune prompts effectively.

#### Acceptance Criteria

**Happy Path:**
1. WHEN the user runs any command with `-v` (verbose) THEN the system SHALL display progress steps, file names, and token usage summaries on stderr
2. IF the user runs with `-vv` (debug) THEN the system SHALL additionally display internal function calls, DB query parameters, and configuration resolution logs
3. WHEN the user specifies `--debug-api` THEN the system SHALL print full JSON request bodies sent to AI providers and their raw responses to stderr

**Unhappy Path:**
4. WHEN the user combines conflicting flags (`-q` and `-v`) THEN the system SHALL exit with error code 1 and display "Conflicting options: --quiet and --verbose cannot be used together"
5. WHEN log output would exceed terminal width or be excessively long THEN the system SHALL truncate with "... [truncated, use --log-file for full output]"
6. IF the user specifies `--log-format json` with invalid JSON-incompatible terminal encoding THEN the system SHALL fall back to text format and warn "JSON log format requires UTF-8 output; falling back to text"
7. IF logging to a file fails (permission denied, disk full) THEN the system SHALL warn on stderr and continue without file logging

---

### Requirement 6: Configuration Management

**User Story:** As a power user, I want to configure TextHarvester via config files, environment variables, and CLI flags with clear precedence, so that I can set up the tool for different environments and use cases.

#### Acceptance Criteria

**Happy Path:**
1. WHEN the user specifies `--config ./custom-config.json` THEN the system SHALL load configuration from that file instead of the default `./config.json`
2. IF environment variable `OPENAI_API_KEY` is set THEN the system SHALL use that for OpenAI API authentication without requiring it in the config file
3. WHEN both `--config` file and CLI flags are provided THEN the system SHALL apply precedence: CLI flags > environment variables > config file > defaults

**Unhappy Path:**
4. WHEN the specified config file does not exist (e.g., `--config ./missing.json`) THEN the system SHALL exit with error code 1 and display "Config file not found: ./missing.json"
5. WHEN the config file contains invalid JSON THEN the system SHALL exit with error code 1 and display "Invalid JSON in config file: <parse error at line:column>"
6. IF required configuration (API key for selected provider) is missing THEN the system SHALL exit with error code 1 and display "Missing required configuration: OPENAI_API_KEY. Set via environment variable or in config file."
7. IF config file contains unknown/deprecated keys THEN the system SHALL warn about unknown keys but continue execution with valid configuration

---

### Requirement 7: Progress and Status Reporting

**User Story:** As a user running batch processing, I want real-time progress indicators and clear status reporting, so that I can monitor long-running operations and estimate completion time.

#### Acceptance Criteria

**Happy Path:**
1. WHEN processing multiple files THEN the system SHALL display a progress bar showing completed/total files, current file name, and estimated time remaining
2. IF the terminal supports ANSI escape codes THEN the system SHALL display an animated spinner and color-coded success/failure indicators
3. WHEN batch processing completes THEN the system SHALL display a summary: "Processed X files: Y successful, Z failed, W skipped. Total time: MM:SS"

**Unhappy Path:**
4. WHEN the output is piped to a file or non-TTY THEN the system SHALL omit progress bar animations and use simple line-by-line updates
5. WHEN a file fails during processing THEN the system SHALL display the failure inline, continue processing, and include the file in the final failure count
6. IF the user presses Ctrl+C (SIGINT) during processing THEN the system SHALL display partial progress summary, save any completed results, and exit with code 130
7. IF all files in a batch fail THEN the system SHALL exit with error code 1 and display descriptive error summary for each failure category

---

### Requirement 8: AI Agent Compatibility

**User Story:** As an AI coding agent, I want structured, machine-parseable output and predictable command behavior, so that I can reliably orchestrate TextHarvester operations on behalf of human users using natural language.

#### Acceptance Criteria

**Happy Path:**
1. WHEN any command runs with `--output json` (or by default) THEN the system SHALL emit valid JSON to stdout with a consistent schema including `success`, `data`, and `error` fields
2. IF an AI agent runs `th --help` or `th <command> --help` THEN the system SHALL display structured help text with command descriptions, all available options, type information, and usage examples
3. WHEN a command completes successfully THEN the system SHALL exit with code 0 and emit a JSON response containing the operation result and any relevant metadata (record IDs, counts, timestamps)

**Unhappy Path:**
4. WHEN any command fails THEN the system SHALL exit with a non-zero code and emit a JSON error object to stderr with fields: `error_code` (machine-readable), `message` (human-readable), and `details` (context-specific data)
5. WHEN an agent provides malformed arguments THEN the system SHALL return a structured error response listing the invalid arguments and their expected types/values
6. IF an operation is partially successful (some files processed, some failed) THEN the system SHALL exit with code 0, include both `successes` and `failures` arrays in the response, and set a `partial` flag to true
7. IF the command requires interactive input but stdin is not a TTY THEN the system SHALL fail fast with error code 1 and message "Interactive input required; use --confirm flag or provide all required arguments"
