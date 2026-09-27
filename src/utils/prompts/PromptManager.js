const BasePrompt = require('./BasePrompt');

/**
 * Manages prompt class registration, instantiation, and caching
 */
class PromptManager {
  constructor() {
    this.promptClasses = new Map();
    this.promptInstances = new Map();
  }

  /**
   * Validate that a class is a valid prompt implementation
   * @private
   * @param {Function} PromptClass The class to validate
   * @throws {Error} If the class is invalid
   */
  _validatePromptClass(PromptClass) {
    // Create a test instance to verify inheritance and methods
    const testInstance = new PromptClass();
    
    if (!(testInstance instanceof BasePrompt)) {
      throw new Error('Invalid prompt class: Must extend BasePrompt');
    }

    // Verify required methods are implemented
    ['getPromptText', 'getProviderPrompt', 'validateAndConvert'].forEach(method => {
      if (typeof testInstance[method] !== 'function') {
        throw new Error(`Invalid prompt class: Missing required method ${method}`);
      }
    });
  }

  /**
   * Generate a cache key for a prompt configuration
   * @private
   * @param {string} name The prompt name
   * @param {Object} config Configuration options
   * @returns {string} Cache key
   */
  _getCacheKey(name, config = {}) {
    return `${name}:${JSON.stringify(config)}`;
  }

  /**
   * Validate and merge configuration objects
   * @private
   * @param {Object} defaultConfig Default configuration
   * @param {Object} overrideConfig Override configuration
   * @returns {Object} Merged configuration
   * @throws {Error} If configuration is invalid
   */
  _mergeConfig(defaultConfig = {}, overrideConfig = {}) {
    // Validate providers configuration
    if (overrideConfig.providers !== undefined && 
        (!Array.isArray(overrideConfig.providers) || overrideConfig.providers.length === 0)) {
      throw new Error('Invalid providers configuration');
    }

    // Deep merge fields configuration
    const mergedFields = {};
    
    // First, copy all default fields
    if (defaultConfig.fields) {
      Object.entries(defaultConfig.fields).forEach(([fieldName, fieldConfig]) => {
        mergedFields[fieldName] = { ...fieldConfig };
      });
    }

    // Then, merge override fields
    if (overrideConfig.fields) {
      Object.entries(overrideConfig.fields).forEach(([fieldName, fieldConfig]) => {
        if (mergedFields[fieldName]) {
          // Merge with existing field config
          mergedFields[fieldName] = {
            ...mergedFields[fieldName],
            ...fieldConfig
          };
        } else {
          // Add new field config
          mergedFields[fieldName] = { ...fieldConfig };
        }
      });
    }

    // Merge all configurations
    return {
      ...defaultConfig,
      ...overrideConfig,
      fields: mergedFields
    };
  }

  /**
   * Register a new prompt class
   * @param {string} name The name of the prompt
   * @param {Function} PromptClass The prompt class to register
   * @throws {Error} If prompt name already exists or class is invalid
   */
  registerPromptClass(name, PromptClass) {
    if (this.promptClasses.has(name)) {
      throw new Error('Prompt name already registered');
    }

    this._validatePromptClass(PromptClass);
    this.promptClasses.set(name, PromptClass);
  }

  /**
   * Get a prompt instance
   * @param {string} name The name of the prompt
   * @param {Object} [config={}] Configuration options
   * @param {boolean} [force=false] Force creation of new instance
   * @returns {BasePrompt} Prompt instance
   * @throws {Error} If prompt class not found or configuration is invalid
   */
  getPrompt(name, config = {}, force = false) {
    const PromptClass = this.promptClasses.get(name);
    if (!PromptClass) {
      throw new Error(`Prompt class not found: ${name}`);
    }

    const cacheKey = this._getCacheKey(name, config);

    // Return cached instance if available and not forcing new instance
    if (!force && this.promptInstances.has(cacheKey)) {
      return this.promptInstances.get(cacheKey);
    }

    // Create new instance with merged configuration
    const defaultConfig = new PromptClass().constructor.defaultConfig || {};
    const mergedConfig = this._mergeConfig(defaultConfig, config);
    const instance = new PromptClass(mergedConfig);

    // Cache the instance
    this.promptInstances.set(cacheKey, instance);

    return instance;
  }
}

module.exports = PromptManager; 