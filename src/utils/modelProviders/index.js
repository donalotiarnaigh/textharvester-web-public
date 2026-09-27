const OpenAIProvider = require('./openaiProvider');
const AnthropicProvider = require('./anthropicProvider');
const GeminiProvider = require('./geminiProvider');
const MistralProvider = require('./mistralProvider');
const MockProvider = require('./mockProvider');
const path = require('path');
const fs = require('fs');

// Try to load config from the root directory
let config = {};
try {
  const configPath = path.resolve(process.cwd(), 'config.json');
  if (fs.existsSync(configPath)) {
    config = require(configPath);
  }
} catch (error) {
  console.warn('Could not load config.json:', error.message);
}

/**
 * Factory function to create the appropriate provider based on configuration
 * @param {Object} customConfig - Optional custom configuration to override defaults
 * @returns {BaseVisionProvider} The appropriate provider instance
 */
function createProvider(customConfig = {}) {
  // Merge custom config with default config
  const mergedConfig = { ...config, ...customConfig };

  // Get provider from config, environment variable, or default to OpenAI
  const provider = mergedConfig.AI_PROVIDER || process.env.AI_PROVIDER || 'openai';

  switch (provider.toLowerCase()) {
  case 'openai':
    return new OpenAIProvider(mergedConfig);
  case 'anthropic':
    return new AnthropicProvider(mergedConfig);
  case 'gemini':
    return new GeminiProvider(mergedConfig);
  case 'mistral':
    return new MistralProvider(mergedConfig);
  case 'mock':
    return new MockProvider(mergedConfig);
  default:
    console.warn(`Unsupported AI provider: ${provider}, falling back to OpenAI`);
    return new OpenAIProvider(mergedConfig);
  }
}

module.exports = {
  createProvider,
  OpenAIProvider,
  AnthropicProvider,
  GeminiProvider,
  MistralProvider,
  MockProvider
}; 