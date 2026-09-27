const { ProviderConfig, PROVIDER_TYPES } = require('./providerConfig');

/**
 * OpenAI-specific provider configuration
 */
class OpenAIConfig extends ProviderConfig {
  /**
   * @param {Object} options - OpenAI configuration
   * @param {string} [options.model='gpt-4'] - OpenAI model name
   * @param {Object} [options.responseFormat] - Response format configuration
   */
  constructor(options = {}) {
    super(PROVIDER_TYPES.OPENAI);
    
    this.model = options.model || 'gpt-4';
    if (!this.isSupportedModel(this.model)) {
      throw new Error('Unsupported OpenAI model');
    }
  }

  isSupportedModel(model) {
    return [
      'gpt-4',
      'gpt-4-turbo',
      'gpt-3.5-turbo'
    ].includes(model);
  }

  /**
   * Get OpenAI-specific API parameters
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
}

module.exports = OpenAIConfig; 