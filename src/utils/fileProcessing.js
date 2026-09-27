const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const logger = require('./logger');
const { createProvider } = require('./modelProviders');
const { getPrompt } = require('./prompts/templates/providerTemplates');
const { optimizeImageForProvider, analyzeImageForProvider } = require('./imageProcessor');
const config = require('../../config.json');
const { scopedLogger } = require('./processingHelpers');
const { getProcessor } = require('./processors');

/**
 * Enhances the processFile function with detailed logging for better tracking and debugging.
 * Processes a given file by reading and sending its contents to the configured AI provider for OCR processing.
 * @param {string} filePath The path to the file to be processed.
 * @param {Object} options Optional configuration options including provider selection
 * @returns {Promise} A promise that resolves with the API response or rejects with an error.
 */
async function processFile(filePath, options = {}) {
  const providerName = options.provider || process.env.AI_PROVIDER || 'openai';
  const sourceType = options.sourceType || options.source_type || 'record_sheet';

  // Generate processing ID for this file
  const processingId = crypto.randomUUID();
  const log = scopedLogger(processingId);

  // Select template based on source_type (unless custom template is provided)
  const promptTemplate = options.promptTemplate ||
    (sourceType === 'burial_register'
      ? 'burialRegister'
      : sourceType === 'monument_photo'
        ? 'monumentPhotoOCR'
        : sourceType === 'grave_record_card'
          ? 'graveCard'
          : sourceType === 'monument_classification'
            ? 'monumentClassification'
            : sourceType === 'typographic_analysis'
              ? 'typographicAnalysis'
              : 'memorialOCR');

  const promptVersion = options.promptVersion || 'latest';

  // Dynamic Routing for User-Extensible Schema
  if (options.schemaId) {
    log.info(`Processing ${path.basename(filePath)} using dynamic schema: ${options.schemaId}`);
    const DynamicProcessor = require('./dynamicProcessing');
    const processor = new DynamicProcessor(logger);

    try {
      // DynamicProcessor expects { path, provider } and schemaId
      const result = await processor.processFileWithSchema(
        { path: filePath, provider: providerName },
        options.schemaId
      );
      result.processing_id = processingId;
      return result.data; // Return the extracted data
    } catch (error) {
      log.error(`Dynamic processing failed for ${filePath}:`, error);
      throw error;
    }
  }

  log.info(`Processing ${path.basename(filePath)} with provider: ${providerName}, source: ${sourceType}, template: ${promptTemplate}`);

  try {
    // For burial register, skip image optimization (handled differently)
    // For other types, analyze image to see if optimization is needed
    let base64Image;
    if (sourceType === 'burial_register') {
      base64Image = await fs.readFile(filePath, { encoding: 'base64' });
      log.info(`File ${filePath} read successfully (burial register, no optimization). Proceeding with OCR processing.`);
    } else if (sourceType === 'grave_record_card') {
      log.info(`File ${filePath} identified as grave record card. Skipping initial image optimization.`);
      // Grave card processing handles its own file reading and conversion
      base64Image = null; // Grave card processor doesn't need it
    } else {
      // Analyze image to see if optimization is needed
      const analysis = await analyzeImageForProvider(filePath, providerName);
      if (analysis.needsOptimization) {
        log.info(`[ImageProcessor] Image requires optimization: ${analysis.reasons.join(', ')}`);
        base64Image = await optimizeImageForProvider(filePath, providerName);
        log.info(`File ${filePath} optimized and processed successfully. Proceeding with OCR processing.`);
      } else {
        // Image is already within limits, read directly
        base64Image = await fs.readFile(filePath, { encoding: 'base64' });
        log.info(`File ${filePath} read successfully (no optimization needed). Proceeding with OCR processing.`);
      }
    }

    // Create provider instance
    const provider = createProvider({
      ...options,
      AI_PROVIDER: providerName
    });

    // Get prompt instance
    const promptInstance = getPrompt(providerName, promptTemplate, promptVersion);
    const promptConfig = promptInstance.getProviderPrompt(providerName);

    const userPrompt = typeof promptConfig === 'string' ? promptConfig : promptConfig.userPrompt;
    const systemPrompt = typeof promptConfig === 'object' ? promptConfig.systemPrompt : undefined;

    // Get and execute processor for this source type
    const processor = getProcessor(sourceType);

    return await processor({
      filePath,
      base64Image,
      provider,
      providerName,
      promptInstance,
      promptTemplate,
      userPrompt,
      systemPrompt,
      processingId,
      log,
      options,
      config,
      sourceType,
      promptVersion,
    });
  } catch (error) {
    log.error(`Error processing file ${filePath}:`, error);
    throw error;
  }
}

module.exports = { processFile };
