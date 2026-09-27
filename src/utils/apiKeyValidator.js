const logger = require('./logger');

const PROVIDERS = {
  openai: {
    name: 'OpenAI',
    envVar: 'OPENAI_API_KEY',
    keyCreationUrl: 'https://platform.openai.com/api-keys',
  },
  anthropic: {
    name: 'Anthropic',
    envVar: 'ANTHROPIC_API_KEY',
    keyCreationUrl: 'https://console.anthropic.com/settings/keys',
  },
  gemini: {
    name: 'Google Gemini',
    envVar: 'GEMINI_API_KEY',
    keyCreationUrl: 'https://aistudio.google.com/apikey',
  },
};

/**
 * Check which API keys are configured via environment variables.
 * @returns {{ openai: boolean, anthropic: boolean, gemini: boolean }}
 */
function validateApiKeys() {
  const result = {};
  for (const [key, provider] of Object.entries(PROVIDERS)) {
    const value = process.env[provider.envVar];
    result[key] = !!(value && value.trim());
  }
  return result;
}

/**
 * Get detailed provider status for API consumers.
 * Never exposes actual API key values.
 * @returns {Object} Provider status keyed by provider name
 */
function getProviderStatus() {
  const keys = validateApiKeys();
  const status = {};
  for (const [key, provider] of Object.entries(PROVIDERS)) {
    status[key] = {
      available: keys[key],
      name: provider.name,
      keyCreationUrl: provider.keyCreationUrl,
    };
  }
  return status;
}

/**
 * Log startup validation results — warnings for missing keys, error if none configured.
 * @param {{ openai: boolean, anthropic: boolean, gemini: boolean }} status
 * @param {Object} [log] - Logger instance (defaults to project logger)
 */
function logValidationResults(status, log) {
  log = log || logger;
  const configured = [];
  const missing = [];

  for (const [key, available] of Object.entries(status)) {
    if (available) {
      configured.push(key);
    } else {
      missing.push(key);
    }
  }

  // Log warnings for each missing provider
  for (const key of missing) {
    const provider = PROVIDERS[key];
    log.warn(
      `${provider.name} API key not configured. Set ${provider.envVar} in your .env file. Get a key at: ${provider.keyCreationUrl}`
    );
  }

  // If no keys at all, log an error-level message
  if (configured.length === 0) {
    log.error(
      'No API keys configured. The server will start, but all processing requests will fail. ' +
      'Set at least one provider API key in your .env file.',
      { message: 'No API keys found in environment' }
    );
    return;
  }

  // Log info about which providers are ready
  log.info(`API keys configured for: ${configured.join(', ')}`);
}

module.exports = {
  validateApiKeys,
  getProviderStatus,
  logValidationResults,
  PROVIDERS,
};
