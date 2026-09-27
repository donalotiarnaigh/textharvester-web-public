/**
 * Base class for vision model providers
 * Defines the interface that all providers must implement
 */
class BaseVisionProvider {
  constructor(config = {}) {
    if (new.target === BaseVisionProvider) {
      throw new Error('BaseVisionProvider is an abstract class and cannot be instantiated directly');
    }
    this.config = config;
  }

  /**
   * Get the current model version
   * @returns {string} The model version
   */
  getModelVersion() {
    throw new Error('getModelVersion() must be implemented by subclass');
  }

  /**
   * Process an image using the provider's vision capabilities
   * @param {string} base64Image - Base64 encoded image
   * @param {string} prompt - The prompt to send to the model
   * @param {Object} options - Additional options for processing
   * @returns {Promise<Object>} - Parsed JSON response
   */
  async processImage(base64Image, prompt, /* eslint-disable-line no-unused-vars */ options = {}) {
    throw new Error('processImage() must be implemented by subclass');
  }

  /**
   * Validate provider-specific configuration
   * @returns {boolean} True if configuration is valid
   * @throws {Error} If configuration is invalid
   */
  validateConfig() {
    throw new Error('validateConfig() must be implemented by subclass');
  }

  /**
   * Validate a prompt template for use with this provider
   * @param {BasePrompt} promptTemplate The prompt template to validate
   * @returns {Object} Validation result
   */
  validatePromptTemplate(promptTemplate) { // eslint-disable-line no-unused-vars
    throw new Error('validatePromptTemplate() must be implemented by subclass');
  }
}

module.exports = BaseVisionProvider; 