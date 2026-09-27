const { CLIError } = require('../cli/errors');
const { processFile } = require('../utils/fileProcessing');
const glob = require('glob');
const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');
const { enqueueFiles } = require('../utils/fileQueue');
const { clearProcessingCompleteFlag } = require('../utils/processingFlag');
const { convertPdfToJpegs } = require('../utils/pdfConverter');
const { clearAllMemorials } = require('../utils/database');
const { clearAllBurialRegisterEntries } = require('../utils/burialRegisterStorage');
const graveCardStorage = require('../utils/graveCardStorage');
const { getPrompt } = require('../utils/prompts/templates/providerTemplates');
const { promptManager } = require('../utils/prompts/templates/providerTemplates');
const conversionTracker = require('../utils/conversionTracker');

class IngestService {
  constructor(config = {}, loggerInstance = null) {
    this.config = config;
    this.logger = loggerInstance || logger;
  }

  /**
   * Validate prompt configuration.
   * @param {string} provider 
   * @param {string} template 
   * @param {string} version 
   * @returns {Promise<Object>} Validated configuration
   */
  async validatePromptConfig(provider, template, version) {
    const defaultTemplate = 'memorialOCR';
    const defaultVersion = 'latest';

    const templateName = template || defaultTemplate;
    const templateVersion = version || defaultVersion;

    const promptTemplate = await getPrompt(provider, templateName, templateVersion);
    if (!promptTemplate) {
      throw new Error(`Invalid template: ${templateName}`);
    }

    // Use the provider prompt manager to validate the template
    const validation = promptManager.validatePrompt(promptTemplate, provider);
    if (!validation.isValid) {
      throw new Error(`Template validation failed: ${validation.errors.join(', ')}`);
    }

    return {
      template: templateName,
      version: templateVersion,
      config: promptTemplate
    };
  }

  /**
   * Clear existing data for a specific source type.
   * @param {string} sourceType 
   */
  async clearData(sourceType) {
    if (sourceType === 'burial_register') {
      await clearAllBurialRegisterEntries();
      this.logger.info('Cleared existing burial register entries as requested');
    } else if (sourceType === 'grave_record_card') {
      await graveCardStorage.clearAllGraveCards();
      this.logger.info('Cleared existing grave cards as requested');
    } else {
      await clearAllMemorials();
      this.logger.info('Cleared existing memorial records as requested');
    }
  }

  /**
   * Prepare files (handle PDFs) and queue them for processing.
   * Returns immediately without awaiting PDF conversion (offloaded to background).
   * @param {Array} files - Array of file objects from multer
   * @param {Object} options - Processing options (provider, promptVersion, etc.)
   * @returns {number} Total number of files (PDFs + non-PDFs)
   */
  async prepareAndQueue(files, options) {
    const {
      sourceType,
      volumeId,
      provider,
      promptVersion,
      schemaId,
      projectId
    } = options;

    const filesToQueue = [];
    const pdfsForConversion = [];

    // Separate PDFs from other files
    for (const file of files) {
      if (file.mimetype === 'application/pdf') {
        // For grave cards, enqueue PDF directly (no background conversion)
        if (sourceType === 'grave_record_card') {
          this.logger.info(`Enqueuing Grave Card PDF for processing: ${file.originalname}`);
          filesToQueue.push({
            path: file.path,
            mimetype: 'application/pdf',
            provider: provider,
            promptVersion: promptVersion,
            source_type: sourceType,
            sourceType,
            uploadDir: path.dirname(file.path),
            ...(schemaId && { schemaId }),
            ...(projectId && { project_id: projectId, projectId })
          });
        } else {
          // For other types, register for background conversion
          pdfsForConversion.push(file);
        }
      } else {
        // Non-PDF files enqueue immediately
        filesToQueue.push({
          ...file,
          provider: provider,
          promptVersion: promptVersion,
          source_type: sourceType,
          sourceType,
          ...(sourceType === 'burial_register' && { volume_id: volumeId, volumeId }),
          uploadDir: path.dirname(file.path),
          ...(schemaId && { schemaId }),
          ...(projectId && { project_id: projectId, projectId })
        });
      }
    }

    // Enqueue non-PDF files immediately
    if (filesToQueue.length > 0) {
      enqueueFiles(filesToQueue);
    }

    // Register PDFs for background conversion
    if (pdfsForConversion.length > 0) {
      conversionTracker.registerPdfsForConversion(pdfsForConversion);
      // Start background conversion (fire-and-forget)
      this._startBackgroundConversion(
        pdfsForConversion,
        sourceType,
        volumeId,
        provider,
        promptVersion,
        schemaId,
        projectId
      );
    }

    if (sourceType === 'burial_register' && filesToQueue.length > 0) {
      this.logger.info(`Enqueued ${filesToQueue.length} burial register files for processing (volume_id=${volumeId}, provider=${provider})`);
    }

    clearProcessingCompleteFlag();

    // Return total count of all files (non-PDFs enqueued + PDFs pending conversion)
    return filesToQueue.length + pdfsForConversion.length;
  }

  /**
   * Start background PDF conversion (fire-and-forget).
   * @private
   */
  _startBackgroundConversion(pdfsForConversion, sourceType, volumeId, provider, promptVersion, schemaId, projectId) {
    // Use an async IIFE to avoid blocking
    (async () => {
      for (const pdfFile of pdfsForConversion) {
        try {
          this.logger.info(`[Background] Converting PDF: ${pdfFile.originalname}`);
          const imagePaths = await convertPdfToJpegs(pdfFile.path);
          this.logger.info(`[Background] Converted ${pdfFile.originalname} to ${imagePaths.length} images`);

          // Build file objects for enqueuing
          const convertedFiles = imagePaths.map((imagePath) => ({
            path: imagePath,
            mimetype: 'image/jpeg',
            provider: provider,
            promptVersion: promptVersion,
            source_type: sourceType,
            sourceType,
            ...(sourceType === 'burial_register' && { volume_id: volumeId, volumeId }),
            uploadDir: path.dirname(imagePath),
            ...(schemaId && { schemaId }),
            ...(projectId && { project_id: projectId, projectId })
          }));

          // Enqueue converted images
          enqueueFiles(convertedFiles);
          conversionTracker.markConversionComplete(pdfFile.path, imagePaths.length);
        } catch (error) {
          this.logger.error(`[Background] Error converting PDF ${pdfFile.originalname}:`, error);
          conversionTracker.markConversionFailed(pdfFile.path, error.message);
        }
      }
    })();
  }

  /**
       * Ingest files matching the given pattern.
       * @param {string} pattern - Glob pattern or file path
       * @param {Object} options - Processing options
       * @returns {Promise<Object>} IngestResult
       */
  async ingest(pattern, options = {}) {
    // Merge config defaults with runtime options
    const effectiveOptions = { ...this.config, ...options };

    // Validate source type
    const validSourceTypes = ['record_sheet', 'monument_photo', 'memorial', 'burial_register', 'grave_record_card', 'typographic_analysis', 'monument_classification'];
    if (effectiveOptions.sourceType && !validSourceTypes.includes(effectiveOptions.sourceType)) {
      throw new CLIError('INVALID_SOURCE_TYPE', `Unknown source type: ${effectiveOptions.sourceType}`);
    }

    const files = await this.expandPattern(pattern);
    if (files.length === 0) {
      throw new CLIError('NO_FILES_MATCHED', `No files matched: ${pattern}`);
    }
    this.logger.info(`Found ${files.length} files matching pattern: ${pattern}`);

    const batchSize = effectiveOptions.batchSize || 1;
    const batches = this.chunk(files, batchSize);

    const successes = [];
    const failures = [];
    let sessionCostUsd = 0;

    // Process batches sequentially
    for (let i = 0; i < batches.length; i++) {
      // Check session cost cap before each batch
      const cap = effectiveOptions.costs?.maxCostPerSession ?? this.config.costs?.maxCostPerSession;
      if (cap != null && sessionCostUsd >= cap) {
        this.logger.warn(`Session cost cap ($${cap.toFixed(2)}) reached at $${sessionCostUsd.toFixed(2)}. Halting.`);
        break;
      }

      const batch = batches[i];
      this.logger.info(`Processing batch ${i + 1}/${batches.length} (${batch.length} files)`);

      const batchPromises = batch.map(file => this.processOne(file, effectiveOptions));
      const batchResults = await Promise.allSettled(batchPromises);

      batchResults.forEach((result, index) => {
        const file = batch[index];
        if (result.status === 'fulfilled') {
          successes.push(result.value);
          // Accumulate session cost from successful results
          const costUsd = result.value?.data?.estimated_cost_usd;
          if (typeof costUsd === 'number') {
            sessionCostUsd += costUsd;
          }
        } else {
          const error = result.reason;
          this.logger.error(`Failed to process ${file}`, error);
          failures.push({
            file,
            success: false,
            error: error.message || String(error),
            code: error.code || 'UNKNOWN_ERROR'
          });
        }
      });
    }

    this.logger.info(`Ingestion complete. Success: ${successes.length}, Failed: ${failures.length}`);

    return {
      total: files.length,
      successful: successes.length,
      failed: failures.length,
      partial: failures.length > 0 && successes.length > 0,
      successes,
      failures
    };
  }

  /**
       * Expand glob pattern to file list.
       * @param {string} pattern 
       * @returns {Promise<string[]>}
       */
  async expandPattern(pattern) {
    return new Promise((resolve, reject) => {
      glob(pattern, (err, files) => {
        if (err) reject(err);
        else resolve(files);
      });
    });
  }

  /**
       * Process a single file.
       * @param {string} file 
       * @param {Object} options 
       */
  async processOne(file, options) {
    // Check if file is readable
    try {
      await fs.promises.access(file, fs.constants.R_OK);
    } catch (err) { // eslint-disable-line no-unused-vars
      throw new CLIError('FILE_NOT_READABLE', `File not readable: ${file}`);
    }

    // Dynamic Routing for User-Extensible Schema
    if (options.schemaId) {
      const DynamicProcessor = require('../utils/dynamicProcessing');
      // DynamicProcessor might be an instance (singleton) or class depending on export.
      // Task 3.2 exported class (module.exports = DynamicProcessor).
      // So we instantiate it.
      const processor = new DynamicProcessor(this.logger);
      const result = await processor.processFileWithSchema({ path: file, provider: options.provider }, options.schemaId);

      return {
        success: true,
        file,
        recordId: result.recordId,
        data: result.data
      };
    }

    // processFile returns the extracted data
    const result = await processFile(file, options);
    // We wrap it in a success structure if needed by the caller,
    // but the design says successes array contains objects.
    // processFile returns the record. Let's append file info if missing.
    return {
      success: true,
      file,
      recordId: result.id || result.memorial_id || null, // Best effort ID extraction
      data: result
    };
  }

  /**
       * Chunk array into batches.
       */
  chunk(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}

module.exports = IngestService;
