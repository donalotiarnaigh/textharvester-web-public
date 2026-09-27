const { GoogleGenerativeAI } = require('@google/generative-ai');
const BaseVisionProvider = require('./baseProvider');
const { promptManager } = require('../prompts/templates/providerTemplates');
const PerformanceTracker = require('../performanceTracker');
const { ResponseLengthValidator } = require('../responseLengthValidator');
const { withRetry, classifyError } = require('../retryHelper');
const { FatalError } = require('../errorTypes');
const { extractFirstJsonObject } = require('../jsonExtractor');
const llmAuditLog = require('../llmAuditLog');
const logger = require('../logger');

/**
 * Google Gemini-specific implementation for vision models
 * Handles integration with the prompt modularization system
 */
class GeminiProvider extends BaseVisionProvider {
  constructor(config) {
    super(config);
    this.apiKey = this.config.GEMINI_API_KEY || process.env.GEMINI_API_KEY;
    this.client = this.apiKey ? new GoogleGenerativeAI(this.apiKey) : null;
    this.model = this.config.gemini?.model || 'gemini-3.1-pro';
    this.maxTokens = this.config.gemini?.maxTokens || 8000;
    this.temperature = 0; // Gemini default for consistent extraction
    this.responseValidator = new ResponseLengthValidator();
  }

  /**
   * Get the current model version
   * @returns {string} The model version
   */
  getModelVersion() {
    return this.model;
  }

  /**
   * Process an image using Google Gemini's vision capabilities
   * @param {string} base64Image - Base64 encoded image
   * @param {string|Object} prompt - The prompt to send to the model
   * @param {Object} options - Additional options for processing
   * @param {boolean} options.raw - Whether to return raw response without JSON parsing
   * @param {BasePrompt} options.promptTemplate - Optional prompt template to use
   * @returns {Promise<Object>} - Parsed JSON response with { content, usage }
   */
  async processImage(base64Image, prompt, options = {}) {
    const retryConfig = this.config.retry || {};
    const maxRetries = retryConfig.maxProviderRetries ?? 3;

    // Format prompt if template is provided
    let systemPrompt = options.systemPrompt || 'Return a JSON object with the extracted text details.';
    let userPrompt = '';

    // Handle different prompt formats
    if (typeof prompt === 'string') {
      userPrompt = prompt;
    } else if (prompt && typeof prompt === 'object') {
      systemPrompt = prompt.systemPrompt || systemPrompt;
      userPrompt = prompt.userPrompt || '';
    }

    if (options.promptTemplate) {
      const formatted = options.promptTemplate.getProviderPrompt('gemini');
      systemPrompt = formatted.systemPrompt || systemPrompt;
      userPrompt = formatted.userPrompt || formatted;
    }

    // Ensure userPrompt is a valid string
    if (typeof userPrompt !== 'string') {
      userPrompt = JSON.stringify(userPrompt);
    }

    // Validate and truncate prompt to prevent oversized responses
    const promptValidation = this.responseValidator.validateResponseLength(userPrompt, 'gemini');
    if (promptValidation.needsTruncation) {
      logger.warn(`[GeminiProvider] Prompt too long (${userPrompt.length} chars), truncating to prevent oversized response`);
      userPrompt = this.responseValidator.truncatePromptForProvider(userPrompt, 'gemini');
    }

    // Log the prompt being sent to Gemini for debugging
    logger.info(`[GeminiProvider] Sending prompt to Gemini: ${userPrompt.substring(0, 200)}...`);
    logger.info(`[GeminiProvider] System prompt: ${systemPrompt}`);
    logger.info(`[GeminiProvider] Prompt length: ${userPrompt.length} characters`);

    // Get the Gemini model
    // Gemini's responseSchema uses a restricted JSON Schema subset — strip unsupported keywords
    const geminiSchema = options.jsonSchema ? this._stripGeminiUnsupported(options.jsonSchema) : null;
    const geminiModel = this.client.getGenerativeModel({
      model: this.model,
      systemInstruction: systemPrompt,
      generationConfig: {
        responseMimeType: 'application/json',
        ...(geminiSchema ? { responseSchema: geminiSchema } : {}),
        maxOutputTokens: this.maxTokens,
        temperature: this.temperature
      }
    });

    const processingId = options.processingId;
    const startTime = Date.now();
    const imageSizeBytes = base64Image ? Math.round(base64Image.length * 0.75) : 0;

    try {
      const result = await withRetry(
        async (attempt) => {
          // Track API performance
          const response = await PerformanceTracker.trackAPICall(
            'gemini',
            this.model,
            'processImage',
            async () => {
              return await geminiModel.generateContent([
                { text: userPrompt },
                {
                  inlineData: {
                    data: base64Image,
                    mimeType: 'image/jpeg'
                  }
                }
              ]);
            },
            {
              imageSize: imageSizeBytes,
              promptLength: userPrompt ? userPrompt.length : 0,
              systemPromptLength: systemPrompt ? systemPrompt.length : 0,
              maxTokens: this.maxTokens,
              temperature: this.temperature,
              attempt
            }
          );

          // Extract the text content from the response
          const rawContent = response.response.text();

          // Normalize usage from Gemini response
          const usage = {
            input_tokens: response.response.usageMetadata?.promptTokenCount ?? 0,
            output_tokens: response.response.usageMetadata?.candidatesTokenCount ?? 0
          };

          if (!rawContent) {
            throw new Error('No text content in response');
          }

          // Log to audit trail
          const responseTimeMs = Date.now() - startTime;
          if (processingId) {
            await llmAuditLog.logEntry({
              processing_id: processingId,
              provider: 'gemini',
              model: this.model,
              system_prompt: systemPrompt,
              user_prompt: userPrompt,
              image_size_bytes: imageSizeBytes,
              raw_response: rawContent,
              input_tokens: usage.input_tokens,
              output_tokens: usage.output_tokens,
              response_time_ms: responseTimeMs,
              status: 'success'
            });
          }

          // Validate response length to detect potential truncation issues
          const responseValidation = this.responseValidator.validateResponseLength(rawContent, 'gemini');
          if (responseValidation.exceedsLimit) {
            logger.warn(`[GeminiProvider] Response exceeds limit (${rawContent.length}/${responseValidation.maxLength} chars) - may be truncated`);
          } else if (responseValidation.isApproachingLimit) {
            logger.info(`[GeminiProvider] Response approaching limit (${rawContent.length}/${responseValidation.maxLength} chars)`);
          }

          // Return raw content if requested
          if (options.raw) {
            return { content: rawContent, usage };
          }

          // Parse the JSON response, handling the case where it's wrapped in a code block
          let jsonContent = rawContent;
          let extractionMethod = 'direct';

          // Check if the content is wrapped in a code block (```json ... ```)
          const codeBlockMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)```/);
          if (codeBlockMatch) {
            jsonContent = codeBlockMatch[1].trim();
            extractionMethod = 'code_block';
          }

          // Use balanced-brace scanner to extract first complete JSON object
          const extracted = extractFirstJsonObject(jsonContent);
          if (extracted) {
            if (extractionMethod !== 'code_block') {
              extractionMethod = 'balanced_brace';
            }
            jsonContent = extracted;
          }

          // Log extraction method and response lengths for debugging
          logger.debug(`[GeminiProvider] Extraction method: ${extractionMethod}`);
          logger.info(`[GeminiProvider] Response length: ${rawContent.length} characters`);
          logger.info(`[GeminiProvider] JSON content length: ${jsonContent.length} characters`);
          logger.info(`[GeminiProvider] Response ends with: "${rawContent.slice(-50)}"`);
          logger.info(`[GeminiProvider] JSON content ends with: "${jsonContent.slice(-50)}"`);

          // Use ResponseLengthValidator for robust JSON parsing
          const validationResult = this.responseValidator.validateAndRepairJson(jsonContent);

          if (!validationResult.isValid) {
            logger.error(`Gemini JSON parsing failed for model ${this.model}`, validationResult.error, {
              phase: 'response_parsing',
              operation: 'processImage',
              contentLength: rawContent.length,
              jsonContentLength: jsonContent.length,
              contentPreview: jsonContent.substring(0, 500),
              attempt
            });
            throw new Error(`Failed to parse JSON response: ${validationResult.error}`);
          }

          // Log if JSON was repaired
          if (validationResult.repaired) {
            extractionMethod = 'repaired';
            logger.info(`[GeminiProvider] JSON response was successfully repaired (${validationResult.originalLength} -> ${validationResult.repairedLength} chars)`);
          }
          logger.debug(`[GeminiProvider] Final extraction method: ${extractionMethod}`);

          return { content: validationResult.json, usage };
        },
        {
          maxRetries,
          baseDelay: retryConfig.baseDelayMs ?? 1000,
          maxDelay: retryConfig.maxDelayMs ?? 10000,
          jitterMs: retryConfig.jitterMs ?? 1000,
          onRetry: (error, attempt) => {
            const errorType = classifyError(error);
            logger.warn(`Gemini API attempt ${attempt}/${maxRetries} failed for model ${this.model}`, {
              error: error.message,
              errorType,
              attempt,
              maxRetries
            });
          }
        }
      );

      return result;
    } catch (error) {
      // Log error to audit trail
      const responseTimeMs = Date.now() - startTime;
      if (processingId) {
        await llmAuditLog.logEntry({
          processing_id: processingId,
          provider: 'gemini',
          model: this.model,
          system_prompt: systemPrompt,
          user_prompt: userPrompt,
          image_size_bytes: imageSizeBytes,
          status: 'error',
          error_message: error.message,
          response_time_ms: responseTimeMs
        });
      }

      logger.error(`Gemini API error for model ${this.model} after ${maxRetries} retries`, error, {
        phase: 'api_call',
        operation: 'processImage'
      });
      logger.debugPayload('Gemini API error details:', {
        model: this.model,
        error: error.message,
        stack: error.stack
      });

      // Detect fatal errors and wrap as FatalError
      const errorType = classifyError(error);
      if (['auth_error', 'quota_error', 'config_error'].includes(errorType)) {
        throw new FatalError(`Gemini processing failed: ${error.message}`, errorType);
      }

      throw new Error(`Gemini processing failed: ${error.message}`);
    }
  }

  /**
   * Strip JSON Schema keywords unsupported by Gemini's responseSchema (e.g. additionalProperties).
   * Recursively cleans nested objects and array item schemas.
   * @param {Object} schema - JSON Schema object
   * @returns {Object} Cleaned schema safe for Gemini
   */
  _stripGeminiUnsupported(schema) {
    if (!schema || typeof schema !== 'object') return schema;
    const UNSUPPORTED = new Set(['additionalProperties', '$schema', '$id', 'definitions', '$defs']);
    const result = {};
    for (const [key, value] of Object.entries(schema)) {
      if (UNSUPPORTED.has(key)) continue;
      if (key === 'type' && Array.isArray(value)) {
        // Gemini doesn't support type arrays — convert ['string', 'null'] → type:'string', nullable:true
        const nonNull = value.filter(t => t !== 'null');
        result.type = nonNull.length === 1 ? nonNull[0] : 'string';
        if (value.includes('null')) result.nullable = true;
      } else if (key === 'properties' && value && typeof value === 'object') {
        result[key] = Object.fromEntries(
          Object.entries(value).map(([k, v]) => [k, this._stripGeminiUnsupported(v)])
        );
      } else if (key === 'items') {
        result[key] = this._stripGeminiUnsupported(value);
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  /**
   * Validate provider-specific configuration
   * @returns {boolean} True if configuration is valid
   * @throws {FatalError} If configuration is invalid
   */
  validateConfig() {
    // Check for API key - use instance property directly
    const hasApiKey = this.apiKey || (this.client !== null);
    if (!hasApiKey) {
      throw new FatalError('Gemini API key not configured. Check GEMINI_API_KEY environment variable or config.', 'config_error');
    }
    if (!this.model.toLowerCase().includes('gemini')) {
      throw new FatalError('Invalid model specified. Must be a Gemini model.', 'config_error');
    }
    return true;
  }

  /**
   * Validate a prompt template for use with this provider
   * @param {BasePrompt} promptTemplate The prompt template to validate
   * @returns {Object} Validation result
   */
  validatePromptTemplate(promptTemplate) {
    return promptManager.validatePrompt(promptTemplate, 'gemini');
  }
}

module.exports = GeminiProvider;
