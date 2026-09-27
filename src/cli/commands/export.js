/**
 * Export Command Module
 * Placeholder for Task 1.2
 * 
 * Will be fully implemented in Task 9.2.
 */

const { Command } = require('commander');
const { loadConfig } = require('../config');
const { configureLogger } = require('../logger');
const ExportService = require('../../services/ExportService');
const QueryService = require('../../services/QueryService');
const { formatOutput, formatError } = require('../output');

const exportCmd = new Command('export')
  .description('Export processed records to file or stdout')
  .option('-f, --format <format>', 'Output format: json, csv', 'json')
  .option('-d, --destination <path>', 'Destination file path (stdout if not specified)')
  .option('-t, --source-type <type>', 'Filter by source type')
  .option('--force', 'Overwrite existing file without confirmation')
  .action(async (options, command) => {
    try {
      const optsWithGlobals = command.optsWithGlobals();
      const config = await loadConfig(optsWithGlobals);
      configureLogger(config);

      const storageAdapters = {
        memorials: {
          getAll: require('../../utils/database').getAllMemorials,
          getById: require('../../utils/database').getMemorialById
        },
        burialRegister: {
          getAll: require('../../utils/burialRegisterStorage').getAllBurialRegisterEntries,
          getById: require('../../utils/burialRegisterStorage').getBurialRegisterEntryById
        },
        graveCards: {
          getAll: require('../../utils/graveCardStorage').getAllGraveCards,
          getById: require('../../utils/graveCardStorage').getGraveCardById
        }
      };

      const queryService = new QueryService(config, storageAdapters);
      const exportService = new ExportService(config, queryService);

      // Default source type if not provided
      const exportOptions = { ...options };
      if (!exportOptions.sourceType) {
        exportOptions.sourceType = 'memorial';
      }

      const result = await exportService.export(exportOptions);

      if (options.destination) {
        // File export: return standard structured success
        formatOutput(result, 'export', options);
      } else {
        // Stdout export: print raw data content
        // result.data contains the JSON string or CSV string
        process.stdout.write(result.data);
      }
    } catch (error) {
      formatError(error);
      process.exit(1);
    }
  });

module.exports = exportCmd;
