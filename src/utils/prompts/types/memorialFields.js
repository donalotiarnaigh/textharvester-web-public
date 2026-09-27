const { StringType, IntegerType } = require('./dataTypes');

// Import the name processing utilities
const { handleInitials, preprocessName } = require('../../nameProcessing');

/**
 * Represents a field in a memorial record with type information and metadata
 */
class MemorialField {
  /**
   * @param {string} name - The name of the field
   * @param {string|Object} type - The data type of the field
   * @param {boolean} required - Whether the field is required
   * @param {Object} metadata - Additional field metadata
   * @param {string} [metadata.description=''] - Description of the field
   * @param {function} [metadata.transform=(value) => value] - Transform function for the field value
   * @param {Object} [metadata.validation={}] - Validation options
   */
  constructor(name, type, required = false, metadata = {}) {
    this.name = name;
    this.type = type;
    this.required = required;
    this.metadata = metadata;
    this.transform = metadata.transform || ((value) => value);
  }

  /**
   * Validates a value against this field's type
   * @param {*} value - The value to validate
   * @returns {Object} - Validation result with transformed value and errors
   */
  validate(value) {
    // Handle null/undefined for required fields
    if (this.required && (value === null || value === undefined || value === '')) {
      return { value: null, errors: [`${this.name} is required`] };
    }

    // Handle empty values for non-required fields
    if (!this.required && (value === null || value === undefined || value === '')) {
      if (this.name === 'first_name') {
        return { value: '', errors: [] };
      }
      return { value: null, errors: [] };
    }

    // Transform the value
    let transformedValue;
    try {
      transformedValue = this.transform(value);
    } catch (error) {
      return { value: null, errors: [error.message] };
    }

    // Validate the transformed value
    const result = this.type.validate(transformedValue, this.metadata);
    
    // Special handling for empty strings after validation
    if (!this.required && result.value === '') {
      if (this.name === 'first_name') {
        return { value: '', errors: [] };
      }
      return { value: null, errors: [] };
    }

    return result;
  }
}

// Name regex patterns - more flexible than before
const NAME_PATTERNS = {
  // Enhanced pattern allowing accents, apostrophes, hyphens, and spaces
  STANDARD: /^[A-Za-zÀ-ÖØ-öø-ÿ\s\-'.]+$/,
  // Pattern for initials
  INITIALS: /^([A-Za-z]\.){1,5}$|^[A-Za-z]([A-Za-z]\s*){0,4}$/
};

/**
 * Definitions for all memorial record fields
 */
const MEMORIAL_FIELDS = [
  new MemorialField('memorial_number', new StringType(), true, {
    format: 'memorial_identifier',
    maxLength: 50,
    transform: (value) => {
      if (value === null || value === undefined) {
        return null;
      }
      
      // Convert to string and trim
      let processed = String(value).trim();
      
      // If it's already a pure integer, convert it to string
      if (typeof value === 'number' && Number.isInteger(value)) {
        return String(value);
      }
      
      // If it's a string that looks like a pure number, keep it as is
      if (/^\d+$/.test(processed)) {
        return processed;
      }
      
      // If it contains prefixes like "HG-18", "M123", extract the number
      const match = processed.match(/([A-Za-z]*[-_]?)(\d+)$/);
      if (match) {
        return match[2]; // Return just the numeric part
      }
      
      // If it looks like a fraction (page number), throw error
      if (/^\d+\/\d+$/.test(processed)) {
        throw new Error(`Memorial number "${processed}" appears to be a page number or fraction - please verify the actual memorial identifier`);
      }
      
      return processed;
    }
  }),
  new MemorialField('first_name', new StringType(), false, {
    format: 'name',
    maxLength: 100,
    transform: (value) => {
      if (value === null || value === undefined || value === '') {
        return '';
      }
      
      // Standardize value
      let processed = String(value).trim();
      if (processed === '') return '';
      
      // Handle initials: convert "J R" to "J.R."
      if (handleInitials.isInitials(processed)) {
        return handleInitials(processed);
      }
      
      // Standard uppercase conversion
      return processed.toUpperCase();
    }
  }),
  new MemorialField('last_name', new StringType(), false, {
    format: 'name',
    maxLength: 100,
    transform: (value) => {
      if (value === null || value === undefined || value === '') {
        return null;
      }
      return String(value).trim().toUpperCase();
    }
  }),
  new MemorialField('year_of_death', new IntegerType(), false, {
    min: 1000,
    max: new Date().getFullYear(),
    transform: (value) => {
      if (value === null || value === undefined || value === '') {
        return null;
      }
      if (typeof value === 'string') {
        const parsed = parseInt(value, 10);
        if (isNaN(parsed)) return null;
        return parsed;
      }
      return value;
    }
  }),
  new MemorialField('inscription', new StringType(), false, {
    maxLength: 5000, // Increased to handle longer responses
    transform: (value) => {
      if (value === null || value === undefined || value === '') {
        return null;
      }
      return String(value).trim();
    }
  })
];

/**
 * Processes raw name input and extracts structured components
 * @param {string} fullName - The complete name to process
 * @returns {Object} Object with first_name, last_name, prefix, and suffix
 */
function processFullName(fullName) {
  if (!fullName) return { first_name: '', last_name: '' };
  
  const processed = preprocessName(fullName);
  
  return {
    first_name: processed.firstName || '',
    last_name: processed.lastName || '',
    ...(processed.prefix ? { prefix: processed.prefix } : {}),
    ...(processed.suffix ? { suffix: processed.suffix } : {})
  };
}

/**
 * Validates a complete memorial data object
 * @param {Object} data - The memorial data to validate
 * @returns {Object} - Validation result with transformed data and errors
 */
function validateMemorialData(data) {
  const errors = [];
  const transformed = {};

  // First check required fields
  for (const field of MEMORIAL_FIELDS) {
    if (field.required && (!data || !(field.name in data) || data[field.name] === null || data[field.name] === '')) {
      errors.push(`${field.name} is required`);
    }
  }

  // If required fields are missing, return early
  if (errors.length > 0) {
    return { value: transformed, errors };
  }

  // Validate each field
  for (const field of MEMORIAL_FIELDS) {
    const value = data[field.name];
    
    // Skip validation for empty strings in non-required fields
    if (!field.required && (value === '' || value === null || value === undefined)) {
      transformed[field.name] = field.name === 'first_name' ? '' : null;
      continue;
    }

    const result = field.validate(value);
    if (result.errors.length > 0) {
      errors.push(...result.errors.map(err => `${field.name}: ${err}`));
    }
    transformed[field.name] = result.value;
  }

  return { value: transformed, errors };
}

/**
 * Transforms memorial data by applying field-specific transformations
 * @param {Object} data - The memorial data to transform
 * @returns {Object} The transformed memorial data
 */
function transformMemorialData(data) {
  const transformed = {};
  
  for (const field of MEMORIAL_FIELDS) {
    // Handle missing fields
    if (!(field.name in data)) {
      transformed[field.name] = undefined;
      continue;
    }

    const value = data[field.name];
    
    // Handle null/empty values
    if (value === null || value === undefined || value === '') {
      transformed[field.name] = field.name === 'first_name' ? '' : null;
      continue;
    }

    // Transform the value
    const result = field.validate(value);
    transformed[field.name] = result.value;
  }

  return transformed;
}

module.exports = {
  MemorialField,
  MEMORIAL_FIELDS,
  validateMemorialData,
  transformMemorialData,
  processFullName,
  NAME_PATTERNS
}; 