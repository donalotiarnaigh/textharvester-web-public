const fs = require('fs').promises;
const path = require('path');
const { storeMemorial } = require('../database');
const { getMemorialNumberForMonument } = require('../filenameParser');
const { isEmptySheetError } = require('../errorTypes');
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
 * Process memorial, monument_photo, typographic_analysis, and record_sheet files
 * Handles confidence metadata, validation warnings, cost injection, and memorial number injection
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
async function memorialProcessor(context) {
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
    options,
    config,
    sourceType,
  } = context;

  const startTime = Date.now();
  log.info(`Processing ${path.basename(filePath)} with provider: ${providerName}`);

  // For monument photos, prepare filename-based memorial number injection
  const filename = path.basename(filePath);
  const filenameMemorialNumber = getMemorialNumberForMonument(filename, sourceType);

  try {
    // Process image + validate with retry
    const { validationResult, usage: memUsage, rawResponse } = await processWithValidationRetry(
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
      (rawExtractedData) => {
        // For monument photos, inject memorial number from filename if not provided by OCR
        let enhancedData = { ...rawExtractedData };
        if (sourceType === 'monument_photo' && filenameMemorialNumber) {
          const rawMemNum = enhancedData.memorial_number;
          const effectiveMemNum =
            rawMemNum !== null && typeof rawMemNum === 'object' && 'value' in rawMemNum
              ? rawMemNum.value
              : rawMemNum;
          const PLACEHOLDER_VALUES = ['n/a', 'null', 'unknown', 'none'];
          const memNumIsAbsent =
            !effectiveMemNum ||
            (typeof effectiveMemNum === 'string' &&
              PLACEHOLDER_VALUES.includes(effectiveMemNum.trim().toLowerCase()));

          if (memNumIsAbsent) {
            enhancedData.memorial_number = filenameMemorialNumber;
            log.info(
              `[MemorialProcessor] Injected memorial number from filename: ${filenameMemorialNumber} for ${filename}`
            );
          } else {
            log.info(
              `[MemorialProcessor] OCR provided memorial number: ${effectiveMemNum}, keeping it over filename: ${filenameMemorialNumber}`
            );
          }
        }

        return promptInstance.validateAndConvert(enhancedData);
      }
    );

    const apiDuration = Date.now() - startTime;
    log.info(`API call completed in ${apiDuration}ms for ${filename}`);

    // Log the validated data for debugging
    const extractedData = validationResult.data;
    const memConfidenceScores = validationResult.confidenceScores;
    const memValidationWarnings = validationResult.validationWarnings;

    log.debugPayload(`Raw ${providerName} API response for ${filename}:`, extractedData);

    // Apply confidence metadata
    applyConfidenceMetadata(extractedData, memConfidenceScores, config);

    // Detect fluent hallucinations from the raw provider response before final warning application.
    applyDegenerateDetection(extractedData, rawResponse, sourceType, config);

    // Apply validation warnings
    applyValidationWarnings(
      extractedData,
      [...(memValidationWarnings || []), ...(extractedData._validation_warnings || [])]
    );

    applyDisagreementScore(extractedData, config);

    log.info(`${providerName} API response processed successfully for ${filename}`);
    log.debugPayload(`Processed ${providerName} data for ${filename}:`, extractedData);

    // Attach common metadata
    attachCommonMetadata(extractedData, {
      fileName: filename,
      providerName,
      modelVersion: provider.getModelVersion(),
      promptTemplate,
      promptVersion: promptInstance.version,
      sourceType,
      processingId,
    });

    // Include site_code for mobile uploads (site isolation)
    if (options.site_code) {
      extractedData.site_code = options.site_code;
    }

    // Include project_id for project grouping
    if (options.project_id) {
      extractedData.project_id = options.project_id;
    }

    // Inject cost data
    injectCostData(extractedData, memUsage, providerName, provider.getModelVersion(), config);

    // Store in database
    try {
      await storeMemorial(extractedData);
    } catch (storageError) {
      if (storageError.isDuplicate) {
        log.warn(`Duplicate memorial skipped: ${storageError.message}`);
        await fs.unlink(filePath);
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

    log.info(`OCR text for ${filename} stored in database with model: ${providerName}`);

    // Clean up the file after successful processing
    await fs.unlink(filePath);
    log.info(`Cleaned up processed file: ${filePath}`);

    return extractedData;
  } catch (error) {
    // Check if this is an empty sheet error
    if (isEmptySheetError(error)) {
      log.warn(`Empty sheet detected for ${filename}: ${error.message}`);

      const errorResult = buildErrorResult(filePath, {
        errorType: error.type || 'empty_sheet',
        errorMessage: error.message,
        providerName,
        modelVersion: provider.getModelVersion(),
        sourceType,
        processingId,
      });

      // Clean up the file even for empty sheets
      await fs.unlink(filePath);
      log.info(`Cleaned up empty sheet file: ${filePath}`);

      return errorResult;
    }

    // Re-throw other errors
    log.error(`Validation error for ${filename}: ${error.message}`);
    throw error;
  }
}

module.exports = memorialProcessor;
