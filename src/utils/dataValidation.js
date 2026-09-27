const logger = require('./logger');

/**
 * Validates and converts data types according to schema
 * @param {Object} data - The data object to validate
 * @returns {Object} - The validated and converted data object
 */
function validateAndConvertTypes(data) {
  const result = { ...data };

  // Convert memorial_number field - preserve as string to maintain leading zeros
  if ('memorial_number' in data) {
    if (data.memorial_number === null || data.memorial_number === '') {
      result.memorial_number = null;
    } else {
      // Keep as string to preserve leading zeros (e.g., "0123" stays "0123")
      result.memorial_number = String(data.memorial_number);
    }
  }

  if ('year_of_death' in data) {
    if (data.year_of_death === null || data.year_of_death === '') {
      result.year_of_death = null;
    } else {
      result.year_of_death = parseInt(data.year_of_death, 10);
      if (isNaN(result.year_of_death)) {
        logger.warn(`Invalid year_of_death: ${data.year_of_death}`);
        result.year_of_death = null;
      }
    }
  }

  // Ensure string fields are strings or null
  ['first_name', 'last_name', 'inscription', 'ai_provider', 'model_version', 'prompt_version', 'transcription_raw'].forEach(field => {
    if (field in data) {
      if (data[field] === null || data[field] === undefined) {
        result[field] = null;
      } else {
        result[field] = String(data[field]);
      }
    }
  });

  // Deserialize JSON fields.
  // On parse failure the field is set to null, needs_review is forced to 1,
  // and logger.error is called so the event is visible regardless of quietMode.
  const JSON_FIELDS = [
    'stone_condition',
    'typography_analysis',
    'iconography',
    'structural_observations',
    'confidence_scores',
    'validation_warnings'
  ];

  let parseFailure = false;

  JSON_FIELDS.forEach(field => {
    if (field in data) {
      if (data[field] === null || data[field] === undefined || data[field] === '') {
        result[field] = null;
      } else if (typeof data[field] === 'string') {
        try {
          result[field] = JSON.parse(data[field]);
        } catch (err) {
          logger.error(`JSON parse failure for field "${field}" — record flagged for review`, err);
          result[field] = null;
          parseFailure = true;
        }
      } else if (typeof data[field] === 'object') {
        // Already an object (e.g. mock data or fast path)
        result[field] = data[field];
      }
    }
  });

  if (parseFailure) {
    result.needs_review = 1;
  }

  return result;
}

/**
 * Validates and converts an array of memorial records
 * @param {Array} records - Array of memorial records
 * @returns {Array} - Array of validated and converted records
 */
function validateAndConvertRecords(records) {
  if (!Array.isArray(records)) {
    logger.error('Invalid records format: expected array');
    return [];
  }

  return records.map(record => validateAndConvertTypes(record));
}

module.exports = {
  validateAndConvertTypes,
  validateAndConvertRecords
}; 