const { PromptFactory } = require('./PromptFactory');
const { PromptManager } = require('./PromptManager');
const { BasePrompt } = require('./BasePrompt');
const { MemorialOCRPrompt } = require('./templates/MemorialOCRPrompt');
const { isValidType, validateValue } = require('./types/dataTypes');
const { PROVIDER_TYPES, createProviderConfig } = require('./providers/providerConfig');

// Create factory instance lazily
let factory = null;
let manager = null;

function getFactory() {
  if (!factory) {
    manager = new PromptManager();
    factory = new PromptFactory();
    factory._manager = manager;
    // Register default prompts
    factory.registerPrompt('memorial_ocr', MemorialOCRPrompt);
  }
  return factory;
}

/**
 * Helper function to create prompt instances
 * @param {string} type The type of prompt to create
 * @param {Object} [config={}] Configuration options
 * @param {boolean} [force=false] Force creation of new instance
 * @returns {BasePrompt} Prompt instance
 */
function createPrompt(type, config = {}, force = false) {
  return getFactory().getPrompt(type, config, force);
}

// Export everything needed for the prompt system
module.exports = {
  // Main exports
  PromptFactory,
  BasePrompt,
  PromptManager,

  // Default export for ES6 modules
  default: PromptFactory,

  // Template exports
  MemorialOCRPrompt,

  // Utility exports
  isValidType,
  validateValue,
  PROVIDER_TYPES,
  createProviderConfig,

  // Factory helper functions
  createPrompt,

  // Backward compatibility exports
  getPrompt: createPrompt,
  registerPrompt: (name, PromptClass) => getFactory().registerPrompt(name, PromptClass),
  listPrompts: () => getFactory().getAvailablePrompts(),
  validateConfig: (type, config) => getFactory().validateConfig(type, config),
  getPromptInfo: (type) => getFactory().getPromptInfo(type),

  // Export singleton instances for testing
  _getFactory: () => {
    if (!factory) {
      manager = new PromptManager();
      factory = new PromptFactory();
      factory._manager = manager;
    }
    return factory;
  }
}; 