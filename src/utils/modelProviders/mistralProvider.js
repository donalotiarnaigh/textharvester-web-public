const { Mistral } = require('@mistralai/mistralai');
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
 * Mistral OCR provider — two-step pipeline:
 *   Step 1: POST /v1/ocr  (mistral-ocr-latest) — image → markdown text
 *   Step 2: POST /v1/chat/completions (mistral-large-latest) — markdown + prompt → structured JSON
 *
 * This preserves the standard processImage() → { content, usage } contract.
 * Usage includes pages_processed (from OCR) alongside token counts (from chat).
 */
class MistralProvider extends BaseVisionProvider {
  constructor(config) {
    super(config);
    this.apiKey = this.config.MISTRAL_API_KEY || process.env.MISTRAL_API_KEY;
    this.client = new Mistral({ apiKey: this.apiKey || '' });
    this.ocrModel = this.config.mistral?.ocrModel || 'mistral-ocr-latest';
    this.chatModel = this.config.mistral?.chatModel || 'mistral-large-latest';
    this.maxTokens = this.config.mistral?.maxTokens || 8000;
    this.responseValidator = new ResponseLengthValidator();
  }

  /**
   * Returns the chat model string used for JSON structuring.
   * @returns {string}
   */
  getModelVersion() {
    return this.chatModel;
  }

  /**
   * Validate provider configuration.
   * @returns {boolean}
   * @throws {FatalError} when API key is missing
   */
  validateConfig() {
    if (!this.apiKey) {
      throw new FatalError(
        'Mistral API key not configured. Check MISTRAL_API_KEY environment variable or config.',
        'config_error'
      );
    }
    return true;
  }

  /**
   * Validate a prompt template for use with this provider.
   * @param {BasePrompt} promptTemplate
   * @returns {Object} validation result
   */
  validatePromptTemplate(promptTemplate) {
    return promptManager.validatePrompt(promptTemplate, 'mistral');
  }

  /**
   * Process an image using a two-step Mistral pipeline:
   *  1. OCR extraction via mistral-ocr-latest → raw markdown
   *  2. JSON structuring via mistral-large-latest using the prompt template + OCR text
   *
   * @param {string} base64Image - Base64-encoded JPEG image
   * @param {string|Object} prompt - Extraction prompt or { systemPrompt, userPrompt }
   * @param {Object} options
   * @param {boolean} [options.raw] - When true, returns raw OCR markdown instead of parsed JSON
   * @param {BasePrompt} [options.promptTemplate] - Optional prompt template (calls getProviderPrompt('mistral'))
   * @param {string} [options.processingId] - Correlation ID for audit logging
   * @returns {Promise<{ content: Object, usage: { input_tokens, output_tokens, pages_processed } }>}
   */
  async processImage(base64Image, prompt, options = {}) {
    const retryConfig = this.config.retry || {};
    const maxRetries = retryConfig.maxProviderRetries ?? 3;

    // Resolve system and user prompts
    let systemPrompt = 'You are an expert OCR system specializing in heritage and genealogical data extraction.';
    let userPrompt = '';

    if (typeof prompt === 'string') {
      userPrompt = prompt;
    } else if (prompt && typeof prompt === 'object') {
      systemPrompt = prompt.systemPrompt || systemPrompt;
      userPrompt = prompt.userPrompt || '';
    }

    if (options.promptTemplate) {
      const formatted = options.promptTemplate.getProviderPrompt('mistral');
      systemPrompt = formatted.systemPrompt || systemPrompt;
      userPrompt = formatted.userPrompt || userPrompt;
    }

    if (typeof userPrompt !== 'string') {
      userPrompt = JSON.stringify(userPrompt);
    }

    const processingId = options.processingId;
    const startTime = Date.now();
    const imageSizeBytes = base64Image ? Math.round(base64Image.length * 0.75) : 0;

    // ── Step 1: OCR extraction ──────────────────────────────────────────────
    let ocrText;
    let pagesProcessed;
    try {
      logger.info(`[MistralProvider] Starting OCR step with model ${this.ocrModel}`);
      const ocrResponse = await this.client.ocr.process({
        model: this.ocrModel,
        document: {
          type: 'image_url',
          imageUrl: `data:image/jpeg;base64,${base64Image}`
        }
      });
      ocrText = (ocrResponse.pages || []).map(p => p.markdown || '').join('\n\n');
      pagesProcessed = ocrResponse.usageInfo?.pagesProcessed ?? ocrResponse.pages?.length ?? 1;
      logger.info(`[MistralProvider] OCR complete — ${pagesProcessed} page(s), ${ocrText.length} chars extracted`);
    } catch (error) {
      const responseTimeMs = Date.now() - startTime;
      if (processingId) {
        await llmAuditLog.logEntry({
          processing_id: processingId,
          provider: 'mistral',
          model: this.ocrModel,
          system_prompt: systemPrompt,
          user_prompt: userPrompt,
          image_size_bytes: imageSizeBytes,
          status: 'error',
          error_message: error.message,
          response_time_ms: responseTimeMs
        });
      }
      const errorType = classifyError(error);
      if (['auth_error', 'quota_error', 'config_error'].includes(errorType)) {
        throw new FatalError(`Mistral processing failed: ${error.message}`, errorType);
      }
      throw new Error(`Mistral processing failed: ${error.message}`);
    }

    // When raw mode is requested, return the OCR text directly without the chat step
    if (options.raw) {
      const usage = { input_tokens: 0, output_tokens: 0, pages_processed: pagesProcessed };
      return { content: ocrText, usage };
    }

    // ── Step 2: JSON structuring via chat model ─────────────────────────────
    const combinedUserPrompt = `${userPrompt}\n\nExtracted text:\n${ocrText}`;

    try {
      const result = await withRetry(
        async (attempt) => {
          const response = await PerformanceTracker.trackAPICall(
            'mistral',
            this.chatModel,
            'processImage',
            async () => {
              return await this.client.chat.complete({
                model: this.chatModel,
                maxTokens: this.maxTokens,
                temperature: 0,
                messages: [
                  { role: 'system', content: systemPrompt },
                  { role: 'user', content: combinedUserPrompt }
                ]
              });
            },
            {
              imageSize: imageSizeBytes,
              promptLength: combinedUserPrompt.length,
              systemPromptLength: systemPrompt.length,
              maxTokens: this.maxTokens,
              temperature: 0,
              attempt
            }
          );

          const rawContent = response.choices?.[0]?.message?.content ?? '';
          const chatUsage = response.usage || {};
          const usage = {
            input_tokens: chatUsage.promptTokens ?? 0,
            output_tokens: chatUsage.completionTokens ?? 0,
            pages_processed: pagesProcessed
          };

          if (!rawContent) {
            throw new Error('No text content in chat response');
          }

          const responseTimeMs = Date.now() - startTime;
          if (processingId) {
            await llmAuditLog.logEntry({
              processing_id: processingId,
              provider: 'mistral',
              model: this.chatModel,
              system_prompt: systemPrompt,
              user_prompt: combinedUserPrompt,
              image_size_bytes: imageSizeBytes,
              raw_response: rawContent,
              input_tokens: usage.input_tokens,
              output_tokens: usage.output_tokens,
              response_time_ms: responseTimeMs,
              status: 'success'
            });
          }

          // Extract JSON from response (handles code blocks and bare JSON)
          let jsonContent = rawContent;
          const codeBlockMatch = rawContent.match(/```(?:json)?\s*([\s\S]*?)```/);
          if (codeBlockMatch) {
            jsonContent = codeBlockMatch[1].trim();
          }
          const extracted = extractFirstJsonObject(jsonContent);
          if (extracted) {
            jsonContent = extracted;
          }

          const validationResult = this.responseValidator.validateAndRepairJson(jsonContent);
          if (!validationResult.isValid) {
            logger.error(`Mistral JSON parsing failed for model ${this.chatModel}`, validationResult.error, {
              phase: 'response_parsing',
              operation: 'processImage',
              contentPreview: jsonContent.substring(0, 500),
              attempt
            });
            throw new Error(`Failed to parse JSON response: ${validationResult.error}`);
          }

          if (validationResult.repaired) {
            logger.info(`[MistralProvider] JSON response repaired (${validationResult.originalLength} → ${validationResult.repairedLength} chars)`);
          }

          return { content: validationResult.json, usage };
        },
        {
          maxRetries,
          baseDelay: retryConfig.baseDelayMs ?? 1000,
          maxDelay: retryConfig.maxDelayMs ?? 10000,
          jitterMs: retryConfig.jitterMs ?? 1000,
          onRetry: (error, attempt) => {
            const errorType = classifyError(error);
            logger.warn(`Mistral chat attempt ${attempt}/${maxRetries} failed for model ${this.chatModel}`, {
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
      const responseTimeMs = Date.now() - startTime;
      if (processingId) {
        await llmAuditLog.logEntry({
          processing_id: processingId,
          provider: 'mistral',
          model: this.chatModel,
          system_prompt: systemPrompt,
          user_prompt: combinedUserPrompt,
          image_size_bytes: imageSizeBytes,
          status: 'error',
          error_message: error.message,
          response_time_ms: responseTimeMs
        });
      }

      logger.error(`Mistral chat error for model ${this.chatModel} after ${maxRetries} retries`, error, {
        phase: 'api_call',
        operation: 'processImage'
      });

      const errorType = classifyError(error);
      if (['auth_error', 'quota_error', 'config_error'].includes(errorType)) {
        throw new FatalError(`Mistral processing failed: ${error.message}`, errorType);
      }
      throw new Error(`Mistral processing failed: ${error.message}`);
    }
  }
}

module.exports = MistralProvider;
