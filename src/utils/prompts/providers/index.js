const OpenAIConfig = require('./openaiConfig');
const AnthropicConfig = require('./anthropicConfig');

const SUPPORTED_PROVIDERS = {
  OPENAI: 'openai',
  ANTHROPIC: 'anthropic'
};

const providerConfigs = {
  [SUPPORTED_PROVIDERS.OPENAI]: new OpenAIConfig(),
  [SUPPORTED_PROVIDERS.ANTHROPIC]: new AnthropicConfig()
};

/**
 * Get the configuration for a specific provider
 * @param {string} provider - The provider name (e.g., 'openai', 'anthropic')
 * @returns {Object} The provider configuration
 * @throws {Error} If the provider is not supported
 */
function getProviderConfig(provider) {
  const config = providerConfigs[provider];
  if (!config) {
    throw new Error(`Unsupported provider: ${provider}`);
  }
  return config;
}

/**
 * Detect the provider based on the model name
 * @param {string} modelName - The name of the model
 * @returns {string} The detected provider name
 * @throws {Error} If the provider cannot be detected or model name is invalid
 */
function detectProvider(modelName) {
  if (!modelName) {
    throw new Error('Model name is required');
  }

  const modelNameLower = modelName.toLowerCase();

  // OpenAI models
  if (modelNameLower.startsWith('gpt-')) {
    return SUPPORTED_PROVIDERS.OPENAI;
  }

  // Anthropic models
  if (modelNameLower.startsWith('claude-')) {
    return SUPPORTED_PROVIDERS.ANTHROPIC;
  }

  throw new Error(`Unable to detect provider for model: ${modelName}`);
}

module.exports = {
  SUPPORTED_PROVIDERS,
  getProviderConfig,
  detectProvider
}; 