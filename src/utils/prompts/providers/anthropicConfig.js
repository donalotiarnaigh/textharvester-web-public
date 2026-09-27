const { ProviderConfig, PROVIDER_TYPES } = require('./providerConfig');

/**
 * Anthropic-specific provider configuration
 */
class AnthropicConfig extends ProviderConfig {
  /**
   * @param {Object} options - Anthropic configuration
   * @param {string} [options.model='claude-3-opus'] - Anthropic model name
   * @param {Object} [options.responseFormat] - Response format configuration
   */
  constructor(options = {}) {
    super(PROVIDER_TYPES.ANTHROPIC);
    
    this.model = options.model || 'claude-sonnet-4-5';
    if (!this.isSupportedModel(this.model)) {
      throw new Error('Unsupported Anthropic model');
    }
  }

  isSupportedModel(model) {
    return [
      'claude-3-opus',
      'claude-3-sonnet',
      'claude-3-haiku',
      'claude-4-sonnet-20250514',
      'claude-sonnet-4-5',
      'claude-sonnet-4-5-20250929'
    ].includes(model);
  }

  /**
   * Get Anthropic-specific API parameters
   * @returns {Object} API parameters
   */
  getApiParams() {
    return {
      model: this.model,
      max_tokens: this.maxTokens,
      temperature: this.temperature,
      response_format: this.responseFormat
    };
  }

  /**
   * Format system prompt for Anthropic
   * @param {Object} params - Parameters for formatting
   * @param {string} params.task - Task description
   * @returns {string} Formatted system prompt
   */
  formatSystemPrompt(params) {
    const basePrompt = super.formatSystemPrompt(params);
    return `${basePrompt}\n\nPlease format your response as a JSON object. Do not include any explanations or markdown formatting.`;
  }
}

module.exports = AnthropicConfig; 