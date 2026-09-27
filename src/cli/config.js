const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  provider: process.env.AI_PROVIDER || 'openai',
  outputFormat: 'json',
  batchSize: 3,
  verbose: 0,
  configPath: './config.json'
};

/**
 * Validates the final configuration object.
 * @param {Object} config 
 */
function validateConfig(config) {
  const validProviders = ['openai', 'anthropic', 'gemini', 'mistral'];
  if (config.provider && !validProviders.includes(config.provider)) {
    throw new Error(`Invalid provider: ${config.provider}. Valid providers: ${validProviders.join(', ')}`);
  }

  if (config.provider === 'openai' && !config.openaiApiKey) {
    throw new Error('Missing required configuration: openaiApiKey');
  }
  if (config.provider === 'anthropic' && !config.anthropicApiKey) {
    throw new Error('Missing required configuration: anthropicApiKey');
  }
  if (config.provider === 'gemini' && !config.geminiApiKey) {
    throw new Error('Missing required configuration: geminiApiKey');
  }
  if (config.provider === 'mistral' && !config.mistralApiKey) {
    throw new Error('Missing required configuration: mistralApiKey');
  }
}

/**
 * Helper to remove undefined values from an object
 * @param {Object} obj 
 * @returns {Object}
 */
function clean(obj) {
  return Object.entries(obj)
    .filter(([, v]) => v !== undefined)
    .reduce((acc, [k, v]) => ({ ...acc, [k]: v }), {});
}

/**
 * Loads configuration from multiple sources with precedence.
 * @param {Object} cliOptions - Options from command line arguments
 */
async function loadConfig(cliOptions = {}) {
  // 1. Determine config path (CLI > Default)
  // We check cliOptions.config, but we generally want to respect the precedence rule
  // that CLI arg overrides default.
  const configPath = cliOptions.config || DEFAULTS.configPath;

  // 2. Load config file if it exists
  let fileConfig = {};
  // Use process.cwd() to resolve relative to where command is run
  const absoluteConfigPath = path.resolve(process.cwd(), configPath);

  // If user explicitly passed a config path via CLI, it MUST exist.
  // If it's the default path, we only read it if it exists.
  const isExplicitConfig = !!cliOptions.config;

  if (isExplicitConfig && !fs.existsSync(absoluteConfigPath)) {
    throw new Error(`Config file not found: ${cliOptions.config}`);
  }

  if (fs.existsSync(absoluteConfigPath)) {
    try {
      const fileContent = fs.readFileSync(absoluteConfigPath, 'utf-8');
      fileConfig = JSON.parse(fileContent);
    } catch (error) {
      // If the error is ours (e.g. from JSON.parse), rethrow wrapped
      // But JSON.parse throws SyntaxError.
      throw new Error(`Invalid JSON in config file: ${error.message}`);
    }
  }

  // 3. Environment variables
  const envConfig = {};
  if (process.env.OPENAI_API_KEY) envConfig.openaiApiKey = process.env.OPENAI_API_KEY;
  if (process.env.ANTHROPIC_API_KEY) envConfig.anthropicApiKey = process.env.ANTHROPIC_API_KEY;
  if (process.env.GEMINI_API_KEY) envConfig.geminiApiKey = process.env.GEMINI_API_KEY;
  if (process.env.MISTRAL_API_KEY) {
    envConfig.mistralApiKey = process.env.MISTRAL_API_KEY;
    envConfig.MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;
  }

  // 4. Merge: Defaults < File < Env < CLI
  // We clean objects to ensure undefineds don't clobber valid values
  const merged = {
    ...DEFAULTS,
    ...clean(fileConfig),
    ...clean(envConfig),
    ...clean(cliOptions)
  };

  return merged;
}

module.exports = {
  loadConfig,
  validateConfig,
  DEFAULTS
};
