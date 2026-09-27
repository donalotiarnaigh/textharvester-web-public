/**
 * Barrel export for src/utils/
 *
 * Groups all utility modules by category. New code should import from here
 * rather than using deep relative paths, e.g.:
 *
 *   const { logger, database } = require('../utils');
 *
 * This makes future file moves transparent — update the path here, not in
 * every caller.
 *
 * Categories:
 *   Storage       — database tables and persistence
 *   File handling — upload queue, processing pipeline, PDF/image conversion
 *   Parsers       — data parsing and conversion
 *   Validation    — input validation and output quality checks
 *   Retry & errors — retry logic and error classification
 *   Monitoring    — performance tracking, alerts, queue monitoring
 *   Processing    — processing orchestration helpers
 *   Infrastructure — logging, cost, schema, local dev utilities
 */

// Storage
module.exports.database = require('./database');
module.exports.burialRegisterStorage = require('./burialRegisterStorage');
module.exports.graveCardStorage = require('./graveCardStorage');
module.exports.projectStorage = require('./projectStorage');
module.exports.llmAuditLog = require('./llmAuditLog');
module.exports.monumentClassificationStorage = require('./monumentClassificationStorage');

// File handling
module.exports.fileQueue = require('./fileQueue');
module.exports.fileProcessing = require('./fileProcessing');
module.exports.pdfConverter = require('./pdfConverter');
module.exports.conversionTracker = require('./conversionTracker');
module.exports.filenameValidator = require('./filenameValidator');
module.exports.filenameParser = require('./filenameParser');
module.exports.imageProcessor = require('./imageProcessor');

// Parsers
module.exports.historicalDateParser = require('./historicalDateParser');
module.exports.nameProcessing = require('./nameProcessing');
module.exports.standardNameParser = require('./standardNameParser');
module.exports.dataConversion = require('./dataConversion');
module.exports.jsonExtractor = require('./jsonExtractor');
module.exports.burialRegisterFlattener = require('./burialRegisterFlattener');

// Validation & quality
module.exports.dataValidation = require('./dataValidation');
module.exports.apiKeyValidator = require('./apiKeyValidator');
module.exports.responseLengthValidator = require('./responseLengthValidator');
module.exports.degenerateOutputDetector = require('./degenerateOutputDetector');
module.exports.transcriptionAnalysis = require('./transcriptionAnalysis');
module.exports.disagreementScore = require('./disagreementScore');

// Retry & error handling
module.exports.retryHelper = require('./retryHelper');
module.exports.errorTypes = require('./errorTypes');

// Monitoring & tracking
module.exports.performanceTracker = require('./performanceTracker');
module.exports.performanceAlerts = require('./performanceAlerts');
module.exports.queueMonitor = require('./queueMonitor');
module.exports.processingFlag = require('./processingFlag');
module.exports.ProcessingStateManager = require('./ProcessingStateManager');

// Processing helpers
module.exports.processingHelpers = require('./processingHelpers');
module.exports.dynamicProcessing = require('./dynamicProcessing');
module.exports.CompletionVerifier = require('./CompletionVerifier');

// Infrastructure
module.exports.logger = require('./logger');
module.exports.migration = require('./migration');
module.exports.costEstimator = require('./costEstimator');
module.exports.SchemaDDLGenerator = require('./SchemaDDLGenerator');
module.exports.localLauncher = require('./localLauncher');
