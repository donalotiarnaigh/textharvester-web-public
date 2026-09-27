const path = require('path');
const graveCardProcessor = require('../imageProcessing/graveCardProcessor');
const graveCardStorage = require('../graveCardStorage');
const {
  applyConfidenceMetadata,
  applyDegenerateDetection,
  applyDisagreementScore,
  applyValidationWarnings,
  injectCostData,
  attachCommonMetadata,
  buildErrorResult,
  processWithValidationRetry,
} = require('../processingHelpers');

/**
 * Process grave record card files
 * Handles PDF stitching, AI processing, confidence metadata, and storage
 *
 * @param {Object} context - Processing context
 * @param {string} context.filePath - Path to the file being processed
 * @param {Object} context.provider - AI provider instance
 * @param {string} context.providerName - Provider name (openai, anthropic, gemini)
 * @param {Object} context.promptInstance - Prompt template instance
 * @param {string} context.promptTemplate - Prompt template name
 * @param {string} context.userPrompt - User prompt text
 * @param {string} context.systemPrompt - System prompt text
 * @param {string} context.processingId - UUID for this processing session
 * @param {Object} context.log - Scoped logger
 * @param {Object} context.config - Configuration object
 * @param {string} context.sourceType - Record source type
 * @param {string} context.promptVersion - Prompt version
 * @returns {Promise<Object>} Processing result
 */
async function graveCardRecordProcessor(context) {
  const {
    filePath,
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
  } = context;

  const startTime = Date.now();
  log.info(`Processing grave record card via ${providerName}: ${filePath}`);

  // Step 1: Process PDF through GraveCardProcessor
  const stitchedBuffer = await graveCardProcessor.processPdf(filePath);
  const base64Image = stitchedBuffer.toString('base64');

  log.info(`Grave card PDF processed and stitched successfully for ${filePath}`);

  // Step 2: Process through AI provider + validate (with retry)
  const { validationResult, usage: graveCardUsage, rawResponse } = await processWithValidationRetry(
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
  log.info(`Grave card API call completed in ${apiDuration}ms for ${filePath}`);

  const validatedData = validationResult.data;
  const graveCardConfidenceScores = validationResult.confidenceScores;
  const graveCardValidationWarnings = validationResult.validationWarnings;

  // Apply confidence metadata
  applyConfidenceMetadata(validatedData, graveCardConfidenceScores, config);

  applyDegenerateDetection(validatedData, rawResponse, sourceType, config);

  // Apply validation warnings
  applyValidationWarnings(
    validatedData,
    [...(graveCardValidationWarnings || []), ...(validatedData._validation_warnings || [])]
  );

  applyDisagreementScore(validatedData, config);

  log.info(`${providerName} grave card response validated successfully for ${filePath}`);

  // Attach common metadata
  const filename = path.basename(filePath);
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
  injectCostData(validatedData, graveCardUsage, providerName, provider.getModelVersion(), config);

  // Include project_id for project grouping
  if (options.project_id) {
    validatedData.project_id = options.project_id;
  }

  // Step 3: Store in database
  try {
    await graveCardStorage.storeGraveCard(validatedData);
  } catch (storageError) {
    if (storageError.isDuplicate) {
      log.warn(`Duplicate grave card skipped: ${storageError.message}`);
      return buildErrorResult(filePath, {
        errorType: 'duplicate',
        errorMessage: storageError.message,
        providerName,
        modelVersion: provider.getModelVersion(),
        sourceType,
        processingId,
      });
    }
    throw storageError;
  }

  log.info(`Grave card data for ${filePath} stored in database with model: ${providerName}`);

  // Note: GraveCardProcessor already cleaned up intermediate files and the PDF

  return validatedData;
}

module.exports = graveCardRecordProcessor;
