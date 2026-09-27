const logger = require('./logger');
const { isEmptySheetError, FatalError, isFatalError } = require('./errorTypes');
const { detectDegenerate } = require('./degenerateOutputDetector');
const { computeDisagreementScore } = require('./disagreementScore');
const config = require('../../config.json');

const VALIDATION_RETRY_PREAMBLE =
  'IMPORTANT: Your previous response could not be parsed. ' +
  'Return ONLY valid JSON matching the exact schema specified. ' +
  'Do not include any explanatory text, markdown code fences, or comments outside the JSON object.';

/**
 * Apply confidence metadata to data object.
 * @param {Object} data - The data object to enhance
 * @param {Object} confidenceScores - Map of field names to confidence scores
 * @param {Object} config - Configuration object with confidence settings
 */
function applyConfidenceMetadata(data, confidenceScores, config) {
  if (!confidenceScores || config.confidence?.enabled === false) {
    return;
  }

  data.confidence_scores = confidenceScores;
  const threshold = config.confidence?.reviewThreshold ?? 0.70;
  const allScores = Object.values(confidenceScores);
  const numericCount = allScores.filter((s) => typeof s === 'number').length;
  data.confidence_coverage = allScores.length > 0 ? numericCount / allScores.length : null;
  data.needs_review = allScores.some((s) => typeof s === 'number' && s < threshold) ? 1 : 0;
}

/**
 * Apply validation warnings to data object.
 * @param {Object} data - The data object to enhance
 * @param {Array<string>} validationWarnings - Array of warning messages
 */
function applyValidationWarnings(data, validationWarnings) {
  if (!validationWarnings || validationWarnings.length === 0) {
    return;
  }

  data.validation_warnings = validationWarnings;
  data.needs_review = 1; // force flag even if confidence disabled
}

/**
 * Compute and attach a disagreement score to the data object.
 * @param {Object} data - The data object to enhance (must already have confidence_scores / validation_warnings)
 * @param {Object} config - Configuration object with activeLearning settings
 */
function applyDisagreementScore(data, config) {
  if (config.activeLearning?.enabled === false) {
    return;
  }
  data.disagreement_score = computeDisagreementScore(
    data.confidence_scores,
    data.validation_warnings
  );
}

/**
 * Run degenerate-output checks on the raw model response and append validation warnings.
 * Metrics are attached for debugging even when detection is disabled or not triggered.
 *
 * @param {Object} data - The data object to enhance
 * @param {string} rawResponse - Raw provider response before validation/parsing
 * @param {string} sourceType - Record source type
 * @param {Object} config - Configuration object with degenerateDetection settings
 */
function applyDegenerateDetection(data, rawResponse, sourceType, config) {
  if (typeof rawResponse !== 'string' || rawResponse.trim().length === 0) {
    return;
  }

  const result = detectDegenerate(rawResponse, sourceType, config.degenerateDetection);
  data.degenerate_output_metrics = result.metrics;

  if (!result.isDegenerate) {
    return;
  }

  if (!data._validation_warnings) {
    data._validation_warnings = [];
  }

  data._validation_warnings.push(
    `DEGENERATE_OUTPUT: ${result.reasons.join(', ')} (ccr=${result.metrics.ccr.toFixed(2)}, entropy=${result.metrics.entropy.toFixed(2)}, length_ratio=${result.metrics.lengthRatio.toFixed(2)})`
  );
}

/**
 * Inject cost data into data object.
 * @param {Object} data - The data object to enhance
 * @param {{ input_tokens: number, output_tokens: number }} usage - Token usage
 * @param {string} providerName - Provider name (openai, anthropic, gemini)
 * @param {string} modelVersion - Model version string
 * @param {Object} config - Configuration object with costs settings
 */
function injectCostData(data, usage, providerName, modelVersion, config) {
  const costConfig = config.costs?.[providerName]?.[modelVersion] || {};
  data.input_tokens = usage.input_tokens;
  data.output_tokens = usage.output_tokens;
  data.estimated_cost_usd = calculateCost(usage, costConfig);
}

/**
 * Attach common metadata fields to data object.
 * @param {Object} data - The data object to enhance
 * @param {Object} metadata - Metadata to attach
 * @param {string} metadata.fileName - Original filename
 * @param {string} metadata.providerName - AI provider name
 * @param {string} metadata.modelVersion - Model version
 * @param {string} metadata.promptTemplate - Prompt template name
 * @param {string} metadata.promptVersion - Prompt version
 * @param {string} metadata.sourceType - Record source type
 * @param {string} metadata.processingId - UUID for this processing session
 */
function attachCommonMetadata(data, metadata) {
  data.fileName = metadata.fileName;
  data.ai_provider = metadata.providerName;
  data.model_version = metadata.modelVersion;
  data.prompt_template = metadata.promptTemplate;
  data.prompt_version = metadata.promptVersion;
  data.source_type = metadata.sourceType;
  data.processing_id = metadata.processingId;
}

/**
 * Build an error result object with standard error shape.
 * @param {string} filePath - Path to the file being processed
 * @param {Object} errorInfo - Error information
 * @param {string} errorInfo.errorType - Type of error (duplicate, empty_sheet, etc)
 * @param {string} errorInfo.errorMessage - Error message
 * @param {string} errorInfo.providerName - AI provider name
 * @param {string} errorInfo.modelVersion - Model version
 * @param {string} errorInfo.sourceType - Record source type
 * @param {string} errorInfo.processingId - UUID for this processing session
 * @returns {Object} Error result object
 */
function buildErrorResult(filePath, errorInfo) {
  const path = require('path');
  return {
    fileName: path.basename(filePath),
    error: true,
    errorType: errorInfo.errorType,
    errorMessage: errorInfo.errorMessage,
    ai_provider: errorInfo.providerName,
    model_version: errorInfo.modelVersion,
    source_type: errorInfo.sourceType,
    processing_id: errorInfo.processingId,
  };
}

/**
 * Calculate estimated cost in USD for a single API call.
 * @param {{ input_tokens: number, output_tokens: number }} usage - Token usage
 * @param {{ inputPerMToken?: number, outputPerMToken?: number }} costConfig - Cost configuration
 * @returns {number} Estimated cost in USD
 */
function calculateCost(usage, costConfig) {
  const regularInput = (usage.input_tokens / 1_000_000) * (costConfig.inputPerMToken || 0);
  const cacheWrite = ((usage.cache_creation_input_tokens || 0) / 1_000_000) *
    (costConfig.cacheWritePerMToken || costConfig.inputPerMToken || 0);
  const cacheRead = ((usage.cache_read_input_tokens || 0) / 1_000_000) *
    (costConfig.cacheReadPerMToken || costConfig.cachedInputPerMToken || costConfig.inputPerMToken || 0);
  const output = (usage.output_tokens / 1_000_000) * (costConfig.outputPerMToken || 0);
  // Page-based providers (e.g. Mistral OCR) include pages_processed in usage
  const ocrPages = (usage.pages_processed || 0) * (costConfig.perPageCost || 0);
  return regularInput + cacheWrite + cacheRead + output + ocrPages;
}

/**
 * Create a scoped logger that prefixes all messages with a processing ID.
 * @param {string} processingId - UUID for this processing session
 * @returns {Object} Logger-like object with info, warn, error, debug, debugPayload methods
 */
function scopedLogger(processingId) {
  const tag = `[pid:${processingId.substring(0, 8)}]`;
  return {
    info: (msg, ...args) => logger.info(`${tag} ${msg}`, ...args),
    warn: (msg, ...args) => logger.warn(`${tag} ${msg}`, ...args),
    error: (msg, ...args) => logger.error(`${tag} ${msg}`, ...args),
    debug: (msg, ...args) => logger.debug(`${tag} ${msg}`, ...args),
    debugPayload: (msg, ...args) => logger.debugPayload(`${tag} ${msg}`, ...args),
  };
}

/**
 * Attempt processImage + validation, retrying once on validation failure.
 * On retry, prepends a format-enforcement preamble to the user prompt.
 * Empty-sheet errors are never retried.
 *
 * @param {Object} provider - AI provider instance
 * @param {string} base64Image - base64-encoded image data
 * @param {string} userPrompt - the user prompt text
 * @param {Object} providerOptions - options passed to provider.processImage
 * @param {Function} validateFn - function(rawContent) => { data, confidenceScores, validationWarnings } (throws on failure)
 * @param {Object} [retryOptions] - retry configuration
 * @param {number} [retryOptions.maxRetries=1] - max validation retries
 * @param {Object} [retryOptions.log] - optional scoped logger (defaults to module logger)
 * @returns {Promise<{ validationResult: Object, usage: Object, rawResponse: string }>}
 */
async function processWithValidationRetry(
  provider,
  base64Image,
  userPrompt,
  providerOptions,
  validateFn,
  retryOptions = {}
) {
  const maxRetries = retryOptions.maxRetries ?? config.retry?.validationRetries ?? 1;
  const log = retryOptions.log || logger;

  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const effectivePrompt =
      attempt === 0 ? userPrompt : `${VALIDATION_RETRY_PREAMBLE}\n\n${userPrompt}`;

    const { content: rawData, usage } = await provider.processImage(
      base64Image,
      effectivePrompt,
      providerOptions
    );

    try {
      const validationResult = validateFn(rawData);
      return { validationResult, usage, rawResponse: rawData };
    } catch (validationError) {
      lastError = validationError;

      // Never retry empty-sheet errors
      if (isEmptySheetError(validationError)) {
        throw validationError;
      }

      if (attempt < maxRetries) {
        log.warn(
          `Validation failed (attempt ${attempt + 1}/${maxRetries + 1}), retrying with format-enforcement preamble: ${validationError.message}`
        );
      }
    }
  }

  // After all validation retries exhausted, wrap as fatal error
  if (lastError && !isFatalError(lastError)) {
    log.warn(
      `Validation failed after all retries exhausted. Marking as fatal: ${lastError.message}`
    );
    throw new FatalError(lastError.message, 'validation_exhausted');
  }

  throw lastError;
}

module.exports = {
  VALIDATION_RETRY_PREAMBLE,
  applyConfidenceMetadata,
  applyDegenerateDetection,
  applyDisagreementScore,
  applyValidationWarnings,
  injectCostData,
  attachCommonMetadata,
  buildErrorResult,
  calculateCost,
  scopedLogger,
  processWithValidationRetry,
};
