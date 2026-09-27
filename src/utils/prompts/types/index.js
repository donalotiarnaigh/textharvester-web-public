const {
  DataType,
  StringType,
  IntegerType,
  BooleanType
} = require('./dataTypes');

const {
  MemorialField,
  MEMORIAL_FIELDS,
  validateMemorialData,
  transformMemorialData
} = require('./memorialFields');

/**
 * Create a string type with optional configuration
 * @param {Object} config - Type configuration
 * @param {boolean} [config.required=false] - Whether the type is required
 * @returns {StringType} A configured string type
 */
function createStringType(/* eslint-disable-line no-unused-vars */ config = {}) {
  return new StringType();
}

/**
 * Create an integer type with optional configuration
 * @param {Object} config - Type configuration
 * @param {boolean} [config.required=false] - Whether the type is required
 * @returns {IntegerType} A configured integer type
 */
function createIntegerType(/* eslint-disable-line no-unused-vars */ config = {}) {
  return new IntegerType();
}

/**
 * Create a boolean type with optional configuration
 * @param {Object} config - Type configuration
 * @param {boolean} [config.required=false] - Whether the type is required
 * @returns {BooleanType} A configured boolean type
 */
function createBooleanType(/* eslint-disable-line no-unused-vars */ config = {}) {
  return new BooleanType();
}

/**
 * Create a field with the specified type and metadata
 * @param {string} name - The field name
 * @param {DataType} type - The field's data type
 * @param {Object} metadata - Field metadata
 * @param {string} [metadata.description=''] - Field description
 * @param {boolean} [metadata.required=false] - Whether the field is required
 * @param {function} [metadata.transform] - Value transformation function
 * @returns {MemorialField} The created field
 */
function createField(name, type, metadata = {}) {
  const { required = false, ...fieldMetadata } = metadata;
  return new MemorialField(name, type, required, fieldMetadata);
}

// Export everything needed for the type system
module.exports = {
  // Core type classes
  DataType,
  StringType,
  IntegerType,
  BooleanType,

  // Memorial field system
  MemorialField,
  MEMORIAL_FIELDS,
  validateMemorialData,
  transformMemorialData,

  // Helper functions
  createStringType,
  createIntegerType,
  createBooleanType,
  createField
}; 