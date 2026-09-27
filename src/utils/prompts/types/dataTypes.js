/**
 * Base class for all data types
 */
class DataType {
  /**
   * @param {string} name - The name of the data type
   * @param {function} validator - Function to validate values of this type
   */
  constructor(name, validator) {
    this.name = name;
    this.validator = validator;
  }

  /**
   * Validate if a value matches this type
   * @param {*} value - The value to validate
   * @param {Object} metadata - Metadata for validation
   * @returns {Object} - Validation result with value and errors
   */
  validate(value, metadata = {}) {
    // Handle required fields first
    if (metadata.required && (value === null || value === undefined)) {
      return { value: null, errors: ['Value is required'] };
    }

    // Return null for null/undefined values if not required
    if (value === null || value === undefined) {
      return { value: null, errors: [] };
    }

    // Check type before conversion
    if (!this.validator(value)) {
      return {
        value: null,
        errors: [`Invalid ${this.name} value: ${value}`]
      };
    }

    try {
      const convertedValue = this.convert(value, metadata);

      // Validate metadata after conversion
      const metadataErrors = this.validateMetadata(convertedValue, metadata);
      if (metadataErrors.length > 0) {
        return { value: null, errors: metadataErrors };
      }

      return { value: convertedValue, errors: [] };
    } catch (error) {
      return {
        value: null,
        errors: [error.message]
      };
    }
  }

  /**
   * Validate value against metadata constraints
   * @param {*} value - The value to validate
   * @param {Object} metadata - Metadata for validation
   * @returns {string[]} - Array of error messages
   */
  validateMetadata(value, metadata) {
    const errors = [];

    if (metadata.required && (value === null || value === undefined)) {
      errors.push('Value is required');
    }

    return errors;
  }

  /**
   * Convert a value to this type
   * @param {*} value - The value to convert
   * @param {Object} metadata - Metadata for conversion
   * @returns {*} - The converted value
   */
  convert(value, metadata) { // eslint-disable-line no-unused-vars
    // Base class provides identity conversion
    return value;
  }
}

/**
 * String data type implementation
 */
class StringType extends DataType {
  constructor() {
    super('string', (value) => typeof value === 'string');
  }

  convert(value, metadata = {}) {
    if (value === null || value === undefined) {
      return null;
    }

    // Convert to string and trim
    const converted = String(value).trim();

    // If empty string and field is not required, return null
    if (converted === '' && !metadata.required) {
      return null;
    }

    // Validate metadata
    const errors = this.validateMetadata(converted, metadata);
    if (errors.length > 0) {
      throw new Error(errors[0]);
    }

    return converted;
  }

  validateMetadata(value, metadata) {
    const errors = [];

    if (value === null || value === '') {
      return errors;
    }

    if (metadata.maxLength && value.length > metadata.maxLength) {
      errors.push(`Value exceeds maximum length of ${metadata.maxLength} characters`);
    }

    if (metadata.format) {
      switch (metadata.format) {
      case 'email':
        if (!value.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
          errors.push('Invalid email format');
        }
        break;
      case 'name':
        if (!value.match(/^[A-Za-zÀ-ÖØ-öø-ÿ\s\-'.]+$/)) {
          errors.push('Invalid name format');
        }
        break;
      case 'identifier':
        if (!value.match(/^[A-Za-z0-9\-_]+$/)) {
          errors.push(`Invalid identifier format: "${value}" (only letters, numbers, hyphens, and underscores allowed)`);
        }
        break;
      case 'memorial_identifier':
        if (!value.match(/^\d+$/)) {
          errors.push(`Invalid memorial identifier: "${value}" (must be a numeric identifier)`);
        }
        break;
      }
    }

    return errors;
  }
}

/**
 * Integer data type implementation
 */
class IntegerType extends DataType {
  constructor() {
    super('integer', (value) => Number.isInteger(value));
  }

  convert(value, metadata = {}) {
    if (value === null || value === undefined) {
      return null;
    }

    // Only accept actual integers
    if (!Number.isInteger(value)) {
      throw new Error(`Cannot convert value "${value}" to integer`);
    }

    // Validate range if specified - use same logic as validateMetadata
    if (metadata.min !== undefined && metadata.max !== undefined) {
      if (value < metadata.min || value > metadata.max) {
        throw new Error(`Value must be between ${metadata.min} and ${metadata.max}`);
      }
    } else {
      if (metadata.min !== undefined && value < metadata.min) {
        throw new Error(`Value must be greater than or equal to ${metadata.min}`);
      }
      if (metadata.max !== undefined && value > metadata.max) {
        throw new Error(`Value must be less than or equal to ${metadata.max}`);
      }
    }

    return value;
  }

  validateMetadata(value, metadata) {
    const errors = [];

    if (value === null) {
      return errors;
    }

    // If both min and max are specified, use "between" message
    if (metadata.min !== undefined && metadata.max !== undefined) {
      if (value < metadata.min || value > metadata.max) {
        errors.push(`Value must be between ${metadata.min} and ${metadata.max}`);
      }
    } else {
      // Otherwise use individual messages
      if (metadata.min !== undefined && value < metadata.min) {
        errors.push(`Value must be greater than or equal to ${metadata.min}`);
      }
      if (metadata.max !== undefined && value > metadata.max) {
        errors.push(`Value must be less than or equal to ${metadata.max}`);
      }
    }

    return errors;
  }
}

/**
 * Float data type implementation
 */
class FloatType extends DataType {
  constructor() {
    super('float', (value) => typeof value === 'number' && !isNaN(value));
  }

  convert(value, metadata) {
    if (value === null || value === undefined) {
      return null;
    }

    // Only accept actual numbers
    if (typeof value !== 'number' || isNaN(value)) {
      throw new Error(`Cannot convert value "${value}" to float`);
    }

    // Apply min/max constraints before precision
    if (metadata.min !== undefined && value < metadata.min) {
      throw new Error(`Value must be between ${metadata.min} and ${metadata.max}`);
    }
    if (metadata.max !== undefined && value > metadata.max) {
      throw new Error(`Value must be between ${metadata.min} and ${metadata.max}`);
    }

    // Apply precision after constraints
    if (metadata.precision !== undefined) {
      const multiplier = Math.pow(10, metadata.precision);
      value = Math.round(value * multiplier) / multiplier;
    }
    return value;
  }

  validateMetadata(value, metadata) {
    const errors = super.validateMetadata(value, metadata);

    if (value === null) {
      return errors;
    }

    if (metadata.min !== undefined && metadata.max !== undefined && (value < metadata.min || value > metadata.max)) {
      errors.push(`Value must be between ${metadata.min} and ${metadata.max}`);
    } else {
      if (metadata.min !== undefined && value < metadata.min) {
        errors.push(`Value must be greater than or equal to ${metadata.min}`);
      }
      if (metadata.max !== undefined && value > metadata.max) {
        errors.push(`Value must be less than or equal to ${metadata.max}`);
      }
    }

    return errors;
  }
}

/**
 * Boolean data type implementation
 */
class BooleanType extends DataType {
  constructor() {
    super('boolean', (value) => typeof value === 'boolean');
  }

  convert(value, metadata) { // eslint-disable-line no-unused-vars
    if (value === null || value === undefined) {
      return null;
    }

    // Only accept actual booleans
    if (typeof value !== 'boolean') {
      throw new Error(`Cannot convert value "${value}" to boolean`);
    }

    return value;
  }

  validateMetadata(value, metadata) { // eslint-disable-line no-unused-vars
    const errors = [];

    if (value === null) {
      return errors;
    }

    if (typeof value !== 'boolean') {
      errors.push(`Value must be a boolean, got ${typeof value}`);
    }

    return errors;
  }
}

/**
 * Date data type implementation
 */
class DateType extends DataType {
  constructor() {
    super('date', (value) => value instanceof Date && !isNaN(value));
  }

  convert(value, metadata) { // eslint-disable-line no-unused-vars
    if (value === null || value === undefined) {
      return null;
    }

    // Only accept actual Date objects
    if (!(value instanceof Date) || isNaN(value.getTime())) {
      throw new Error(`Cannot convert value "${value}" to date`);
    }

    return value;
  }

  validateMetadata(value, metadata) {
    const errors = super.validateMetadata(value, metadata);

    if (value === null) {
      return errors;
    }

    if (metadata.min && value < new Date(metadata.min)) {
      errors.push(`Date must be after ${metadata.min}`);
    }
    if (metadata.max && value > new Date(metadata.max)) {
      errors.push(`Date must be before ${metadata.max}`);
    }

    return errors;
  }
}

// Type instances
const TYPES = {
  string: new StringType(),
  integer: new IntegerType(),
  float: new FloatType(),
  boolean: new BooleanType(),
  date: new DateType()
};

/**
 * Check if a type is supported
 * @param {string} type Type to check
 * @returns {boolean} True if type is supported
 */
function isValidType(type) {
  return typeof type === 'string' && type.toLowerCase() in TYPES;
}

/**
 * Convert and validate a value to the specified type
 * @param {*} value Value to convert
 * @param {DataType|string} type Target type or type instance
 * @param {Object} metadata Metadata for validation
 * @returns {Object} Validation result with value and errors
 */
function validateValue(value, type, metadata) {
  let typeInstance;

  if (type instanceof DataType) {
    typeInstance = type;
  } else if (typeof type === 'string') {
    typeInstance = TYPES[type.toLowerCase()];
    if (!typeInstance) {
      throw new Error(`Unsupported type: ${type}`);
    }
  } else {
    throw new Error('Type must be a string or DataType instance');
  }

  return typeInstance.validate(value, metadata);
}

module.exports = {
  DataType,
  StringType,
  IntegerType,
  FloatType,
  BooleanType,
  DateType,
  isValidType,
  validateValue,
  TYPES
}; 