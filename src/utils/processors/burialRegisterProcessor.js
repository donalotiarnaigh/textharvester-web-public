const fs = require('fs').promises;
const path = require('path');
const burialRegisterFlattener = require('../burialRegisterFlattener');
const burialRegisterStorage = require('../burialRegisterStorage');
const { extractPageNumberFromFilename } = require('../burialRegisterStorage');
const {
  applyConfidenceMetadata,
  applyDegenerateDetection,
  applyDisagreementScore,
  applyValidationWarnings,
  injectCostData,
  attachCommonMetadata,
  processWithValidationRetry,
} = require('../processingHelpers');

/**
 * Process burial register files
 * Handles multi-entry page extraction, validation, cost tracking, and storage
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
 * @returns {Promise<Object>} Processing result with entries and pageData
 */
async function burialRegisterProcessor(context) {
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
  const filename = path.basename(filePath);
  log.info(`Processing burial register file via ${providerName}: ${filePath}`);

  // Use longer timeout for burial register processing (configurable, default 90 seconds)
  const burialRegisterTimeout = config.burialRegister?.apiTimeout || 90000;
  log.debug(`Using API timeout of ${burialRegisterTimeout}ms for burial register processing`);

  const volumeId = options.volume_id || options.volumeId || config.burialRegister?.volumeId || 'vol1';

  const { validationResult, usage: burialUsage, rawResponse } = await processWithValidationRetry(
    provider,
    base64Image,
    userPrompt,
    {
      systemPrompt,
      promptTemplate: promptInstance,
      timeout: burialRegisterTimeout,
      log,
      processingId,
      ...(config.schemaConstrained?.enabled && promptInstance.getJsonSchema
        ? { jsonSchema: promptInstance.getJsonSchema() }
        : {})
    },
    (raw) => {
      if (raw && typeof raw === 'object') {
        raw.volume_id = volumeId;
      }
      return promptInstance.validateAndConvertPage(raw);
    }
  );

  const pageData = validationResult.data;

  applyDegenerateDetection(pageData, rawResponse, sourceType, config);

  const apiDuration = Date.now() - startTime;
  log.info(`Burial register API call completed in ${apiDuration}ms for ${filePath}`);

  log.debugPayload(`Validated burial register page data for ${filePath}:`, pageData);

  // Extract page number from filename for entry_id generation
  const filenamePageNumber = extractPageNumberFromFilename(filename);

  if (filenamePageNumber !== null) {
    log.info(
      `Extracted page number ${filenamePageNumber} from filename ${filename} for entry_id generation`
    );
  } else {
    log.warn(
      `Could not extract page number from filename ${filename}, will use AI-extracted page_number for entry_id`
    );
  }

  // Pass filename page number for entry_id generation only (pageData.page_number remains AI-extracted)
  const entries = burialRegisterFlattener.flattenPageToEntries(
    pageData,
    {
      provider: providerName,
      model: provider.getModelVersion(),
      filePath,
    },
    filenamePageNumber
  );

  await burialRegisterStorage.storePageJSON(
    pageData,
    providerName,
    pageData.volume_id,
    pageData.page_number
  );

  log.info(`Prepared ${entries.length} burial register entries for ${filePath}`);

  const processedEntries = [];
  let validCount = 0;
  let totalCount = entries.length;
  let duplicateCount = 0;

  for (const entry of entries) {
    try {
      const validationResult = promptInstance.validateAndConvertEntry(entry);
      const validatedEntry = validationResult.data;
      const entryConfidenceScores = validationResult.confidenceScores;
      const entryValidationWarnings = validationResult.validationWarnings;

      const burialCostConfig = config.costs?.[providerName]?.[provider.getModelVersion()] || {};
      const entryWithMetadata = {
        ...validatedEntry,
        volume_id: entry.volume_id,
        page_number: entry.page_number,
        parish_header_raw: entry.parish_header_raw ?? null,
        county_header_raw: entry.county_header_raw ?? null,
        year_header_raw: entry.year_header_raw ?? null,
        fileName: filename,
        ai_provider: providerName,
        model_name: provider.getModelVersion(),
        model_run_id: entry.model_run_id ?? null,
        prompt_template: 'burialRegister',
        prompt_version: promptInstance.version,
        source_type: sourceType,
        input_tokens: burialUsage.input_tokens,
        output_tokens: burialUsage.output_tokens,
        estimated_cost_usd: ((burialUsage.input_tokens / 1_000_000) * (burialCostConfig.inputPerMToken || 0)) +
          ((burialUsage.output_tokens / 1_000_000) * (burialCostConfig.outputPerMToken || 0)),
        processing_id: processingId,
        ...(options.project_id && { project_id: options.project_id })
      };

      // Apply confidence metadata
      applyConfidenceMetadata(entryWithMetadata, entryConfidenceScores, config);

      // Apply validation warnings
      applyValidationWarnings(
        entryWithMetadata,
        [...(entryValidationWarnings || []), ...(pageData._validation_warnings || [])]
      );

      applyDisagreementScore(entryWithMetadata, config);

      await burialRegisterStorage.storeBurialRegisterEntry(entryWithMetadata);

      processedEntries.push(entryWithMetadata);
      validCount++;
    } catch (error) {
      // Check if this is a duplicate entry
      if (error.isDuplicate) {
        duplicateCount++;
        log.warn(`Duplicate entry skipped: ${error.message}`);
      } else {
        log.warn(
          `Entry validation or storage failed for entry_id=${entry.entry_id || 'unknown'}, page_number=${pageData.page_number}, volume_id=${pageData.volume_id}: ${error.message}`
        );
      }
    }
  }

  if (validCount < totalCount) {
    log.warn(`Validated ${validCount}/${totalCount} entries successfully for ${filePath}`);
    if (duplicateCount > 0) {
      log.info(`Skipped ${duplicateCount} duplicate entries for ${filePath}`);
    }
  }

  if (processedEntries.length > 0) {
    const firstEntryId = processedEntries[0].entry_id;
    const lastEntryId = processedEntries[processedEntries.length - 1].entry_id;
    log.info(
      `Stored ${processedEntries.length} burial register entries for page ${pageData.page_number} (${filePath}). Entry IDs: ${firstEntryId} to ${lastEntryId}`
    );
  } else {
    const errorMessage =
      duplicateCount > 0
        ? `${duplicateCount} entries were duplicates and ${totalCount - duplicateCount} entries failed validation or storage.`
        : 'All entries failed validation or storage.';
    log.warn(
      `No entries were stored for page ${pageData.page_number} (${filePath}). ${errorMessage}`
    );
  }

  await fs.unlink(filePath);
  log.info(`Cleaned up processed burial register file: ${filePath}`);

  return {
    entries: processedEntries,
    pageData,
  };
}

module.exports = burialRegisterProcessor;
