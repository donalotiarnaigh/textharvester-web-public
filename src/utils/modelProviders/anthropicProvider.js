const Anthropic = require('@anthropic-ai/sdk');
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
 * Anthropic-specific implementation for vision models
 * Handles integration with the prompt modularization system
 */
class AnthropicProvider extends BaseVisionProvider {
  constructor(config) {
    super(config);
    this.client = new Anthropic({
      apiKey: this.config.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY
    });
    this.model = this.config.ANTHROPIC_MODEL || this.config.anthropic?.model || 'claude-opus-4-6';
    this.maxTokens = this.config.MAX_TOKENS || this.config.anthropic?.maxTokens || 8000;  // Increased for monument photos
    this.temperature = this.config.TEMPERATURE || 0;
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
   * Process an image using Anthropic Claude's vision capabilities
   * @param {string} base64Image - Base64 encoded image
   * @param {string|Object} prompt - The prompt to send to the model
   * @param {Object} options - Additional options for processing
   * @param {boolean} options.raw - Whether to return raw response without JSON parsing
   * @param {BasePrompt} options.promptTemplate - Optional prompt template to use
   * @returns {Promise<Object>} - Parsed JSON response
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
      const formatted = options.promptTemplate.getProviderPrompt('anthropic');
      systemPrompt = formatted.systemPrompt || systemPrompt;
      userPrompt = formatted.userPrompt || formatted;
    }

    // Ensure userPrompt is a valid string
    if (typeof userPrompt !== 'string') {
      userPrompt = JSON.stringify(userPrompt);
    }

    // Validate and truncate prompt to prevent oversized responses
    const promptValidation = this.responseValidator.validateResponseLength(userPrompt, 'anthropic');
    if (promptValidation.needsTruncation) {
      logger.warn(`[AnthropicProvider] Prompt too long (${userPrompt.length} chars), truncating to prevent oversized response`);
      userPrompt = this.responseValidator.truncatePromptForProvider(userPrompt, 'anthropic');
    }

    // Log the prompt being sent to Claude for debugging
    logger.info(`[AnthropicProvider] Sending prompt to Claude: ${userPrompt.substring(0, 200)}...`);
    logger.info(`[AnthropicProvider] System prompt: ${systemPrompt}`);
    logger.info(`[AnthropicProvider] Prompt length: ${userPrompt.length} characters`);

    const processingId = options.processingId;
    const startTime = Date.now();
    const imageSizeBytes = base64Image ? Math.round(base64Image.length * 0.75) : 0;

    try {
      const result = await withRetry(
        async (attempt) => {
          // Build API call params: tool-use when jsonSchema present, plain messages otherwise
          const apiParams = this._buildApiCallParams(systemPrompt, userPrompt, base64Image, options.jsonSchema);

          // Track API performance
          const apiResult = await PerformanceTracker.trackAPICall(
            'anthropic',
            this.model,
            'processImage',
            async () => this.client.messages.create(apiParams),
            {
              imageSize: imageSizeBytes,
              promptLength: userPrompt ? userPrompt.length : 0,
              systemPromptLength: systemPrompt ? systemPrompt.length : 0,
              maxTokens: this.maxTokens,
              temperature: this.temperature,
              attempt
            }
          );

          const usage = {
            input_tokens:  apiResult.usage?.input_tokens  ?? 0,
            output_tokens: apiResult.usage?.output_tokens ?? 0,
            cache_creation_input_tokens: apiResult.usage?.cache_creation_input_tokens ?? 0,
            cache_read_input_tokens:     apiResult.usage?.cache_read_input_tokens     ?? 0,
          };

          // Tool-use path: content[0].input is already a parsed object
          if (options.jsonSchema) {
            const toolBlock = apiResult.content.find(item => item.type === 'tool_use');
            if (!toolBlock) {
              throw new Error('No tool_use block in response');
            }
            const parsedContent = toolBlock.input;
            const rawContent = JSON.stringify(parsedContent);

            const responseTimeMs = Date.now() - startTime;
            if (processingId) {
              await llmAuditLog.logEntry({
                processing_id: processingId,
                provider: 'anthropic',
                model: this.model,
                system_prompt: systemPrompt,
                user_prompt: userPrompt,
                image_size_bytes: imageSizeBytes,
                raw_response: rawContent,
                input_tokens: usage.input_tokens,
                output_tokens: usage.output_tokens,
                cache_creation_tokens: usage.cache_creation_input_tokens,
                cache_read_tokens: usage.cache_read_input_tokens,
                response_time_ms: responseTimeMs,
                status: 'success'
              });
            }

            if (options.raw) {
              return { content: rawContent, usage };
            }

            if (this.isInvalidResponse(parsedContent)) {
              logger.warn('[AnthropicProvider] Tool-use response appears to contain invalid data');
              throw new Error('Invalid response: Claude returned dashes instead of actual text. This may indicate image quality issues or prompt confusion.');
            }

            return { content: parsedContent, usage };
          }

          // Plain text path (existing logic unchanged)
          const rawContent = apiResult.content.find(item => item.type === 'text')?.text;

          if (!rawContent) {
            throw new Error('No text content in response');
          }

          // Log to audit trail
          const responseTimeMs = Date.now() - startTime;
          if (processingId) {
            await llmAuditLog.logEntry({
              processing_id: processingId,
              provider: 'anthropic',
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
          const responseValidation = this.responseValidator.validateResponseLength(rawContent, 'anthropic');
          if (responseValidation.exceedsLimit) {
            logger.warn(`[AnthropicProvider] Response exceeds limit (${rawContent.length}/${responseValidation.maxLength} chars) - may be truncated`);
          } else if (responseValidation.isApproachingLimit) {
            logger.info(`[AnthropicProvider] Response approaching limit (${rawContent.length}/${responseValidation.maxLength} chars)`);
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
          logger.debug(`[AnthropicProvider] Extraction method: ${extractionMethod}`);
          logger.info(`[AnthropicProvider] Response length: ${rawContent.length} characters`);
          logger.info(`[AnthropicProvider] JSON content length: ${jsonContent.length} characters`);
          logger.info(`[AnthropicProvider] Response ends with: "${rawContent.slice(-50)}"`);
          logger.info(`[AnthropicProvider] JSON content ends with: "${jsonContent.slice(-50)}"`);

          // Use ResponseLengthValidator for robust JSON parsing
          const validationResult = this.responseValidator.validateAndRepairJson(jsonContent);

          if (!validationResult.isValid) {
            logger.error(`Anthropic JSON parsing failed for model ${this.model}`, validationResult.error, {
              phase: 'response_parsing',
              operation: 'processImage',
              contentLength: rawContent.length,
              jsonContentLength: jsonContent.length,
              contentPreview: jsonContent.substring(0, 500),
              attempt
            });
            throw new Error(`Failed to parse JSON response: ${validationResult.error}`);
          }

          // Validate that the response contains actual text, not just dashes
          if (this.isInvalidResponse(validationResult.json)) {
            logger.warn('[AnthropicProvider] Response appears to contain invalid data (likely dashes instead of actual text)');
            throw new Error('Invalid response: Claude returned dashes instead of actual text. This may indicate image quality issues or prompt confusion.');
          }

          // Log if JSON was repaired
          if (validationResult.repaired) {
            extractionMethod = 'repaired';
            logger.info(`[AnthropicProvider] JSON response was successfully repaired (${validationResult.originalLength} -> ${validationResult.repairedLength} chars)`);
          }
          logger.debug(`[AnthropicProvider] Final extraction method: ${extractionMethod}`);

          return { content: validationResult.json, usage };
        },
        {
          maxRetries,
          baseDelay: retryConfig.baseDelayMs ?? 1000,
          maxDelay: retryConfig.maxDelayMs ?? 10000,
          jitterMs: retryConfig.jitterMs ?? 1000,
          onRetry: (error, attempt) => {
            const errorType = classifyError(error);
            logger.warn(`Anthropic API attempt ${attempt}/${maxRetries} failed for model ${this.model}`, {
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
          provider: 'anthropic',
          model: this.model,
          system_prompt: systemPrompt,
          user_prompt: userPrompt,
          image_size_bytes: imageSizeBytes,
          status: 'error',
          error_message: error.message,
          response_time_ms: responseTimeMs
        });
      }

      logger.error(`Anthropic API error for model ${this.model} after ${maxRetries} retries`, error, {
        phase: 'api_call',
        operation: 'processImage'
      });
      logger.debugPayload('Anthropic API error details:', {
        model: this.model,
        error: error.message,
        stack: error.stack
      });

      // Detect fatal errors and wrap as FatalError
      const errorType = classifyError(error);
      if (['auth_error', 'quota_error', 'config_error'].includes(errorType)) {
        throw new FatalError(`Anthropic processing failed: ${error.message}`, errorType);
      }

      throw new Error(`Anthropic processing failed: ${error.message}`);
    }
  }

  /**
   * Build Anthropic API call params: tool-use when jsonSchema present, plain messages otherwise.
   */
  _buildApiCallParams(systemPrompt, userPrompt, base64Image, jsonSchema) {
    // cache_control on the user TEXT block marks the end of the static cacheable prefix:
    // system prompt (~33t) + tools/schema (~750t) + instruction text (~750t) ≈ 1533 tokens
    // exceeding Anthropic's 1024-token minimum. The image content block is dynamic and
    // excluded from the cache, so only the text instruction is marked as the cache boundary.
    const userContent = [
      { type: 'text', text: userPrompt, cache_control: { type: 'ephemeral' } },
      { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: base64Image } }
    ];
    if (jsonSchema) {
      return {
        model: this.model,
        max_tokens: this.maxTokens,
        temperature: this.temperature,
        system: systemPrompt,
        tools: [{ name: 'extract', description: 'Extract structured data from the image.', input_schema: jsonSchema }],
        tool_choice: { type: 'tool', name: 'extract' },
        messages: [{ role: 'user', content: userContent }]
      };
    }
    return {
      model: this.model,
      max_tokens: this.maxTokens,
      temperature: this.temperature,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }]
    };
  }

  /**
   * Check if the response contains invalid data (like dashes instead of actual text)
   * @param {Object} response The parsed JSON response
   * @returns {boolean} True if the response appears invalid
   */
  isInvalidResponse(response) {
    if (!response || typeof response !== 'object') {
      return true;
    }

    // Check if inscription field contains mostly dashes
    if (response.inscription && typeof response.inscription === 'string') {
      const inscription = response.inscription.trim();

      // If inscription is very long and contains mostly dashes, it's likely invalid
      if (inscription.length > 1000) {
        const dashCount = (inscription.match(/-/g) || []).length;
        const dashRatio = dashCount / inscription.length;

        // If more than 80% of the text is dashes, it's likely invalid
        if (dashRatio > 0.8) {
          logger.warn(`[AnthropicProvider] Inscription field contains ${dashRatio.toFixed(2)} dashes (${dashCount}/${inscription.length} characters)`);
          return true;
        }
      }

      // Check for patterns that indicate invalid responses
      if (inscription.includes('----------|----------|----------')) {
        logger.warn('[AnthropicProvider] Inscription contains repeated dash patterns');
        return true;
      }
    }

    // Check if name fields contain only dashes
    if (response.first_name && typeof response.first_name === 'string') {
      const firstName = response.first_name.trim();
      if (firstName.length > 10 && /^-+$/.test(firstName)) {
        logger.warn(`[AnthropicProvider] First name contains only dashes: "${firstName}"`);
        return true;
      }
    }

    if (response.last_name && typeof response.last_name === 'string') {
      const lastName = response.last_name.trim();
      if (lastName.length > 10 && /^-+$/.test(lastName)) {
        logger.warn(`[AnthropicProvider] Last name contains only dashes: "${lastName}"`);
        return true;
      }
    }

    return false;
  }

  /**
   * Validate provider-specific configuration
   * @returns {boolean} True if configuration is valid
   * @throws {Error} If configuration is invalid
   */
  validateConfig() {
    if (!this.client) {
      throw new FatalError('Anthropic client not initialized. Check API key configuration.', 'config_error');
    }
    if (!this.model.includes('opus') && !this.model.includes('sonnet') && !this.model.includes('haiku') && !this.model.includes('claude-4')) {
      throw new FatalError('Invalid model specified. Must be a vision-capable model.', 'config_error');
    }
    return true;
  }

  /**
   * Validate a prompt template for use with this provider
   * @param {BasePrompt} promptTemplate The prompt template to validate
   * @returns {Object} Validation result
   */
  validatePromptTemplate(promptTemplate) {
    return promptManager.validatePrompt(promptTemplate, 'anthropic');
  }
}

module.exports = AnthropicProvider;
