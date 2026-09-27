/**
 * System Command Module
 * Placeholder for Task 1.2
 * 
 * Will be fully implemented in Task 10.2.
 */

const { Command } = require('commander');
const { loadConfig } = require('../config');
const { configureLogger } = require('../logger');
const SystemService = require('../../services/SystemService');
const { formatOutput, formatError } = require('../output');

const system = new Command('system')
  .description('System administration commands');

// init-db subcommand
system
  .command('init-db')
  .description('Initialize database tables')
  .action(async (options, command) => {
    try {
      const optsWithGlobals = command.optsWithGlobals();
      const config = await loadConfig(optsWithGlobals);
      configureLogger(config);
      const service = new SystemService(config);
      const result = await service.initDb();
      formatOutput(result, 'system init-db', options);
    } catch (error) {
      formatError(error);
      process.exit(1);
    }
  });

// status subcommand
system
  .command('status')
  .description('Show system status (queue, record counts)')
  .action(async (options, command) => {
    try {
      const optsWithGlobals = command.optsWithGlobals();
      const config = await loadConfig(optsWithGlobals);
      configureLogger(config);
      const service = new SystemService(config);
      const result = await service.getStatus();
      formatOutput(result, 'system status', options);
    } catch (error) {
      formatError(error);
      process.exit(1);
    }
  });

// clear-queue subcommand
system
  .command('clear-queue')
  .description('Clear the processing queue')
  .option('--confirm', 'Confirm destructive operation (required in non-interactive mode)')
  .action(async (options, command) => {
    try {
      const optsWithGlobals = command.optsWithGlobals();
      const config = await loadConfig(optsWithGlobals);
      configureLogger(config);
      const service = new SystemService(config);
      const result = await service.clearQueue(options.confirm);
      formatOutput(result, 'system clear-queue', options);
    } catch (error) {
      formatError(error);
      process.exit(1);
    }
  });

// clear subcommand
system
  .command('clear')
  .description('Clear data from the database')
  .option('-t, --type <type>', 'Data type to clear: memorial, burial_register, grave_record_card, all', 'all')
  .option('--confirm', 'Confirm destructive operation (required)')
  .action(async (options, command) => {
    try {
      const optsWithGlobals = command.optsWithGlobals();
      const config = await loadConfig(optsWithGlobals);
      configureLogger(config);
      const service = new SystemService(config);
      const result = await service.clearData(options.type, options.confirm);
      formatOutput(result, 'system clear', options);
    } catch (error) {
      formatError(error);
      process.exit(1);
    }
  });

// cost subcommand
system
  .command('cost')
  .description('Summarise token usage and estimated spend')
  .option('--from <date>', 'Start date (ISO, inclusive)')
  .option('--to <date>', 'End date (ISO, inclusive)')
  .option('--provider <name>', 'Filter by AI provider name')
  .action(async (options, command) => {
    try {
      const optsWithGlobals = command.optsWithGlobals();
      const config = await loadConfig(optsWithGlobals);
      configureLogger(config);
      const service = new SystemService(config);
      const summary = await service.getCostSummary({
        from:     options.from,
        to:       options.to,
        provider: options.provider
      });
      formatOutput(summary, 'system cost', options);
    } catch (error) {
      formatError(error);
      process.exit(1);
    }
  });

module.exports = system;
