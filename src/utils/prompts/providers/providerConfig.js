/**
 * Supported provider types
 * @enum {string}
 */
const PROVIDER_TYPES = {
  OPENAI: 'openai',
  ANTHROPIC: 'anthropic',
  GEMINI: 'gemini',
  MOCK: 'mock'
};

/**
 * Default configuration values
 */
const DEFAULT_CONFIG = {
  maxTokens: 2000,
  temperature: 0.7,
  systemPromptTemplate: 'You are an AI assistant designed to help with tasks.',
  responseFormat: {
    type: 'text'
  }
};

/**
 * Provider-specific configurations
 */
const PROVIDER_CONFIGS = {
  [PROVIDER_TYPES.OPENAI]: {
    systemPromptTemplate: 'You are an AI assistant trained by OpenAI to help with data extraction.',
    responseFormat: {
      type: 'json',
      schema: {
        type: 'object',
        properties: {
          result: { type: 'string' }
        },
        required: ['result']
      }
    }
  },
  [PROVIDER_TYPES.ANTHROPIC]: {
    systemPromptTemplate: 'You are Claude, an AI assistant created by Anthropic to help with data extraction.',
    responseFormat: {
      type: 'markdown'
    }
  },
  [PROVIDER_TYPES.GEMINI]: {
    systemPromptTemplate: 'You are Gemini, an AI assistant created by Google to help with data extraction.',
    responseFormat: {
      type: 'json'
    }
  },
  [PROVIDER_TYPES.MOCK]: {
    systemPromptTemplate: 'You are a mock AI assistant.',
    responseFormat: {
      type: 'json'
    }
  }
};

const TYPE_FORMATS = {
  [PROVIDER_TYPES.OPENAI]: {
    string: 'text',
    integer: 'integer',
    float: 'number',
    boolean: 'boolean',
    date: 'string'
  },
  [PROVIDER_TYPES.ANTHROPIC]: {
    string: 'text',
    integer: 'number',
    float: 'number',
    boolean: 'boolean',
    date: 'string'
  },
  [PROVIDER_TYPES.GEMINI]: {
    string: 'text',
    integer: 'number',
    float: 'number',
    boolean: 'boolean',
    date: 'string'
  },
  [PROVIDER_TYPES.MOCK]: {
    string: 'string',
    integer: 'number',
    float: 'number',
    boolean: 'boolean',
    date: 'string'
  }
};

/**
 * Represents a provider configuration
 */
class ProviderConfig {
  /**
   * @param {string} type - Provider type
   */
  constructor(type) {
    if (!Object.values(PROVIDER_TYPES).includes(type)) {
      throw new Error(`Invalid provider type: ${type}`);
    }

    this.type = type;
    this.maxTokens = DEFAULT_CONFIG.maxTokens;
    this.temperature = DEFAULT_CONFIG.temperature;
    this.systemPromptTemplate = PROVIDER_CONFIGS[type].systemPromptTemplate;
    this.responseFormat = PROVIDER_CONFIGS[type].responseFormat;
  }

  /**
   * Format system prompt with parameters
   * @param {Object} params - Parameters for formatting
   * @param {string} params.task - Task description
   * @returns {string} Formatted system prompt
   */
  formatSystemPrompt(params) {
    if (!params.task) {
      throw new Error('Task is required');
    }
    return this.systemPromptTemplate;
  }

  /**
   * Get the format for a specific field type
   * @param {string} type - The field type
   * @returns {string} The provider-specific format
   */
  getFieldFormat(type) {
    return TYPE_FORMATS[this.type]?.[type] || type;
  }
}

/**
 * Create a provider configuration
 * @param {string} providerName - Name of the provider
 * @returns {ProviderConfig} Provider configuration
 */
function createProviderConfig(providerName) {
  const type = PROVIDER_TYPES[providerName.toUpperCase()];
  if (!type) {
    throw new Error(`Unknown provider: ${providerName}`);
  }
  return new ProviderConfig(type);
}

module.exports = {
  PROVIDER_TYPES,
  createProviderConfig,
  ProviderConfig,
  DEFAULT_CONFIG,
  PROVIDER_CONFIGS
}; 