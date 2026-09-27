const { PromptManager } = require('./PromptManager');
const { MemorialOCRPrompt } = require('./templates/MemorialOCRPrompt');

/**
 * Factory class for creating and managing prompt instances
 */
class PromptFactory {
  constructor() {
    this.manager = new PromptManager();
    this._registerDefaultPrompts();
  }

  /**
   * Register default prompt classes
   * @private
   */
  _registerDefaultPrompts() {
    this.registerPrompt('memorial_ocr', MemorialOCRPrompt);
  }

  /**
   * Register a new prompt class
   * @param {string} name The name of the prompt
   * @param {Function} PromptClass The prompt class to register
   * @throws {Error} If prompt name is invalid or class registration fails
   */
  registerPrompt(name, PromptClass) {
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      throw new Error('Invalid prompt name');
    }

    this.manager.registerPromptClass(name, PromptClass);
  }

  /**
   * Get a prompt instance
   * @param {string} type The type of prompt to create
   * @param {Object} [config={}] Configuration options
   * @param {boolean} [force=false] Force creation of new instance
   * @returns {BasePrompt} Prompt instance
   * @throws {Error} If prompt type is unknown or configuration is invalid
   */
  getPrompt(type, config = {}, force = false) {
    try {
      return this.manager.getPrompt(type, config, force);
    } catch (error) {
      if (error.message.includes('Prompt class not found')) {
        throw new Error(`Unknown prompt type: ${type}`);
      }
      throw error;
    }
  }

  /**
   * Get a list of all available prompt types
   * @returns {string[]} List of registered prompt names
   */
  getAvailablePrompts() {
    return Array.from(this.manager.promptClasses.keys());
  }

  /**
   * Get information about a prompt type
   * @param {string} type The type of prompt
   * @returns {Object} Prompt information
   * @throws {Error} If prompt type is unknown
   */
  getPromptInfo(type) {
    try {
      const PromptClass = this.manager.promptClasses.get(type);
      if (!PromptClass) {
        throw new Error(`Unknown prompt type: ${type}`);
      }

      const instance = new PromptClass();
      return {
        version: instance.version,
        description: instance.description,
        fields: instance.fields
      };
    } catch (error) {
      if (error.message.includes('Unknown prompt type')) {
        throw error;
      }
      throw new Error(`Error getting prompt info: ${error.message}`);
    }
  }

  /**
   * Validate a prompt configuration
   * @param {string} type The type of prompt
   * @param {Object} config Configuration to validate
   * @throws {Error} If configuration is invalid or prompt type is unknown
   */
  validateConfig(type, config) {
    if (!this.manager.promptClasses.has(type)) {
      throw new Error(`Unknown prompt type: ${type}`);
    }

    // Validate providers if specified
    if (config.providers !== undefined) {
      if (!Array.isArray(config.providers)) {
        throw new Error('Invalid configuration: providers must be an array');
      }
    }

    // Validate fields if specified
    if (config.fields !== undefined) {
      if (typeof config.fields !== 'object' || Array.isArray(config.fields)) {
        throw new Error('Invalid configuration: fields must be an object');
      }

      for (const [fieldName, field] of Object.entries(config.fields)) {
        if (typeof field !== 'object' || Array.isArray(field)) {
          throw new Error(`Invalid configuration: field '${fieldName}' must be an object`);
        }
      }
    }

    // Validate version if specified
    if (config.version !== undefined && typeof config.version !== 'string') {
      throw new Error('Invalid configuration: version must be a string');
    }

    // Try creating an instance to catch any other validation errors
    try {
      this.getPrompt(type, config);
    } catch (error) {
      if (!error.message.includes('Unknown prompt type')) {
        throw new Error(`Invalid configuration: ${error.message}`);
      }
      throw error;
    }
  }
}

module.exports = {
  PromptFactory
}; 