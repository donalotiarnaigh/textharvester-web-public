require('openai/shims/node');
const OpenAI = require('openai');
const BaseVisionProvider = require('./baseProvider');
const { promptManager } = require('../prompts/templates/providerTemplates');
const PerformanceTracker = require('../performanceTracker');
const { withRetry, classifyError } = require('../retryHelper');
const { FatalError } = require('../errorTypes');
const llmAuditLog = require('../llmAuditLog');
const logger = require('../logger');

/**
 * OpenAI-specific implementation for vision models
 * Handles integration with the prompt modularization system
 */
class OpenAIProvider extends BaseVisionProvider {
  constructor(config) {
    super(config);
    this.client = new OpenAI({
      apiKey: this.config.OPENAI_API_KEY || process.env.OPENAI_API_KEY
    });
    this.model = this.config.OPENAI_MODEL || this.config.openAI?.model || 'gpt-5.4';
    this.maxTokens = this.config.MAX_TOKENS || this.config.openAI?.maxTokens || 4000;
    this.temperature = this.config.TEMPERATURE || 0;

    // Read reasoningEffort from config, or auto-detect for GPT-5 models
    this.reasoningEffort = this.config.openAI?.reasoningEffort || null;

    // Auto-detect GPT-5 models and set reasoning.effort to 'none' if not explicitly configured
    if (this.model.includes('gpt-5') && !this.reasoningEffort) {
      this.reasoningEffort = 'none';
      logger.info(`Auto-detected GPT-5 model (${this.model}), setting reasoning.effort to 'none'`);
    }
  }

  /**
   * Get the current model version
   * @returns {string} The model version
   */
  getModelVersion() {
    return this.model;
  }

  /**
   * Process an image using OpenAI's vision capabilities
   * @param {string} base64Image - Base64 encoded image
   * @param {string} prompt - The prompt to send to the model
   * @param {Object} options - Additional options for processing
   * @param {boolean} options.raw - Whether to return raw response without JSON parsing
   * @param {BasePrompt} options.promptTemplate - Optional prompt template to use
   * @returns {Promise<Object>} - Parsed JSON response
   */
  async processImage(base64Image, prompt, options = {}) {
    const retryConfig = this.config.retry || {};
    const maxRetries = retryConfig.maxProviderRetries ?? 3;
    // Allow timeout to be overridden via options, default to 30 seconds
    const baseTimeout = options.timeout || this.config.openAI?.timeout || 30000;

    if (options.timeout && options.timeout !== 30000) {
      logger.debug(`Using custom API timeout: ${options.timeout}ms (default: 30000ms)`);
    }

    // Format prompt if template is provided
    let systemPrompt = options.systemPrompt || 'Return a JSON object with the extracted text details.';
    let userPrompt = prompt;

    if (options.promptTemplate) {
      const formatted = options.promptTemplate.getProviderPrompt('openai');
      systemPrompt = formatted.systemPrompt || systemPrompt;
      userPrompt = formatted.userPrompt || formatted;
    }

    const processingId = options.processingId;
    const startTime = Date.now();
    const imageSizeBytes = base64Image ? Math.round(base64Image.length * 0.75) : 0;

    try {
      const result = await withRetry(
        async (attempt) => {
          const requestPayload = {
            model: this.model,
            messages: [
              {
                role: 'system',
                content: systemPrompt,
              },
              {
                role: 'user',
                content: [
                  { type: 'text', text: userPrompt },
                  {
                    type: 'image_url',
                    image_url: {
                      url: `data:image/jpeg;base64,${base64Image}`,
                    },
                  },
                ],
              },
            ],
            response_format: options.jsonSchema
              ? { type: 'json_schema', json_schema: { name: 'extraction', strict: true, schema: options.jsonSchema } }
              : { type: 'json_object' },
            max_completion_tokens: this.maxTokens
          };

          // Include temperature for models that support it
          requestPayload.temperature = this.temperature;

          // Add reasoning_effort parameter if configured (for GPT-5.x models)
          if (this.reasoningEffort) {
            requestPayload.reasoning_effort = this.reasoningEffort;
          }

          // Calculate timeout with exponential backoff
          const timeout = baseTimeout * attempt;

          // Track API performance with timeout
          const apiResult = await PerformanceTracker.trackAPICall(
            'openai',
            this.model,
            'processImage',
            async () => {
              const timeoutPromise = new Promise((_, reject) => {
                setTimeout(() => reject(new Error(`Request timeout after ${timeout}ms`)), timeout);
              });

              return Promise.race([
                this.client.chat.completions.create(requestPayload),
                timeoutPromise
              ]);
            },
            {
              imageSize: imageSizeBytes,
              promptLength: userPrompt ? userPrompt.length : 0,
              systemPromptLength: systemPrompt ? systemPrompt.length : 0,
              maxTokens: this.maxTokens,
              temperature: requestPayload.temperature || 1,
              attempt: attempt,
              timeout: timeout
            }
          );

          const rawContent = apiResult.choices[0].message.content;
          const usage = {
            input_tokens:           apiResult.usage?.prompt_tokens     ?? 0,
            output_tokens:          apiResult.usage?.completion_tokens ?? 0,
            cache_read_input_tokens: apiResult.usage?.prompt_tokens_details?.cached_tokens ?? 0,
          };

          // Log to audit trail
          const responseTimeMs = Date.now() - startTime;
          if (processingId) {
            await llmAuditLog.logEntry({
              processing_id: processingId,
              provider: 'openai',
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

          if (options.raw) {
            return { content: rawContent, usage };
          }

          try {
            return { content: JSON.parse(rawContent), usage };
          } catch (parseError) {
            logger.error(`OpenAI JSON parsing failed for model ${this.model}`, parseError, {
              phase: 'response_parsing',
              operation: 'processImage',
              contentPreview: rawContent.substring(0, 200),
              attempt: attempt
            });
            throw new Error(`OpenAI processing failed: ${parseError.message}`);
          }
        },
        {
          maxRetries,
          baseDelay: retryConfig.baseDelayMs ?? 1000,
          maxDelay: retryConfig.maxDelayMs ?? 10000,
          jitterMs: retryConfig.jitterMs ?? 1000,
          onRetry: (error, attempt) => {
            const errorType = classifyError(error);
            logger.warn(`OpenAI API attempt ${attempt}/${maxRetries} failed for model ${this.model}`, {
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
          provider: 'openai',
          model: this.model,
          system_prompt: systemPrompt,
          user_prompt: userPrompt,
          image_size_bytes: imageSizeBytes,
          status: 'error',
          error_message: error.message,
          response_time_ms: responseTimeMs
        });
      }

      logger.error(`OpenAI API error for model ${this.model} after ${maxRetries} retries`, error, {
        phase: 'api_call',
        operation: 'processImage'
      });

      // Detect fatal errors and wrap as FatalError
      const errorType = classifyError(error);
      if (['auth_error', 'quota_error', 'config_error'].includes(errorType)) {
        throw new FatalError(`OpenAI processing failed: ${error.message}`, errorType);
      }

      throw new Error(`OpenAI processing failed: ${error.message}`);
    }
  }

  /**
   * Validate provider-specific configuration
   * @returns {boolean} True if configuration is valid
   * @throws {FatalError} If configuration is invalid
   */
  validateConfig() {
    if (!this.client) {
      throw new FatalError('OpenAI client not initialized. Check API key configuration.', 'config_error');
    }
    // Allow GPT-4, GPT-5, and vision models
    const isValidModel = this.model.includes('vision') ||
                        this.model.includes('gpt-4') ||
                        this.model.includes('gpt-5');
    if (!isValidModel) {
      throw new FatalError('Invalid model specified. Must be a vision-capable model (gpt-4, gpt-5, or vision models).', 'config_error');
    }
    return true;
  }

  /**
   * Validate a prompt template for use with this provider
   * @param {BasePrompt} promptTemplate The prompt template to validate
   * @returns {Object} Validation result
   */
  validatePromptTemplate(promptTemplate) {
    return promptManager.validatePrompt(promptTemplate, 'openai');
  }
}

module.exports = OpenAIProvider;
