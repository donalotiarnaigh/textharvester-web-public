const fs = require('fs').promises;
const path = require('path');
const monumentClassificationStorage = require('../monumentClassificationStorage');
const {
  applyConfidenceMetadata,
  applyValidationWarnings,
  injectCostData,
  attachCommonMetadata,
  processWithValidationRetry,
} = require('../processingHelpers');

/**
 * Process monument classification files
 * Extracts classification data, applies confidence/warning metadata, and stores results
 *
 * @param {Object} context - Processing context
 * @param {string} context.filePath - Path to the file being processed
 * @param {string} context.base64Image - Base64-encoded image data
 * @param {Object} context.provider - AI provider instance
 * @param {string} context.providerName - Provider name (openai, anthropic, gemini)
 * @param {Object} context.promptInstance - Prompt template instance
 * @param {string} context.promptTemplate - Prompt template name
 * @param {string} context.userPrompt - User prompt text
 * @param {string} context.systemPrompt - System prompt text
 * @param {string} context.processingId - UUID for this processing session
 * @param {Object} context.log - Scoped logger
 * @param {Object} context.options - Processing options
 * @param {Object} context.config - Configuration object
 * @param {string} context.sourceType - Record source type
 * @param {string} context.promptVersion - Prompt version
 * @returns {Promise<Object>} Processing result
 */
async function monumentClassificationProcessor(context) {
  const {
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
    config,
    sourceType,
  } = context;

  const startTime = Date.now();
  const filename = path.basename(filePath);
  log.info(`Processing monument classification via ${providerName}: ${filePath}`);

  // Process through AI provider + validate (with retry)
  const { validationResult, usage: classificationUsage } = await processWithValidationRetry(
    provider,
    base64Image,
    userPrompt,
    {
      systemPrompt,
      promptTemplate: promptInstance,
      log,
      processingId,
      ...(config.schemaConstrained?.enabled && promptInstance.getJsonSchema
        ? { jsonSchema: promptInstance.getJsonSchema() }
        : {})
    },
    (raw) => promptInstance.validateAndConvert(raw)
  );

  const apiDuration = Date.now() - startTime;
  log.info(`Monument classification API call completed in ${apiDuration}ms for ${filePath}`);

  const validatedData = validationResult.data;
  const classificationConfidenceScores = validationResult.confidenceScores;
  const classificationValidationWarnings = validationResult.validationWarnings;

  // Apply confidence metadata
  applyConfidenceMetadata(validatedData, classificationConfidenceScores, config);

  // Apply validation warnings
  applyValidationWarnings(validatedData, classificationValidationWarnings);

  log.info(`${providerName} monument classification response validated successfully for ${filePath}`);

  // Attach common metadata
  attachCommonMetadata(validatedData, {
    fileName: filename,
    providerName,
    modelVersion: provider.getModelVersion(),
    promptTemplate,
    promptVersion: promptInstance.version,
    sourceType,
    processingId,
  });

  // Inject cost data
  injectCostData(
    validatedData,
    classificationUsage,
    providerName,
    provider.getModelVersion(),
    config
  );

  // Store in database
  await monumentClassificationStorage.storeClassification(validatedData);

  log.info(`Monument classification data for ${filePath} stored in database with model: ${providerName}`);

  // Clean up file after processing
  await fs.unlink(filePath);
  log.info(`Cleaned up processed monument classification file: ${filePath}`);

  return validatedData;
}

module.exports = monumentClassificationProcessor;
