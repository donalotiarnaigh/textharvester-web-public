/**
 * CLI Logger Configuration
 * Placeholder for Task 11.2
 */

const defaultLogger = require('../utils/logger');
const { CLIError } = require('./errors');

function configureLogger(options, logger = defaultLogger) {
  if (options.verbose && options.quiet) {
    throw new CLIError('VALIDATION_ERROR', 'Conflicting options: --quiet and --verbose cannot be used together');
  }

  if (options.verbose) {
    logger.setVerboseMode(true);
  }

  if (options.quiet) {
    logger.setQuietMode(true);
  }

  if (options.debugApi) {
    logger.updateSamplingRates({ payloadLogging: 1.0 });
    logger.setVerboseMode(true); // Ensure verbose is on to see payloads if not implicit
  }

  // Force all logs to stderr to keep stdout clean for JSON output
  // Monkey patch the info method (which normally uses console.log)
  logger.info = function (message, ...args) {
    if (!options.quiet) {
      console.error(`[INFO] ${message}`, ...args);
    }
    // Call original to preserve file logging logic (but we bind it so it might log to console.log again if we call originalInfo... wait)
    // logger.info source:
    // if (!quiet) console.log(...)
    // _writeToLog(...)
    // We want to skip console.log but keep _writeToLog.
    // We can't easily skip just the console.log part without modifying Logger class or duplicating logic.
    // But since we are patching, we can just do:
    this._writeToLog('info', message, args);
  };
}

module.exports = { configureLogger };
