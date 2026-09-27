/**
 * Query Command Module
 * Placeholder for Task 1.2
 * 
 * Will be fully implemented in Task 8.2.
 */

const { Command } = require('commander');
const { loadConfig } = require('../config');
const { configureLogger } = require('../logger');
const QueryService = require('../../services/QueryService');
const { formatOutput, formatError } = require('../output');

const query = new Command('query')
  .description('Query and search processed records');

// list subcommand
query
  .command('list')
  .description('List processed records')
  .option('-t, --source-type <type>', 'Filter by source type')
  .option('-l, --limit <n>', 'Maximum records to return', '50')
  .option('-o, --offset <n>', 'Offset for pagination', '0')
  .option('--needs-review', 'Show only records flagged for review')
  .action(async (options, command) => {
    try {
      const optsWithGlobals = command.optsWithGlobals();
      const config = await loadConfig(optsWithGlobals);
      configureLogger(config);

      const monumentClassificationStorage = require('../../utils/monumentClassificationStorage');
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
        },
        monumentClassifications: {
          getAll: monumentClassificationStorage.getAllClassifications,
          getById: monumentClassificationStorage.getClassificationById
        }
      };

      const service = new QueryService(config, storageAdapters);

      // Coerce limit/offset to numbers; pass needsReview flag
      const queryOptions = {
        ...options,
        limit: options.limit ? parseInt(options.limit, 10) : 50,
        offset: options.offset ? parseInt(options.offset, 10) : 0,
        needsReview: Boolean(options.needsReview)
      };

      // Default source type if not provided? Service handles validation if missing.
      // But let's check if we want a default here or let service fail.
      // Requirements say "Filter by source type", implying it might be optional?
      // QueryService.list implementation: `const { sourceType... } = options;`
      // `_getCachedOrFetch(sourceType)` -> `getStorageForType(sourceType)` -> throws INVALID_SOURCE_TYPE if missing.
      // So sourceType IS required by the service currently.
      // We should probably default it or require it. The help text says option.
      // Let's default to 'memorial' if not provided, similar to ingest? 
      // Or require user to specify.
      if (!queryOptions.sourceType) {
        queryOptions.sourceType = 'memorial';
      }

      const result = await service.list(queryOptions);

      formatOutput(result, 'query list', options);
    } catch (error) {
      formatError(error);
      process.exit(1);
    }
  });

// get subcommand
query
  .command('get <id>')
  .description('Get a single record by ID')
  .option('-t, --source-type <type>', 'Source type of the record')
  .action(async (id, options, command) => {
    try {
      const optsWithGlobals = command.optsWithGlobals();
      const config = await loadConfig(optsWithGlobals);
      configureLogger(config);

      const monumentClassificationStorage = require('../../utils/monumentClassificationStorage');
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
        },
        monumentClassifications: {
          getAll: monumentClassificationStorage.getAllClassifications,
          getById: monumentClassificationStorage.getClassificationById
        }
      };

      const service = new QueryService(config, storageAdapters);

      // Default source type if missing
      const sourceType = options.sourceType || 'memorial';

      const result = await service.get(id, sourceType);

      formatOutput(result, 'query get', options);
    } catch (error) {
      formatError(error);
      process.exit(1);
    }
  });

// search subcommand
query
  .command('search <query>')
  .description('Search records by text')
  .option('-t, --source-type <type>', 'Filter by source type')
  .option('-y, --year <year>', 'Filter by year')
  .option('-l, --limit <n>', 'Maximum records to return', '50')
  .action(async (searchQuery, options, command) => {
    try {
      const optsWithGlobals = command.optsWithGlobals();
      const config = await loadConfig(optsWithGlobals);
      configureLogger(config);

      const monumentClassificationStorage = require('../../utils/monumentClassificationStorage');
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
        },
        monumentClassifications: {
          getAll: monumentClassificationStorage.getAllClassifications,
          getById: monumentClassificationStorage.getClassificationById
        }
      };

      const service = new QueryService(config, storageAdapters);
      const result = await service.search(searchQuery, options);

      formatOutput(result, 'query search', options);
    } catch (error) {
      formatError(error);
      process.exit(1);
    }
  });

module.exports = query;
