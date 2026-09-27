# TextHarvester CLI Implementation Plan

This implementation plan follows Test-Driven Development (TDD): write tests first (RED), implement to pass (GREEN), then refactor (REFACTOR). All unit tests for both happy and unhappy paths are **required**; integration/E2E tests marked with `*` are optional.

---

## Phase 1: Foundation

- [ ] 1. Project setup and CLI entry point
  - [x] 1.1 Write tests for CLI entry point
    - **Happy path**: `--version` returns version, `--help` lists commands, unknown command shows error
    - **Unhappy path**: Invalid global options exit with code 1, conflicting flags (-q/-v) rejected
    - _Requirements: 8.1, 8.2, 5.4_
  - [x] 1.2 Implement CLI entry point (`bin/textharvester`)
    - Install Commander.js dependency
    - Create `bin/textharvester` with global options (--config, -v, -q, --output)
    - Register placeholder subcommands (ingest, query, export, system)
    - Add `bin` entry to `package.json`
    - _Requirements: 8.1, 8.2_
  - [x] 1.3 Write tests for configuration loading
    - **Happy path**: Load from file, merge with env vars, CLI flags override
    - **Unhappy path**: Missing file, invalid JSON, missing required keys (API key)
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_
  - [x] 1.4 Implement configuration loader (`src/cli/config.js`)
    - Load config.json with fallback to defaults
    - Merge environment variables (OPENAI_API_KEY, etc.)
    - Apply CLI flag precedence
    - Validate required configuration
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_

---

## Phase 2: Output and Error Handling

- [ ] 2. Output formatting and error handling
  - [x] 2.1 Write tests for output formatter
    - **Happy path**: JSON output valid and parseable, table format aligned, CSV format correct
    - **Unhappy path**: Special characters escaped, errors go to stderr, non-TTY detection
    - _Requirements: 8.1, 8.4, 7.4_
  - [x] 2.2 Implement output formatter (`src/cli/output.js`)
    - `formatSuccess(data, command, metadata)` → JSON to stdout
    - `formatError(error)` → JSON to stderr
    - TTY detection for progress/tables
    - _Requirements: 8.1, 8.4, 7.1, 7.4_
  - [x] 2.3 Write tests for CLI error class
    - **Happy path**: CLIError serializes to consistent JSON schema
    - **Unhappy path**: Unknown errors wrapped with INTERNAL_ERROR code, stack trace in details
    - _Requirements: 8.4, 8.5_
  - [x] 2.4 Implement CLI error class (`src/cli/errors.js`)
    - `CLIError` class with code, message, details
    - `toJSON()` method for structured output
    - Error code constants (VALIDATION_ERROR, etc.)
    - _Requirements: 8.4, 8.5_

---

## Phase 3: Service Layer

- [ ] 3. IngestService implementation
  - [x] 3.1 Write tests for IngestService
    - **Happy path**: Single file processed, glob expansion works, batch size respected, provider routing
    - **Unhappy path**: No files matched, invalid source type, unreadable file skipped, API error handling
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_
  - [x] 3.2 Implement IngestService (`src/services/IngestService.js`)
    - `expandPattern(pattern)` - glob expansion with validation
    - `ingest(pattern, options)` - orchestrate processing
    - `processOne(file, options)` - delegate to fileProcessing.js
    - Concurrent batch processing with configurable size
    - Collect successes/failures for structured result
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_
  - [x] 3.3 Refactor IngestService
    - Extract common patterns, optimize performance
    - _Requirements: 1.1, 1.2, 1.3_

- [ ] 4. QueryService implementation
  - [x] 4.1 Write tests for QueryService
    - **Happy path**: List returns records, filter by source type, search finds matches, get returns single record
    - **Unhappy path**: Non-existent ID error, empty DB returns empty array, invalid filter rejected, SQL injection safe
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_
  - [x] 4.2 Implement QueryService (`src/services/QueryService.js`)
    - `list(options)` - query with filters, pagination
    - `get(id, sourceType)` - single record lookup
    - `search(query, options)` - text search across fields
    - Use existing storage modules (memorials, burialRegister, graveCards)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_
  - [x] 4.3 Refactor QueryService
    - Optimize queries, add caching if needed
    - _Requirements: 2.1, 2.2, 2.3_

- [ ] 5. ExportService implementation
  - [x] 5.1 Write tests for ExportService
    - **Happy path**: CSV file created, JSON file valid, stdout output works, filtered export
    - **Unhappy path**: Non-existent dir error, invalid format error, file exists without --force, empty export
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_
  - [x] 5.2 Implement ExportService (`src/services/ExportService.js`)
    - `export(options)` - main export method
    - Reuse `jsonToCsv` and `formatJsonForExport` from dataConversion.js
    - File vs stdout output handling
    - Destination validation (dir exists, file overwrite)
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_
  - [x] 5.3 Refactor ExportService
    - Add streaming for large datasets
    - _Requirements: 3.1, 3.2, 3.3_

- [ ] 6. SystemService implementation
  - [x] 6.1 Write tests for SystemService
    - **Happy path**: init-db creates tables, status returns counts, clear-queue with confirm works
    - **Unhappy path**: Permission denied, missing --confirm flag, unknown subcommand, DB locked
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_
  - [x] 6.2 Implement SystemService (`src/services/SystemService.js`)
    - `initDb()` - create tables if not exist
    - `getStatus()` - return queue length, record counts, timestamps
    - `clearQueue(confirm)` - require confirmation flag
    - Reuse existing storage initialization logic
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_
  - [x] 6.3 Refactor SystemService
    - Error recovery, cleanup handlers
    - _Requirements: 4.1, 4.2, 4.3_

---

## Phase 4: CLI Commands

- [ ] 7. Ingest command
  - [x] 7.1 Write tests for ingest command
    - **Happy path**: Command parses args correctly, calls IngestService, outputs JSON result
    - **Unhappy path**: Missing required args, invalid options, service errors formatted correctly
    - _Requirements: 1.1, 1.2, 1.3, 8.1, 8.3_
  - [x] 7.2 Implement ingest command (`src/cli/commands/ingest.js`)
    - Parse options: --source-type, --provider, --batch-size, --replace
    - Validate inputs, call IngestService
    - Format output with progress (if TTY) or JSON
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_

- [ ] 8. Query command
  - [x] 8.1 Write tests for query command
    - **Happy path**: `list`, `get <id>`, `search` subcommands work correctly
    - **Unhappy path**: Invalid ID format, missing search term, service errors surfaced
    - _Requirements: 2.1, 2.2, 2.3, 8.1, 8.3_
  - [x] 8.2 Implement query command (`src/cli/commands/query.js`)
    - Factory/Service instantiation
    - `list`, `get`, `search` action handlers
    - Format output using `formatOutput`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7_

- [ ] 9. Export command
  - [ ] 9.1 Write tests for export command
    - **Happy path**: --format and --destination parsed, service called, output written
  - [x] 9.1 Write tests for export command
    - **Happy path**: JSON/CSV export, local file writing, stdout output
    - **Unhappy path**: File exists/permission errors, invalid format
    - _Requirements: 6.1, 6.2, 6.3, 8.1, 8.3_
  - [x] 9.2 Implement export command (`src/cli/commands/export.js`)
    - Parse options: --format, --destination, --source-type, --force
    - Call ExportService, handle file/stdout
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

- [ ] 10. System command
  - [x] 10.1 Write tests for system command
    - **Happy path**: Subcommands (init-db, status, clear-queue) route correctly
    - **Unhappy path**: Unknown subcommand error, missing --confirm
    - _Requirements: 4.1, 4.2, 4.3, 8.1, 8.3_
  - [x] 10.2 Implement system command (`src/cli/commands/system.js`)
    - Subcommands: init-db, status, clear-queue
    - Parse options: --confirm
    - Call SystemService, format output
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

---

## Phase 5: Logging and Progress

- [ ] 11. Logging system
  - [x] 11.1 Write tests for CLI logger
    - **Happy path**: Verbosity levels (-v, -vv) produce correct output, --debug-api logs payloads
    - **Unhappy path**: Conflicting -q/-v rejected, log file errors handled gracefully
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_
  - [x] 11.2 Implement CLI logger (`src/cli/logger.js`)
    - Integrate with existing logger.js
    - Verbosity level handling (0=quiet, 1=info, 2=debug)
    - --debug-api payload logging
    - JSON log format option (Note: JSON format not explicitly in logger.js yet but payload logging is supported)
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_

- [ ] 12. Progress reporting
  - [x] 12.1 Write tests for progress reporter
    - **Happy path**: Progress bar updates, spinner animates, summary displayed
    - **Unhappy path**: Non-TTY uses simple output, SIGINT shows partial summary
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_
  - [x] 12.2 Implement progress reporter (`src/cli/progress.js`)
    - Progress bar for batch operations (use cli-progress or ora)
    - TTY detection for animations
    - Batch summary on completion
    - SIGINT handler for graceful shutdown
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_

---

## Phase 6: Integration and Verification

- [ ] 13. Web controller refactoring
  - [x] 13.1 Refactor resultsManager to use QueryService
    - Extract query logic to QueryService
    - resultsManager calls service, formats HTTP response
    - Verify existing tests still pass
    - _Requirements: Backward compatibility_
  - [x] 13.2 Refactor uploadHandler to use IngestService
    - Extract ingestion logic to IngestService
    - uploadHandler calls service, formats HTTP response
    - Verify existing tests still pass
    - _Requirements: Backward compatibility_

- [ ]* 14. Integration tests
  - [x]* 14.1 CLI integration tests
    - Full ingest → query → export pipeline via CLI
    - Test with real files and database
    - _Requirements: All_
  - [ ]* 14.2 Cross-platform verification
    - Test on macOS, Linux
    - Verify TTY detection works correctly
    - _Requirements: 7.4_

- [ ] 15. Documentation and cleanup
  - [x] 15.1 Update package.json
    - Add `bin` entry for `th` command
    - Add any new dependencies (commander, cli-progress, ora)
    - Add CLI-related npm scripts
    - _Requirements: All_
  - [x] 15.2 Create CLI documentation
    - Update README.md with CLI usage
    - Create `docs/cli/usage.md` with examples
    - Document all commands, options, and exit codes
    - _Requirements: 8.2_
  - [x] 15.3 Final verification
    - Run full test suite (`npm test`)
    - Run linting (`npm run lint`)
    - Manual CLI testing for each command
    - _Requirements: All_

---

## Task Summary

| Phase | Tasks | Unit Tests Required | Integration Tests* |
|-------|-------|---------------------|-------------------|
| 1. Foundation | 4 | 4 | - |
| 2. Output/Errors | 4 | 4 | - |
| 3. Services | 12 | 8 | - |
| 4. Commands | 8 | 8 | - |
| 5. Logging/Progress | 4 | 4 | - |
| 6. Integration | 5 | 2 | 2* |

---

## Phase 7: Comprehensive Testing

- [x] 16. Comprehensive CLI Verification
  - [x] 16.1 Create detailed test plan
  - [x] 16.2 Verify Global Options
  - [x] 16.3 Verify Ingest Command
  - [x] 16.4 Verify Query Command
  - [x] 16.5 Verify Export Command
  - [x] 16.6 Verify System Command

- [x] 17. Pipeline Verification with Sample Data
  - [x] 17.1 Verify Memorial Pipeline
  - [x] 17.2 Verify Burial Register Pipeline
  - [x] 17.3 Verify Grave Card Pipeline

