const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const Ajv = require('ajv');
const SchemaManager = require('../services/SchemaManager');
const { db } = require('./database');
const { createProvider } = require('./modelProviders');
const defaultLogger = require('./logger');
const { analyzeImageForProvider, optimizeImageForProvider } = require('./imageProcessor');
const { convertPdfToJpegs } = require('./pdfConverter');
const llmAuditLog = require('./llmAuditLog');
const config = require('../../config.json');
const {
  processWithValidationRetry,
  injectCostData,
  scopedLogger,
} = require('./processingHelpers');

/**
 * Get the column names for a SQLite table via PRAGMA.
 * Returns an empty array if the table doesn't exist or the query fails.
 * @param {string} tableName - Safe (sanitized) table name
 * @returns {Promise<string[]>}
 */
async function getTableColumns(tableName) {
  return new Promise((resolve) => {
    db.all(`PRAGMA table_info(${tableName})`, [], (err, rows) => {
      if (err || !rows) {
        resolve([]);
      } else {
        resolve(rows.map(r => r.name));
      }
    });
  });
}

class DynamicProcessor {
  constructor(logger = defaultLogger) {
    // Allow coerceTypes to cast strings to numbers/booleans, nullable allows null for any type
    this.ajv = new Ajv({ allErrors: true, coerceTypes: true, nullable: true });
    this.logger = logger;
  }

  /**
   * Process a file using a specific dynamic schema.
   * @param {Object} file - File object (path, provider, etc.)
   * @param {string} schemaId - UUID of the custom schema
   * @returns {Promise<Object>} Result with recordId and data
   */
  async processFileWithSchema(file, schemaId) {
    // 1. Retrieve Schema
    const schema = await SchemaManager.getSchema(schemaId);
    if (!schema) {
      throw new Error('Invalid Schema ID');
    }

    // 2. Prepare Context (File & Prompt)
    const filePath = file.path || file.filepath; // Handle typical multer or direct objects
    if (!filePath) {
      throw new Error('File path missing in file object');
    }

    const providerName = file.provider || process.env.AI_PROVIDER || 'openai';
    const processingId = crypto.randomUUID();
    const log = scopedLogger(processingId);

    // PDF Conversion if needed
    let fileToProcess = filePath;
    let cleanupFile = null;

    if (path.extname(filePath).toLowerCase() === '.pdf') {
      try {
        // keepSource: true because IngestService might manage the source file
        const images = await convertPdfToJpegs(filePath, { keepSource: true });
        if (images.length > 0) {
          fileToProcess = images[0];
          cleanupFile = images[0];

          // Clean up other pages immediately if any
          for (let i = 1; i < images.length; i++) {
            await fs.unlink(images[i]).catch(() => { });
          }
        }
      } catch (err) {
        log.warn(`PDF conversion failed for ${filePath}`, err);
        throw err;
      }
    }

    let providerForAudit;
    let modelVersionForAudit = 'unknown';
    let systemPromptForAudit = '';
    let userPromptForAudit = '';
    const startTime = Date.now();

    try {
      // Image Optimization Logic
      let base64Image;
      try {
        const analysis = await analyzeImageForProvider(fileToProcess, providerName);
        if (analysis.needsOptimization) {
          base64Image = await optimizeImageForProvider(fileToProcess, providerName);
        } else {
          base64Image = await fs.readFile(fileToProcess, { encoding: 'base64' });
        }
      } catch (err) {
        // Fallback to direct read if analysis fails
        log.warn(`Optimization check failed for ${fileToProcess}, falling back to raw read`, err);
        base64Image = await fs.readFile(fileToProcess, { encoding: 'base64' });
      }

      const provider = createProvider({ AI_PROVIDER: providerName });
      providerForAudit = provider;
      const modelVersion = provider.getModelVersion();
      modelVersionForAudit = modelVersion;

      // Construct Prompts
      const systemPrompt = (schema.system_prompt || 'Analyze this image and extract the data based on the requirements.') + ' Return valid JSON.';
      const fieldList = schema.json_schema && schema.json_schema.properties ? Object.keys(schema.json_schema.properties).join(', ') : '';
      const userPrompt = (schema.user_prompt_template || 'Extract the data fields matching the schema.') + (fieldList ? ` Ensure you use these exact keys: ${fieldList}.` : '');

      systemPromptForAudit = systemPrompt;
      userPromptForAudit = userPrompt;

      log.info(`Processing ${path.basename(filePath)} with schema ${schema.name} (${schemaId})`);

      // Helper to validate a single record against schema
      const validateRecord = (record) => {
        const validate = this.ajv.compile(schema.json_schema);
        const valid = validate(record);
        if (!valid) return { valid: false, errors: validate.errors };
        return { valid: true };
      };

      // Helper to sanitize record based on schema types
      const sanitizeRecord = (record, jsonSchema) => {
        const clean = { ...record };
        const props = jsonSchema.properties || {};

        Object.keys(clean).forEach(key => {
          const type = props[key]?.type;
          let value = clean[key];

          // Coerce arrays to string when schema expects a string.
          // LLMs sometimes return arrays for multi-value fields (e.g. names_of_deceased: []).
          // Join non-empty arrays with "; "; empty arrays become null.
          if (type === 'string' && Array.isArray(value)) {
            const filtered = value.filter(v => v !== null && v !== undefined && v !== '');
            clean[key] = filtered.length > 0 ? filtered.join('; ') : null;
            value = clean[key];
          }

          // Handle Booleans (Yes/No, empty strings become null).
          // Any unrecognised string (e.g. "vacant") also becomes null rather than
          // leaving an invalid non-boolean value that fails AJV validation.
          if (type === 'boolean') {
            if (typeof value === 'string') {
              const lower = value.toLowerCase().trim();
              if (['yes', 'y', 'true', '1'].includes(lower)) {
                clean[key] = true;
              } else if (['no', 'n', 'false', '0'].includes(lower)) {
                clean[key] = false;
              } else {
                // Covers '', 'null', 'n/a', 'vacant', and any other non-boolean string
                clean[key] = null;
              }
            } else if (value === null || value === undefined) {
              clean[key] = null;
            } else if (Array.isArray(value)) {
              clean[key] = null;
            }
          }

          // Handle Numbers (remove commas, handle numeric strings)
          if ((type === 'number' || type === 'integer') && typeof value === 'string') {
            const numStr = value.replace(/,/g, '').trim();
            if (numStr === '' || numStr.toLowerCase() === 'null') {
              clean[key] = null;
            } else if (!isNaN(Number(numStr))) {
              clean[key] = Number(numStr);
            }
          }

          // Handle Null strings
          if (typeof value === 'string' && value.toLowerCase() === 'null') {
            clean[key] = null;
          }
        });
        return clean;
      };

      // Helper to find nested array with inherited context (for multi-record extraction)
      const findArrayWithContext = (obj, context = {}) => {
        if (!obj || typeof obj !== 'object') return null;

        const currentContext = { ...context };
        for (const key of Object.keys(obj)) {
          if (typeof obj[key] !== 'object' || obj[key] === null) {
            currentContext[key] = obj[key];
          }
        }

        for (const key of Object.keys(obj)) {
          if (Array.isArray(obj[key])) {
            const arr = obj[key];
            if (arr.length > 0 && typeof arr[0] === 'object' && arr[0] !== null) {
              return { array: arr, context: currentContext };
            }
          }
        }

        const arrayKeys = Object.keys(obj).filter(k => Array.isArray(obj[k]));
        if (arrayKeys.length > 0) {
          const lengths = arrayKeys.map(k => obj[k].length);
          const anchorLength = lengths[0];
          const consistentEntryCount = lengths.every(l => l === anchorLength);

          if (consistentEntryCount && anchorLength > 0) {
            const rows = [];
            for (let i = 0; i < anchorLength; i++) {
              const row = {};
              Object.assign(row, currentContext);
              for (const key of arrayKeys) {
                row[key] = obj[key][i];
              }
              for (const key of Object.keys(obj)) {
                if (!Array.isArray(obj[key]) && (typeof obj[key] !== 'object' || obj[key] === null)) {
                  row[key] = obj[key];
                }
              }
              rows.push(row);
            }
            return { array: rows, context: {} };
          }
        }

        for (const key of Object.keys(obj)) {
          if (typeof obj[key] === 'object' && !Array.isArray(obj[key]) && obj[key] !== null) {
            const found = findArrayWithContext(obj[key], currentContext);
            if (found) return found;
          }
        }
        return null;
      };

      // 3. Call LLM with validation retry on parse/schema failure
      const validateFn = (rawContent) => {
        let data;
        if (typeof rawContent === 'object' && rawContent !== null) {
          data = rawContent;
        } else {
          // Handle "```json" blocks if provider returns markdown
          const cleanJson = rawContent.replace(/```json\n?|```/g, '').trim();
          data = JSON.parse(cleanJson); // throws SyntaxError on parse failure
        }

        let records = [];

        if (Array.isArray(data)) {
          records = data;
        } else if (typeof data === 'object' && data !== null) {
          // Sanitize before validating so type coercions (array→string, boolean normalisation)
          // are applied before AJV sees the values. If the sanitized record passes, use it
          // directly. If it still fails, fall back to looking for a nested array in the
          // original (unsanitized) response.
          const sanitizedSingle = sanitizeRecord(data, schema.json_schema);
          const singleValidation = validateRecord(sanitizedSingle);
          if (singleValidation.valid) {
            records = [sanitizedSingle];
          } else {
            const result = findArrayWithContext(data);
            if (result) {
              const { array: recordsArray, context } = result;
              log.info(`Detected nested array containing ${recordsArray.length} items, attempting to extract records with inherited context.`);
              if (recordsArray.length > 0) {
                log.info(`Sample record structure: ${JSON.stringify(recordsArray[0]).substring(0, 200)}`);
              }
              records = recordsArray.map(rec => {
                if (typeof rec === 'object' && rec !== null) {
                  return { ...context, ...rec };
                }
                return rec;
              });
            } else {
              const errorDetails = {
                schemaId,
                validationErrors: singleValidation.errors,
                rawValue: data
              };
              log.error('Validation failed for record:', errorDetails);
              throw new Error(`Validation failed: ${this.ajv.errorsText(singleValidation.errors)}`);
            }
          }
        }

        // Validate all extracted records against schema
        const validRecords = [];
        for (const [index, rec] of records.entries()) {
          const cleanedRec = sanitizeRecord(rec, schema.json_schema);
          const val = validateRecord(cleanedRec);
          if (val.valid) {
            validRecords.push(cleanedRec);
          } else {
            log.warn(`Record ${index} failed validation, skipping.`, { errors: val.errors });
          }
        }

        if (validRecords.length === 0) {
          throw new Error('Validation failed: No valid records found in LLM output matching schema.');
        }

        return { records: validRecords };
      };

      // 4. Process with retry on validation failure
      const { validationResult, usage } = await processWithValidationRetry(
        provider,
        base64Image,
        userPrompt,
        { systemPrompt },
        validateFn,
        { log }
      );

      const apiDuration = Date.now() - startTime;
      const { records: validRecords } = validationResult;

      log.info(`Found ${validRecords.length} valid records to insert.`);

      // Log successful API call to audit log
      await llmAuditLog.logEntry({
        processing_id: processingId,
        provider: providerName,
        model: modelVersion,
        system_prompt: systemPrompt,
        user_prompt: userPrompt,
        input_tokens: usage.input_tokens,
        output_tokens: usage.output_tokens,
        response_time_ms: apiDuration,
        status: 'success',
      });

      // 5. Insert records
      const tableName = schema.table_name;
      const safeTableName = tableName.replace(/[^a-z0-9_]/g, '');

      // Get existing columns so we can gracefully handle old tables that lack new metadata columns
      const tableColumns = await getTableColumns(safeTableName);

      // Metadata for all records
      const metadata = {
        file_name: path.basename(filePath),
        processed_date: new Date().toISOString(),
        ai_provider: providerName,
        model_version: modelVersion,
        batch_id: file.batchId || null,
        processing_id: processingId,
        needs_review: 0,
      };

      // Inject cost data (input_tokens, output_tokens, estimated_cost_usd)
      injectCostData(metadata, usage, providerName, modelVersion, config);

      let insertedCount = 0;
      let lastID = 0;

      for (const record of validRecords) {
        const allData = { ...record, ...metadata };

        // Filter to only columns that exist in the table (backward compat with old dynamic tables)
        const filteredData = tableColumns.length > 0
          ? Object.fromEntries(Object.entries(allData).filter(([k]) => tableColumns.includes(k)))
          : allData;

        const columns = Object.keys(filteredData);
        const placeholders = columns.map(() => '?').join(', ');
        const values = columns.map(col => {
          const val = filteredData[col];
          return (typeof val === 'object' && val !== null) ? JSON.stringify(val) : val;
        });

        const sanitizedCols = columns.map(c => c.replace(/[^a-z0-9_]/g, ''));
        const sql = `INSERT INTO ${safeTableName} (${sanitizedCols.join(', ')}) VALUES (${placeholders})`;

        await new Promise((resolve, reject) => {
          db.run(sql, values, function (err) {
            if (err) reject(err);
            else {
              lastID = this.lastID;
              resolve(this.lastID);
            }
          });
        });
        insertedCount++;
      }

      return {
        success: true,
        recordCount: insertedCount,
        recordId: lastID, // Backward compatibility for single record
        data: validRecords // Return the array of extracted data
      };
    } catch (err) {
      // Log failed API call to audit log (best-effort)
      await llmAuditLog.logEntry({
        processing_id: processingId,
        provider: providerName,
        model: modelVersionForAudit,
        system_prompt: systemPromptForAudit,
        user_prompt: userPromptForAudit,
        response_time_ms: Date.now() - startTime,
        status: 'error',
        error_message: err.message,
      }).catch(() => { /* don't mask original error */ });

      if (err.message && (err.message.includes('SQL') || err.message.includes('Database'))) {
        this.logger.error('Database insertion failed', { schemaId, error: err });
      } else {
        this.logger.error('Processing failed', { schemaId, error: err });
      }
      throw err;
    } finally {
      if (cleanupFile) {
        await fs.unlink(cleanupFile).catch(err =>
          this.logger.warn('Failed to cleanup temp file', { file: cleanupFile, error: err })
        );
      }
    }
  }
}

module.exports = DynamicProcessor;
