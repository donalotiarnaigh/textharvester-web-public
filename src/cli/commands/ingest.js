/**
 * Ingest Command Module
 * Task 7.2 - Ingest Command Implementation
 */

const { Command } = require('commander');
const { loadConfig } = require('../config');
const { configureLogger } = require('../logger');
const IngestService = require('../../services/IngestService');
const { formatOutput, formatError } = require('../output');
const logger = require('../../utils/logger'); // Assuming logger is needed for service injection if required, or just global config

const ingest = new Command('ingest')
  .description('Ingest files for OCR processing')
  .argument('[pattern]', 'Glob pattern or file path to ingest')
  .option('-t, --source-type <type>', 'Source type: record_sheet, monument_photo, memorial, burial_register, grave_record_card, typographic_analysis, monument_classification') // Removed default to allow config to control, or set default in loadConfig
  .option('-p, --provider <provider>', 'AI provider: openai, anthropic, gemini, mistral')
  .option('-b, --batch-size <size>', 'Number of files to process concurrently', parseInt)
  .option('-r, --replace', 'Replace existing records instead of skipping')
  .option('--schema <idOrName>', 'Use a custom schema for ingestion')
  .action(async (pattern, options, command) => {
    try {
      // 1. Load configuration (merging CLI args, env, defaults)
      // options from commander only include flags. 
      // We pass them to loadConfig to let it merge.
      // Note: loadConfig expects an object where keys match config keys.
      // Commander options might need mapping if names differ, but here they mostly align 
      // (provider, batchSize, sourceType).
      // 'replace' matches 'replaceExisting' in config? Let's check config.js DEFAULTS/structure.
      // config.js doesn't explicitly list all defaults but the Config interface in design.md has 'replaceExisting'.
      // The CLI flag is --replace (-r).

      const optsWithGlobals = command.optsWithGlobals();
      const cliConfig = {
        ...optsWithGlobals,
        // Map --replace to replaceExisting if needed, or just let service handle 'replace' if it uses that.
        // IngestService uses options passed to it.
        // Let's check IngestService implementation or design.
        // Design says: options.batchSize, options.replaceExisting. 
        // CLI options: replace.
        replaceExisting: options.replace,
        schemaId: options.schema
      };

      const finalConfig = await loadConfig(cliConfig);

      // Configure the logger with the final merged configuration
      configureLogger(finalConfig);

      // 2. Instantiate Service
      // IngestService constructor takes (config, logger).
      // We can pass the full merged config.
      const service = new IngestService(finalConfig, logger);

      // 3. Execute
      // We default pattern to something? Design says it's required argument [pattern].
      // If missing, show help? Commander handles mandatory arguments if <> used, but [] is optional.
      // If pattern is missing, maybe error?
      if (!pattern) {
        throw new Error('Missing required argument: pattern');
      }

      console.error(`Ingesting files matching: ${pattern}...`); // Stderr for progress info if not quiet? 
      // Actually output.js/logger handles verbosity.

      const result = await service.ingest(pattern, finalConfig);

      // 4. Output Results
      // Pass the parent command options to formatOutput to respect --output flag
      const globalOpts = command.parent?.opts() || {};

      formatOutput(result, 'ingest', { ...globalOpts });

    } catch (error) {
      formatError(error);
      process.exit(1);
    }
  });

module.exports = ingest;
