# Walkthrough - Phase 4: CLI Integration (User-Extensible Schema)

## Goal
To expose the new user-extensible schema functionality via the CLI, allowing users to propose new schemas from files, list existing schemas, and ingest files using custom schemas.

## Changes

### 1. New `schema` Command
Implemented `src/cli/commands/schema.js` with two subcommands:
- `propose <files...>`: Analyzes example files using `SchemaGenerator` and prompts the user to save the result.
- `list`: Displays a table of all registered custom schemas using `SchemaManager`.

### 2. Updated `ingest` Command
Modified `src/cli/commands/ingest.js` to accept a new `--schema` flag:
- `th ingest <pattern> --schema "My Schema"` checks for the schema ID or name and passes it to the `IngestService`.

### 3. CLI Registration
Registered the new command in `bin/textharvester`.

## Verification Results

### Automated Tests
All unit tests passed, including new tests for the CLI commands.
`npm test` output summary:
- **Pass**: `__tests__/cli/commands/schema.test.js` (Propose & List logic)
- **Pass**: `__tests__/cli/commands/ingest.test.js` (New setup options)
- **Total**: 921 tests passed across the project.

### Manual Verification
Ran the following commands to ensure registration and basic execution:
- `th schema --help` -> Successfully showed help.
- `th schema list` -> Successfully queried the database (returned empty list as expected).

## Usage Examples

**Proposing a new schema:**
```bash
th schema propose ./examples/deeds/*.jpg
```

**Listing schemas:**
```bash
th schema list
```

**Ingesting with a custom schema:**
```bash
th ingest ./scans/*.jpg --schema "Legal Deeds"
```
