const { createProviderConfig } = require('./providers/providerConfig');
const dataTypes = require('./types/dataTypes');

/**
 * Base class for all prompts
 * Provides common functionality for prompt management and type validation
 */
class BasePrompt {
  /**
   * Create a new prompt instance
   * @param {Object} config Configuration options
   * @param {string} config.version Prompt version
   * @param {string} config.description Human-readable prompt description
   * @param {Object} config.fields Field definitions with types and descriptions
   * @param {string[]} config.providers List of supported AI providers
   */
  constructor(config = {}) {
    this.version = config.version || '1.0.0';
    this.description = config.description || '';
    this.fields = this._validateFields(config.fields || {});
    this.providers = config.providers || ['openai', 'anthropic', 'gemini', 'mistral', 'mock'];
  }

  /**
   * Validate field definitions
   * @private
   * @param {Object|Array} fields Field definitions
   * @returns {Object|Array} Validated field definitions
   */
  _validateFields(fields) {
    // If fields is an array (like MEMORIAL_FIELDS), return as is
    if (Array.isArray(fields)) {
      return fields;
    }

    // Original object validation logic
    for (const [fieldName, field] of Object.entries(fields)) {
      if (!field.type || (typeof field.type === 'string' && !dataTypes.isValidType(field.type)) ||
        (typeof field.type === 'object' && !field.type.name)) {
        throw new Error(`Unsupported field type: ${field.type}`);
      }
      if (!field.description) {
        field.description = fieldName; // Use field name as default description
      }
    }
    return fields;
  }

  /**
   * Validate a single field value
   * @param {string} fieldName Name of the field to validate
   * @param {*} value Value to validate
   * @returns {*} Validated and converted value
   */
  validateField(fieldName, value) {
    // Handle both array and object field formats
    const field = Array.isArray(this.fields)
      ? this.fields.find(f => f.name === fieldName)
      : this.fields[fieldName];

    if (!field) {
      throw new Error(`Unknown field: ${fieldName}`);
    }

    // For array format (MemorialField objects), use the field's validate method
    if (typeof field.validate === 'function') {
      const result = field.validate(value);
      if (result.errors && result.errors.length > 0) {
        throw new Error(result.errors[0]);
      }
      return result.value;
    }

    // Handle null/undefined values
    if (value === null || value === undefined) {
      return null;
    }

    // For object format, handle conversion before validation
    const fieldType = typeof field.type === 'object' ? field.type.name : field.type;
    let convertedValue = value;

    // Convert string values to appropriate types
    if (typeof value === 'string' && value.trim() !== '') {
      switch (fieldType) {
      case 'integer': {
        const intValue = parseInt(value.trim(), 10);
        if (!isNaN(intValue) && intValue.toString() === value.trim()) {
          convertedValue = intValue;
        }
        break;
      }
      case 'float': {
        const floatValue = parseFloat(value.trim());
        if (!isNaN(floatValue)) {
          convertedValue = floatValue;
        }
        break;
      }
      case 'boolean': {
        const lowerValue = value.toLowerCase().trim();
        if (lowerValue === 'true') {
          convertedValue = true;
        } else if (lowerValue === 'false') {
          convertedValue = false;
        }
        break;
      }
      case 'date': {
        const dateValue = new Date(value);
        if (!isNaN(dateValue.getTime())) {
          convertedValue = dateValue;
        }
        break;
      }
      }
    }

    const result = dataTypes.validateValue(convertedValue, fieldType, field.metadata);

    if (result.errors.length > 0) {
      const errorMessages = result.errors.map(error => {
        // Transform error messages to match expected format
        let transformedError = error.replace('Value', fieldName.charAt(0).toUpperCase() + fieldName.slice(1));

        // Fix specific error message formats
        if (transformedError.includes('Invalid integer value:')) {
          // Extract the value from the original error message
          const valueMatch = transformedError.match(/Invalid integer value: (.+)/);
          const value = valueMatch ? valueMatch[1] : 'unknown';
          transformedError = `Cannot convert value "${value}" to integer`;
        }
        if (transformedError.includes('Invalid float value:')) {
          // Extract the value from the original error message
          const valueMatch = transformedError.match(/Invalid float value: (.+)/);
          const value = valueMatch ? valueMatch[1] : 'unknown';
          transformedError = `Cannot convert value "${value}" to float`;
        }
        if (transformedError.includes('Invalid boolean value:')) {
          transformedError = transformedError.replace('Invalid boolean value:', 'Invalid boolean value');
        }
        if (transformedError.includes('Invalid date value:')) {
          transformedError = transformedError.replace('Invalid date value:', 'Invalid date value');
        }

        return transformedError;
      });
      throw new Error(errorMessages[0]);
    }

    return result.value;
  }

  /**
   * Validate provider support
   * @param {string} provider Provider name to validate
   * @throws {Error} If provider is not supported
   */
  validateProvider(provider) {
    if (!this.providers.includes(provider.toLowerCase())) {
      throw new Error(`Provider not supported: ${provider}`);
    }
  }

  /**
   * Get the prompt text with type information
   * @returns {string} Complete prompt text
   * @abstract This method should be implemented by subclasses
   */
  getPromptText() {
    throw new Error('Method not implemented in base class');
  }

  /**
   * Get provider-specific field formatting
   * @param {string} provider Provider name
   * @returns {Object} Provider-specific field definitions
   */
  getProviderFields(provider) {
    this.validateProvider(provider);
    const config = createProviderConfig(provider);
    const result = {};

    for (const [name, field] of Object.entries(this.fields)) {
      result[name] = {
        ...field,
        format: config.getFieldFormat(field.type)
      };
    }

    return result;
  }

  /**
   * Format response for specific provider
   * @param {string} provider Provider name
   * @param {Object} data Response data
   * @returns {Object} Provider-specific formatted response
   */
  formatProviderResponse(provider, data) {
    this.validateProvider(provider);
    const { data: validatedData } = this.validateAndConvert(data);

    switch (provider.toLowerCase()) {
    case 'openai':
      return {
        response_format: { type: 'json' },
        content: validatedData
      };

    case 'anthropic':
      return {
        messages: [{
          role: 'assistant',
          content: JSON.stringify(validatedData, null, 2)
        }]
      };

    default:
      throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  /**
   * Get provider-specific validation rules
   * @param {string} provider Provider name
   * @returns {Object} Provider validation rules
   */
  getProviderValidationRules(provider) {
    this.validateProvider(provider);
    const config = createProviderConfig(provider);

    switch (provider.toLowerCase()) {
    case 'openai':
      return {
        maxTokens: config.maxTokens,
        temperature: config.temperature,
        responseFormat: { type: 'json' }
      };

    case 'anthropic':
      return {
        maxTokens: config.maxTokens,
        temperature: config.temperature,
        format: 'json'
      };

    case 'gemini':
      return {
        maxTokens: config.maxTokens,
        temperature: config.temperature,
        format: 'json'
      };

    default:
      throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  /**
   * Validate provider-specific response format
   * @param {string} provider Provider name
   * @param {Object} response Provider response
   * @throws {Error} If response format is invalid
   */
  validateProviderResponse(provider, response) {
    this.validateProvider(provider);

    switch (provider.toLowerCase()) {
    case 'openai':
      if (!response.response_format || response.response_format.type !== 'json') {
        throw new Error('Invalid OpenAI response format');
      }
      if (response.content?.error === 'token_limit_exceeded') {
        throw new Error('OpenAI token limit exceeded');
      }
      break;

    case 'anthropic': {
      if (!response.messages || !Array.isArray(response.messages)) {
        throw new Error('Invalid Anthropic response format');
      }
      const content = response.messages[0]?.content;
      try {
        JSON.parse(content);
      } catch {
        throw new Error('Invalid JSON in Anthropic response');
      }
      break;
    }

    default:
      throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  /**
   * Get the appropriate prompt for a specific AI provider
   * @param {string} provider AI provider name
   * @returns {Object} Provider-specific prompt configuration
   */
  getJsonSchema() {
    return null;
  }

  getProviderPrompt(provider) {
    this.validateProvider(provider);
    const config = createProviderConfig(provider);
    const basePrompt = this.getPromptText();

    // Format field descriptions with provider-specific types
    const providerFields = this.getProviderFields(provider);
    const fieldDescriptions = Object.entries(providerFields)
      .map(([name, field]) => `${name} (${field.format}): ${field.description}`)
      .join('\n');

    // Get provider-specific validation rules
    const validationRules = this.getProviderValidationRules(provider);

    return {
      systemPrompt: config.systemPromptTemplate,
      userPrompt: `${basePrompt}\n\nField Definitions:\n${fieldDescriptions}\n\nValidation Rules:\n${JSON.stringify(validationRules, null, 2)}\n\n${config.formatInstructions || ''}`
    };
  }

  /**
   * Extract a plain value and confidence score from a raw field value.
   * Handles both the legacy scalar format and the new {value, confidence} format.
   *
   * Returns `confidence: null` whenever the model provides no valid confidence signal:
   *   - plain scalar (no envelope)
   *   - envelope without a `confidence` key
   *   - envelope with a non-numeric, NaN, or out-of-range [0, 1] confidence
   *
   * Callers must treat `null` confidence as "unknown quality" and flag those records
   * for review rather than silently assuming high confidence.
   *
   * @protected
   * @param {*} rawValue - Raw value from model response
   * @returns {{value: *, confidence: number|null}}
   */
  _extractValueAndConfidence(rawValue) {
    if (rawValue !== null && typeof rawValue === 'object' && 'value' in rawValue) {
      const conf = rawValue.confidence;
      const isValid = typeof conf === 'number' && !isNaN(conf) && conf >= 0 && conf <= 1;
      return {
        value: rawValue.value,
        confidence: isValid ? conf : null
      };
    }
    return { value: rawValue, confidence: null };
  }

  /**
   * Validate response data against field definitions
   * @param {Object} data Response data from AI model
   * @returns {Object} { data, confidenceScores, validationWarnings } - Validated data with metadata in explicit API
   * @throws {Error} If validation fails with details about the failures
   */
  validateAndConvert(data) {
    const result = {};
    const errors = [];
    const confidenceScores = {};
    const validationWarnings = [];

    // First pass: validate required fields are present
    for (const [fieldName, field] of Object.entries(this.fields)) {
      if (field.metadata?.required && !(fieldName in data)) {
        errors.push(`${fieldName.charAt(0).toUpperCase() + fieldName.slice(1)} is required`);
      }
    }

    // Second pass: validate and convert each field
    for (const [fieldName] of Object.entries(this.fields)) {
      try {
        const raw = fieldName in data ? data[fieldName] : null;
        const { value, confidence } = this._extractValueAndConfidence(raw);
        confidenceScores[fieldName] = confidence;
        result[fieldName] = this.validateField(fieldName, value);
      } catch (error) {
        errors.push(error.message);
      }
    }

    if (errors.length > 0) {
      const error = new Error(errors[0]);
      error.details = errors;
      throw error;
    }

    return { data: result, confidenceScores, validationWarnings };
  }
}

module.exports = BasePrompt; 