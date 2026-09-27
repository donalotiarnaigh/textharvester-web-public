const logger = require('../utils/logger'); // Adjust the path as needed
const config = require('../../config.json'); // Adjust the path as needed
const { jsonToCsv, formatJsonForExport } = require('../utils/dataConversion'); // Adjust path as needed
const moment = require('moment'); // Ensure moment is installed and imported
const { getProcessedResults, getProcessingProgress } = require('../utils/fileQueue.js'); // Adjust the path as needed
const { getAllMemorials, getMemorialById, db } = require('../utils/database');
const { getAllBurialRegisterEntries, getBurialRegisterEntryById } = require('../utils/burialRegisterStorage');
const { getAllGraveCards, getGraveCardById } = require('../utils/graveCardStorage');
const { getAllClassifications, getClassificationById } = require('../utils/monumentClassificationStorage');
const { validateAndConvertRecords } = require('../utils/dataValidation');
const QueryService = require('../services/QueryService');
const SchemaManager = require('../services/SchemaManager');

// Instantiate QueryService
const storageAdapters = {
  memorials: {
    getAll: getAllMemorials,
    getById: getMemorialById
  },
  burialRegister: {
    getAll: getAllBurialRegisterEntries,
    getById: getBurialRegisterEntryById
  },
  graveCards: {
    getAll: getAllGraveCards,
    getById: getGraveCardById
  },
  monumentClassifications: {
    getAll: getAllClassifications,
    getById: getClassificationById
  }
};
const queryService = new QueryService(config, storageAdapters);

// Burial register CSV column order (matches pilot plan format)
const BURIAL_REGISTER_CSV_COLUMNS = [
  'volume_id',
  'page_number',
  'row_index_on_page',
  'entry_id',
  'entry_no_raw',
  'name_raw',
  'abode_raw',
  'burial_date_raw',
  'age_raw',
  'officiant_raw',
  'marginalia_raw',
  'extra_notes_raw',
  'row_ocr_raw',
  'parish_header_raw',
  'county_header_raw',
  'year_header_raw',
  'model_name',
  'model_run_id',
  'uncertainty_flags',
  'file_name',
  'ai_provider',
  'prompt_template',
  'prompt_version',
  'processed_date',
  'confidence_scores',
  'confidence_coverage',
  'needs_review',
  'reviewed_at',
  'validation_warnings',
  'processing_id',
  'project_id'
];

// Memorial CSV column order
const MEMORIAL_CSV_COLUMNS = [
  'memorial_number',
  'first_name',
  'last_name',
  'year_of_death',
  'inscription',
  'transcription_raw',
  'stone_condition',
  'typography_analysis',
  'iconography',
  'structural_observations',
  'notes',
  'site_code',
  'location_rough',
  'image_filename',
  'file_name',
  'ai_provider',
  'model_version',
  'prompt_version',
  'input_tokens',
  'output_tokens',
  'estimated_cost_usd',
  'source_type',
  'processed_date',
  'confidence_scores',
  'confidence_coverage',
  'needs_review',
  'reviewed_at',
  'validation_warnings',
  'processing_id',
  'project_id'
];

// Monument Classification CSV column order
const MONUMENT_CLASSIFICATION_CSV_COLUMNS = [
  'memorial_number',
  'broad_type',
  'detailed_type',
  'memorial_condition',
  'inscription_condition',
  'height_mm',
  'width_mm',
  'depth_mm',
  'material_primary',
  'material_base',
  'orientation',
  'additional_elements',
  'text_panel_shape',
  'text_panel_definition',
  'inscription_technique',
  'letter_style',
  'central_motifs',
  'marginal_motifs',
  'date_of_monument',
  'confidence_level',
  'comments',
  'file_name',
  'ai_provider',
  'prompt_template',
  'prompt_version',
  'processed_date',
  'confidence_scores',
  'needs_review',
  'validation_warnings',
  'processing_id'
];

/**
 * Normalize uncertainty flags for CSV export
 * @param {*} value - Uncertainty flags value (array, string, null, etc.)
 * @returns {string} Normalized uncertainty flags as JSON string
 */
function normalizeUncertaintyFlags(value) {
  if (Array.isArray(value)) {
    return JSON.stringify(value);
  }

  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  return JSON.stringify(value);
}

function getProcessingStatus(req, res) {
  // Use the same logic as getProcessingProgress for consistency
  const progressData = getProcessingProgress();

  // Use errors from progressData which includes conflicts from successful results
  const errors = progressData.errors || [];

  // Return the full progress data including queue metrics for performance widget
  res.json({
    status: progressData.state,
    progress: progressData.progress,
    errors: errors.length > 0 ? errors : undefined,
    queue: progressData.queue, // Include queue data for performance widget
    files: progressData.files,  // Include files data for compatibility
    conversion: progressData.conversion || null // Include conversion data if converting
  });
}

async function downloadResultsJSON(req, res) {
  try {
    // Extract projectId from query if provided
    const projectId = req.query.projectId || null;

    // Detect which source type has the most recent data
    const sourceType = await detectSourceType();

    let validatedResults;
    let defaultFilename;

    if (sourceType === 'burial_register') {
      // Get burial register entries
      const { records } = await queryService.list({ sourceType: 'burial_register', limit: 1000000 });
      const results = records;

      // Transform database field names to match frontend expectations
      const transformedResults = results.map(entry => ({
        ...entry,
        fileName: entry.file_name, // Map file_name to fileName for frontend compatibility
      }));

      // Skip validateAndConvertRecords for burial register entries (already validated on insertion)
      validatedResults = transformedResults;

      // Extract volume_id from first entry if available
      const volumeId = results.length > 0 ? results[0].volume_id : 'all';
      logger.info(`Exporting burial register JSON: ${results.length} entries, volume_id=${volumeId}`);

      // Generate filename
      defaultFilename = `burials_${moment().format('YYYYMMDD_HHmmss')}.json`;
    } else if (sourceType === 'grave_record_card') {
      // Get grave cards
      const { records } = await queryService.list({ sourceType: 'grave_record_card', limit: 1000000, projectId });
      const results = records;

      // Transform and parse data_json
      validatedResults = results.map(card => {
        let cardData = {};
        try {
          if (typeof card.data_json === 'string') {
            cardData = JSON.parse(card.data_json);
          } else {
            cardData = card.data_json || {};
          }
        } catch (e) {
          logger.warn(`Failed to parse data_json for card ID ${card.id}`, e);
        }

        return {
          ...card,
          ...cardData, // Merge card data at top level
          fileName: card.file_name,
          source_type: 'grave_record_card'
        };
      });

      // Generate filename
      defaultFilename = `grave_cards_${moment().format('YYYYMMDD_HHmmss')}.json`;
      logger.info(`Exporting grave cards JSON: ${results.length} entries`);
    } else if (sourceType === 'monument_classification') {
      // Get monument classifications
      const { records } = await queryService.list({ sourceType: 'monument_classification', limit: 1000000, projectId });
      const results = records;

      // Transform and parse data_json
      validatedResults = results.map(classification => {
        let classificationData = {};
        try {
          if (typeof classification.data_json === 'string') {
            classificationData = JSON.parse(classification.data_json);
          } else {
            classificationData = classification.data_json || {};
          }
        } catch (e) {
          logger.warn(`Failed to parse data_json for classification ID ${classification.id}`, e);
        }

        return {
          ...classification,
          ...classificationData, // Merge classification data at top level
          fileName: classification.file_name,
          source_type: 'monument_classification'
        };
      });

      // Generate filename
      defaultFilename = `monuments_${moment().format('YYYYMMDD_HHmmss')}.json`;
      logger.info(`Exporting monument classifications JSON: ${results.length} entries`);
    } else {
      // Get memorials (default)
      const { records } = await queryService.list({ sourceType: 'memorial', limit: 1000000, projectId });
      const results = records;

      // Transform database field names to match frontend expectations
      const transformedResults = results.map(memorial => ({
        ...memorial,
        fileName: memorial.file_name, // Map file_name to fileName for frontend compatibility
      }));

      // Validate and convert data types
      validatedResults = validateAndConvertRecords(transformedResults);

      // Generate filename
      defaultFilename = `memorials_${moment().format('YYYYMMDD_HHmmss')}.json`;
    }

    // Extract filename from query parameters or use a default
    const requestedFilename = req.query.filename
      ? `${sanitizeFilename(req.query.filename)}.json`
      : defaultFilename;

    // Format JSON based on query parameter
    const format = req.query.format === 'pretty' ? 'pretty' : 'compact';
    const jsonData = formatJsonForExport(validatedResults, format);

    res.setHeader('Content-Disposition', `attachment; filename="${requestedFilename}"`);
    res.setHeader('Content-Type', 'application/json');
    res.send(jsonData);

    const entryCount = validatedResults.length;
    logger.info(`Downloaded JSON results as ${requestedFilename} (${format} format, ${entryCount} entries)`);
  } catch (err) {
    logger.error('Error downloading JSON results:', err);
    res.status(500).send('Unable to download results');
  }
}

// Utility function to sanitize filenames (basic example)
function sanitizeFilename(filename) {
  if (!filename) {
    return '_'; // Default value for null or undefined input
  }

  return filename.replace(/[^a-zA-Z0-9_.-]/g, '_');
}

/**
 * Detect which source type has the most recent data by comparing processed_date
 * @returns {Promise<string>} Returns 'burial_register', 'memorial', 'grave_record_card', or 'custom:<schemaId>'
 */
async function detectSourceType() {
  try {
    // Query standard tables for most recent processed_date
    const standardQueries = [
      new Promise(r => db.get('SELECT MAX(processed_date) as max_date FROM memorials', [], (err, row) => r({ type: 'memorial', date: row?.max_date }))),
      new Promise(r => db.get('SELECT MAX(processed_date) as max_date FROM burial_register_entries', [], (err, row) => r({ type: 'burial_register', date: row?.max_date }))),
      new Promise(r => db.get('SELECT MAX(processed_date) as max_date FROM grave_cards', [], (err, row) => r({ type: 'grave_record_card', date: row?.max_date }))),
      new Promise(r => db.get('SELECT MAX(processed_date) as max_date FROM monument_classifications', [], (err, row) => r({ type: 'monument_classification', date: row?.max_date })))
    ];

    // Get all custom schemas and query their tables
    let customSchemaQueries = [];
    try {
      const schemas = await SchemaManager.listSchemas();
      customSchemaQueries = schemas.map(schema => {
        return new Promise(r => {
          // Query the dynamic table for max processed_date
          db.get(`SELECT MAX(processed_date) as max_date FROM "${schema.table_name}"`, [], (err, row) => {
            if (err) {
              // Table might not exist or be empty
              logger.debug(`Custom schema table ${schema.table_name} query failed:`, err.message);
              r({ type: `custom:${schema.id}`, date: null, schemaId: schema.id, schemaName: schema.name });
            } else {
              r({ type: `custom:${schema.id}`, date: row?.max_date, schemaId: schema.id, schemaName: schema.name });
            }
          });
        });
      });
    } catch (schemaErr) {
      logger.debug('Error fetching custom schemas for detection:', schemaErr.message);
    }

    // Run all queries in parallel
    const allQueries = [...standardQueries, ...customSchemaQueries];
    const results = await Promise.all(allQueries);

    // Filter out null dates and sort by date descending
    const validResults = results
      .filter(r => r.date)
      .map(r => ({ ...r, date: new Date(r.date) }))
      .sort((a, b) => b.date - a.date);

    if (validResults.length === 0) {
      return 'memorial'; // Default
    }

    const winner = validResults[0];
    logger.debug(`Source type detection: most recent is ${winner.type} (${winner.date})`);
    return winner.type;
  } catch (error) {
    logger.error('Error in detectSourceType:', error);
    return 'memorial';
  }
}

/**
 * Recursive function to flatten an object
 * @param {Object} obj The object to flatten
 * @param {String} prefix The prefix for current keys
 * @param {Object} res The result object
 * @returns {Object} The flattened object
 */
function flattenObject(obj, prefix = '', res = {}) {
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const val = obj[key];
      const newKey = prefix ? `${prefix}_${key}` : key;
      if (typeof val === 'object' && val !== null) {
        flattenObject(val, newKey, res);
      } else {
        res[newKey] = val;
      }
    }
  }
  return res;
}

async function downloadResultsCSV(req, res) {
  try {
    // Extract projectId from query if provided
    const projectId = req.query.projectId || null;

    // Detect which source type has the most recent data
    const sourceType = await detectSourceType();

    let csvData;
    let defaultFilename;
    let entryCount = 0;

    if (sourceType === 'burial_register') {
      // Get burial register entries
      const { records } = await queryService.list({ sourceType: 'burial_register', limit: 1000000 });
      const results = records;
      entryCount = results.length;

      // Extract volume_id from first entry if available
      const volumeId = results.length > 0 ? results[0].volume_id : 'all';
      logger.info(`Exporting burial register CSV: ${entryCount} entries, volume_id=${volumeId}`);

      // Normalize uncertainty flags for CSV export
      const normalizedResults = results.map(entry => ({
        ...entry,
        uncertainty_flags: normalizeUncertaintyFlags(entry.uncertainty_flags)
      }));

      // Convert to CSV with explicit column order
      csvData = jsonToCsv(normalizedResults, BURIAL_REGISTER_CSV_COLUMNS);

      // Generate filename
      defaultFilename = `burials_${moment().format('YYYYMMDD_HHmmss')}.csv`;
    } else if (sourceType === 'grave_record_card') {
      // Get grave cards
      const { records } = await queryService.list({ sourceType: 'grave_record_card', limit: 1000000, projectId });
      const results = records;
      entryCount = results.length;

      // 1. Parse JSON and flatten each record
      const flattenedRecords = results.map(card => {
        let cardData = {};
        try {
          if (typeof card.data_json === 'string') {
            cardData = JSON.parse(card.data_json);
          } else {
            cardData = card.data_json || {};
          }
        } catch (e) {
          logger.warn(`Failed to parse data_json for card ID ${card.id}`, e);
        }

        // Merge top-level fields
        const mergedData = {
          id: card.id,
          file_name: card.file_name,
          processed_date: card.processed_date,
          ai_provider: card.ai_provider,
          prompt_version: card.prompt_version,
          ...cardData
        };

        return flattenObject(mergedData);
      });

      // 2. Collect all unique keys for dynamic columns
      const allKeys = new Set();
      flattenedRecords.forEach(record => {
        Object.keys(record).forEach(key => allKeys.add(key));
      });

      // Sort keys for deterministic order (put critical fields first)
      const sortedKeys = Array.from(allKeys).sort((a, b) => {
        // Prioritize specific ID/file fields
        const priorityFields = ['id', 'file_name', 'processed_date', 'ai_provider'];
        const aPriority = priorityFields.indexOf(a);
        const bPriority = priorityFields.indexOf(b);

        if (aPriority !== -1 && bPriority !== -1) return aPriority - bPriority;
        if (aPriority !== -1) return -1;
        if (bPriority !== -1) return 1;

        return a.localeCompare(b);
      });

      csvData = jsonToCsv(flattenedRecords, sortedKeys);
      defaultFilename = `grave_cards_${moment().format('YYYYMMDD_HHmmss')}.csv`;
      logger.info(`Exporting grave cards CSV: ${entryCount} entries with ${sortedKeys.length} columns`);
    } else if (sourceType.startsWith('custom:')) {
      // Handle custom schema export
      const schemaId = sourceType.split(':')[1];
      const schema = await SchemaManager.getSchema(schemaId);

      if (!schema) {
        logger.error(`Custom schema ${schemaId} not found for CSV export`);
        return res.status(404).send('Schema not found');
      }

      // Query the dynamic table
      const customRecords = await new Promise((resolve, reject) => {
        db.all(`SELECT * FROM "${schema.table_name}" ORDER BY processed_date DESC`, [], (err, rows) => {
          if (err) {
            logger.error(`Error querying custom table ${schema.table_name}:`, err);
            return reject(err);
          }
          resolve(rows || []);
        });
      });

      entryCount = customRecords.length;

      // Build column order from schema fields
      const fieldColumns = [];
      if (schema.json_schema && schema.json_schema.properties) {
        for (const fieldName of Object.keys(schema.json_schema.properties)) {
          fieldColumns.push(fieldName);
        }
      }

      // Add system columns
      const csvColumns = ['id', 'file_name', ...fieldColumns, 'ai_provider', 'processed_date'];

      csvData = jsonToCsv(customRecords, csvColumns);

      // Sanitize schema name for filename
      const safeName = schema.name.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
      defaultFilename = `${safeName}_${moment().format('YYYYMMDD_HHmmss')}.csv`;
      logger.info(`Exporting custom schema CSV (${schema.name}): ${entryCount} entries with ${csvColumns.length} columns`);
    } else if (sourceType === 'monument_classification') {
      // Get monument classifications
      const { records } = await queryService.list({ sourceType: 'monument_classification', limit: 1000000, projectId });
      const results = records;
      entryCount = results.length;

      // Parse and flatten monument classification data
      const flattenedRecords = results.map(classification => {
        let classificationData = {};
        try {
          if (typeof classification.data_json === 'string') {
            classificationData = JSON.parse(classification.data_json);
          } else {
            classificationData = classification.data_json || {};
          }
        } catch (e) {
          logger.warn(`Failed to parse data_json for classification ID ${classification.id}`, e);
        }

        // Merge top-level fields with classification data
        const mergedData = {
          id: classification.id,
          file_name: classification.file_name,
          processed_date: classification.processed_date,
          ai_provider: classification.ai_provider,
          prompt_template: classification.prompt_template,
          prompt_version: classification.prompt_version,
          ...classificationData
        };

        return flattenObject(mergedData);
      });

      // Convert to CSV with explicit column order
      csvData = jsonToCsv(flattenedRecords, MONUMENT_CLASSIFICATION_CSV_COLUMNS);

      // Generate filename
      defaultFilename = `monuments_${moment().format('YYYYMMDD_HHmmss')}.csv`;
      logger.info(`Exporting monument classifications CSV: ${entryCount} entries`);
    } else {
      // Get memorials (default)
      const { records } = await queryService.list({ sourceType: 'memorial', limit: 1000000, projectId });
      const results = records;
      entryCount = results.length;

      // Transform database field names to match frontend expectations
      const transformedResults = results.map(memorial => ({
        ...memorial,
        fileName: memorial.file_name, // Map file_name to fileName for frontend compatibility
      }));

      // Validate and convert data types
      const validatedResults = validateAndConvertRecords(transformedResults);

      // Convert to CSV (uses defined memorial columns)
      csvData = jsonToCsv(validatedResults, MEMORIAL_CSV_COLUMNS);

      // Generate filename
      defaultFilename = `memorials_${moment().format('YYYYMMDD_HHmmss')}.csv`;
    }

    const requestedFilename = req.query.filename
      ? `${sanitizeFilename(req.query.filename)}.csv`
      : defaultFilename;

    res.setHeader('Content-Disposition', `attachment; filename="${requestedFilename}"`);
    res.setHeader('Content-Type', 'text/csv');
    res.send(csvData);

    logger.info(`Downloaded CSV results as ${requestedFilename} (${entryCount} entries)`);
  } catch (err) {
    logger.error('Error downloading CSV results:', err);
    res.status(500).send('Unable to download results');
  }
}

async function getResults(req, res) {
  try {
    // Extract projectId from query if provided
    const projectId = req.query.projectId || null;

    // Detect which source type has the most recent data
    const sourceType = await detectSourceType();

    // Get any errors from processed files
    const processedResults = getProcessedResults();
    const errors = processedResults.filter(r => r && r.error);

    // Collect conflict warnings from successful results (same format as getProcessingProgress)
    const conflictWarnings = [];
    processedResults.forEach(result => {
      if (result && !result.error && result.conflicts && result.conflicts.length > 0) {
        result.conflicts.forEach(conflict => {
          if (conflict.status === 'resolved') {
            conflictWarnings.push({
              fileName: conflict.file_name,
              errorType: 'page_number_conflict',
              errorMessage: `Page number conflict resolved: AI extracted page ${conflict.original_page_number} but filename suggests page ${conflict.resolved_page_number}. Using filename-based page number.`,
              conflicts: [conflict] // Include for consistency with getProcessingProgress format
            });
          } else if (conflict.status === 'failed') {
            conflictWarnings.push({
              fileName: conflict.file_name,
              errorType: 'page_number_conflict',
              errorMessage: `Page number conflict unresolved: AI extracted page ${conflict.original_page_number} but entry already exists. Filename does not match expected pattern.`,
              conflicts: [conflict]
            });
          }
        });
      }
    });

    // Combine actual errors with conflict warnings
    const allErrors = [...errors, ...conflictWarnings];

    if (sourceType === 'burial_register') {
      // Get burial register entries
      const { records } = await queryService.list({ sourceType: 'burial_register', limit: 1000000, projectId });
      const dbResults = records;

      // Transform database field names to match frontend expectations
      const transformedResults = dbResults.map(entry => ({
        ...entry,
        fileName: entry.file_name, // Map file_name to fileName for frontend compatibility
      }));

      // Return burial register entries with source type
      res.json({
        burialRegisterEntries: transformedResults,
        sourceType: 'burial_register',
        errors: allErrors.length > 0 ? allErrors : undefined
      });
    } else if (sourceType === 'grave_record_card') {
      // Get grave cards
      const { records } = await queryService.list({ sourceType: 'grave_record_card', limit: 1000000, projectId });
      const dbResults = records;

      // Transform to match frontend expectations
      // We map them to "memorials" key because the frontend currently handles "memorials" or "burialRegisterEntries"
      // and treating them as memorials (with source_type set) works best with current main.js logic
      const transformedResults = dbResults.map(card => ({
        ...card,
        fileName: card.file_name,
        source_type: 'grave_record_card' // Ensure this is set
      }));

      res.json({
        memorials: transformedResults, // Send as memorials
        sourceType: 'grave_record_card',
        errors: allErrors.length > 0 ? allErrors : undefined
      });
    } else if (sourceType === 'monument_classification') {
      // Get monument classifications
      const { records } = await queryService.list({ sourceType: 'monument_classification', limit: 1000000, projectId });
      const dbResults = records;

      // Transform to match frontend expectations
      const transformedResults = dbResults.map(classification => ({
        ...classification,
        fileName: classification.file_name,
        source_type: 'monument_classification'
      }));

      res.json({
        monuments: transformedResults,
        sourceType: 'monument_classification',
        errors: allErrors.length > 0 ? allErrors : undefined
      });
    } else if (sourceType.startsWith('custom:')) {
      // Handle custom schema data
      const schemaId = sourceType.split(':')[1];
      const schema = await SchemaManager.getSchema(schemaId);

      if (!schema) {
        logger.error(`Custom schema ${schemaId} not found`);
        return res.status(404).json({ error: `Schema ${schemaId} not found` });
      }

      // Extract field definitions from json_schema
      const fields = [];
      if (schema.json_schema && schema.json_schema.properties) {
        for (const [fieldName, fieldDef] of Object.entries(schema.json_schema.properties)) {
          fields.push({
            name: fieldName,
            type: fieldDef.type || 'string',
            description: fieldDef.description || ''
          });
        }
      }

      // Query the dynamic table
      const customRecords = await new Promise((resolve, reject) => {
        db.all(`SELECT * FROM "${schema.table_name}" ORDER BY processed_date DESC`, [], (err, rows) => {
          if (err) {
            logger.error(`Error querying custom table ${schema.table_name}:`, err);
            return reject(err);
          }
          resolve(rows || []);
        });
      });

      // Transform records for frontend
      const transformedResults = customRecords.map(record => ({
        ...record,
        fileName: record.file_name
      }));

      res.json({
        records: transformedResults,
        sourceType: 'custom',
        schemaId: schema.id,
        schemaName: schema.name,
        fields: fields,
        errors: allErrors.length > 0 ? allErrors : undefined
      });
    } else {
      // Get memorials (default)
      const { records } = await queryService.list({ sourceType: 'memorial', limit: 1000000, projectId });
      const dbResults = records;

      // Transform database field names to match frontend expectations
      const transformedResults = dbResults.map(memorial => ({
        ...memorial,
        fileName: memorial.file_name, // Map file_name to fileName for frontend compatibility
      }));

      // Validate and convert data types
      const validatedResults = validateAndConvertRecords(transformedResults);

      // Return memorials with source type
      res.json({
        memorials: validatedResults,
        sourceType: 'memorial',
        errors: allErrors.length > 0 ? allErrors : undefined
      });
    }
  } catch (error) {
    logger.error('Error retrieving results:', error);
    res.status(500).json({ error: 'Failed to retrieve results' });
  }
}

module.exports = {
  getProcessingStatus,
  downloadResultsJSON,
  downloadResultsCSV,
  getResults,
};
