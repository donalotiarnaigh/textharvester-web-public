const BasePrompt = require('../BasePrompt');
const { MEMORIAL_FIELDS } = require('../types/memorialFields');
const { ProcessingError } = require('../../errorTypes');
const { preprocessName } = require('../../nameProcessing');
const logger = require('../../logger');

/**
 * Standard OCR prompt for memorial inscriptions
 * @extends BasePrompt
 */
class MemorialOCRPrompt extends BasePrompt {
  /**
   * Create a new memorial OCR prompt
   * @param {Object} config Configuration options
   */
  constructor(config = {}) {
    super({
      version: '2.0.0',
      description: 'Standard OCR prompt for extracting basic memorial inscription data with type validation',
      fields: MEMORIAL_FIELDS,
      providers: ['openai', 'anthropic', 'gemini', 'mistral', 'mock'],
      ...config
    });
  }

  /**
   * Get the complete prompt text with type information
   * @returns {string} Formatted prompt text
   */
  getPromptText() {
    return `You're an expert in OCR and are working in a heritage/genealogy context assisting in data processing post graveyard survey.

Your task is to extract specific fields and return them in JSON format.

CRITICAL: Return ONLY these 5 fields in JSON format, nothing more:
- memorial_number: The memorial's unique numeric identifier (INTEGER) - extract ONLY the number, ignore any prefixes like "HG-", "M", "PLOT-"
- first_name: The first person's first name (STRING, UPPERCASE)
- last_name: The first person's last name (STRING, UPPERCASE)
- year_of_death: The first person's year of death only (INTEGER)
- inscription: The complete inscription text (STRING)

Example of EXACT JSON format required:

{
  "memorial_number": { "value": 18, "confidence": 0.95 },
  "first_name": { "value": "JOHN", "confidence": 0.92 },
  "last_name": { "value": "SMITH", "confidence": 0.98 },
  "year_of_death": { "value": 1900, "confidence": 0.99 },
  "inscription": { "value": "IN LOVING MEMORY OF JOHN SMITH WHO DIED 1ST JANUARY 1900 AGED 70 YEARS AND OF HIS WIFE MARY SMITH WHO DIED 2ND FEBRUARY 1910 AGED 75 YEARS AND OF THEIR SON PETER SMITH (INFANT) JUNE 1911", "confidence": 0.88 }
}

IMPORTANT RULES:
- Return ONLY these 5 fields in JSON format - NO NESTED OBJECTS, NO ADDITIONAL FIELDS
- Even if the image is a structured form or sheet, DO NOT reproduce that structure
- Do not include 'document_type', 'graveyard_info', or any other metadata
- For multiple people, use ONLY the first person mentioned
- Names must be in UPPERCASE
- Memorial number MUST be an integer (whole number) - if you see "HG-18", extract 18; if you see "M123", extract 123
- IGNORE page numbers, fractions like "1/2", "2/3" - these are NOT memorial numbers
- Look for the actual memorial identifier number to the top right of the record page
- Extract only the year from death dates as INTEGER
- If any field cannot be determined, use null
- Preserve original spelling in the inscription text

TRANSCRIPTION NOTATION RULES:
- Use single dashes (-) for each illegible character/digit (e.g., "J---")
- Use pipes (|) for line breaks in the inscription, never newlines

CONFIDENCE SCORING:
For each field, return { "value": <extracted_value>, "confidence": <0.0-1.0> }
- 0.9-1.0: Clearly readable, certain
- 0.7-0.9: Readable but some ambiguity (faded text, unusual spelling)
- 0.5-0.7: Uncertain, best guess
- Below 0.5: Very uncertain
For inscription, also include: "uncertain_segments": ["word1", "word2"] for ambiguous spans.`;
  }

  /**
   * Get provider-specific prompt configuration
   * @param {string} provider Provider name
   * @returns {Object} Provider-specific prompt configuration
   */
  getJsonSchema() {
    const envelope = (valueSchema) => ({
      type: 'object',
      additionalProperties: false,
      properties: {
        value: valueSchema,
        confidence: { type: 'number' }
      },
      required: ['value', 'confidence']
    });
    return {
      type: 'object',
      additionalProperties: false,
      properties: {
        memorial_number: envelope({ type: ['integer', 'null'] }),
        first_name:      envelope({ type: ['string',  'null'] }),
        last_name:       envelope({ type: ['string',  'null'] }),
        year_of_death:   envelope({ type: ['integer', 'null'] }),
        inscription:     envelope({ type: ['string',  'null'] })
      },
      required: ['memorial_number', 'first_name', 'last_name', 'year_of_death', 'inscription']
    };
  }

  getProviderPrompt(provider) {
    this.validateProvider(provider);
    const basePrompt = this.getPromptText();

    switch (provider.toLowerCase()) {
    case 'openai':
      return {
        systemPrompt: 'You are an expert OCR system trained by OpenAI, specializing in heritage and genealogical data extraction.',
        userPrompt: `${basePrompt}\n\nResponse Format:\n- Use response_format: { type: "json" }\n- All numeric values (year_of_death) MUST be actual integers\n- All text fields must be properly formatted strings`
      };

    case 'anthropic':
      return {
        systemPrompt: 'You are Claude, an expert OCR system trained by Anthropic, specializing in heritage and genealogical data extraction.',
        userPrompt: `${basePrompt}\n\nResponse Format:\n- Return valid JSON only\n- All numeric values (year_of_death) MUST be actual integers\n- All text fields must be properly formatted strings\n- Ensure strict adherence to field formats`
      };

    case 'gemini':
      return {
        systemPrompt: 'You are Gemini, an expert OCR system created by Google, specializing in heritage and genealogical data extraction.',
        userPrompt: `${basePrompt}\n\nResponse Format:\n- Return valid JSON only\n- All numeric values (year_of_death) MUST be actual integers\n- All text fields must be properly formatted strings\n- Ensure strict adherence to field formats`
      };

    case 'mistral':
      return {
        systemPrompt: 'You are an expert OCR system specializing in heritage and genealogical data extraction.',
        userPrompt: `${basePrompt}\n\nResponse Format:\n- Return valid JSON only\n- All numeric values (year_of_death) MUST be actual integers\n- All text fields must be properly formatted strings\n- Ensure strict adherence to field formats`
      };

    default:
      return { userPrompt: basePrompt };
    }
  }

  /**
   * Validate and convert OCR data
   * @param {Object} data - Raw OCR data
   * @returns {Object} - Validated and converted data
   */
  validateAndConvert(data) {
    logger.info('[MemorialOCRPrompt] Raw data input:', JSON.stringify(data, null, 2));

    // Handle null or undefined data
    if (!data) {
      throw new ProcessingError(
        'No data received from OCR processing - the sheet may be empty or unreadable',
        'empty_sheet'
      );
    }

    // Handle empty object
    if (Object.keys(data).length === 0) {
      throw new ProcessingError(
        'Empty data received from OCR processing - no text could be extracted from the sheet',
        'empty_sheet'
      );
    }

    // Unwrap {value, confidence} format if present (backward-compatible with plain values)
    const confidenceScores = {};
    const unwrapped = {};
    for (const field of this.fields) {
      const { value, confidence } = this._extractValueAndConfidence(data[field.name]);
      unwrapped[field.name] = value;
      confidenceScores[field.name] = confidence;
    }

    // First check for required fields
    const requiredFields = this.fields.filter(field => field.required);
    for (const field of requiredFields) {
      const fieldValue = unwrapped[field.name];
      logger.info(`[MemorialOCRPrompt] Checking required field ${field.name}:`, fieldValue, typeof fieldValue);

      if (!fieldValue || (typeof fieldValue === 'string' && fieldValue.trim() === '')) {
        throw new ProcessingError(
          `${field.name} could not be found - please check if the field is present on the memorial`,
          'validation'
        );
      }
    }

    // Check if all fields are empty
    const allFieldsEmpty = this.fields.every(field => {
      const value = unwrapped[field.name];
      return !value || (typeof value === 'string' && value.trim() === '');
    });

    if (allFieldsEmpty) {
      throw new ProcessingError(
        'No readable text found on the sheet - please check if the sheet is empty or the image quality is sufficient',
        'empty_sheet'
      );
    }

    const result = {};

    // Process name fields first
    if (unwrapped.first_name || unwrapped.last_name) {
      const fullName = [unwrapped.first_name, unwrapped.last_name].filter(Boolean).join(' ');
      const processedName = preprocessName(fullName);

      result.first_name = processedName.firstName || unwrapped.first_name;
      result.last_name = processedName.lastName || unwrapped.last_name;
    }

    // Process remaining fields
    for (const field of this.fields) {
      if (field.name !== 'first_name' && field.name !== 'last_name') {
        const value = unwrapped[field.name];
        logger.info(`[MemorialOCRPrompt] Processing field ${field.name}:`, value, typeof value);

        if (value !== undefined) {
          try {
            result[field.name] = this.validateField(field.name, value);
            logger.info(`[MemorialOCRPrompt] Validated ${field.name}:`, result[field.name]);
          } catch (error) {
            logger.error(`[MemorialOCRPrompt] Validation error for ${field.name}:`, error.message);
            throw error;
          }
        }
      }
    }

    // Cross-field plausibility checks
    const crossFieldWarnings = [];

    // IDENTICAL_NAMES: first_name and last_name are the same value (already uppercased)
    if (result.first_name && result.last_name && result.first_name === result.last_name) {
      crossFieldWarnings.push('IDENTICAL_NAMES: first_name and last_name are the same value');
      // Cap both confidences below reviewThreshold (0.70)
      confidenceScores.first_name = Math.min(confidenceScores.first_name ?? 1, 0.4);
      confidenceScores.last_name = Math.min(confidenceScores.last_name ?? 1, 0.4);
    }

    // IMPLAUSIBLE_AGE: parse age from inscription text
    if (result.inscription) {
      const ageMatch = result.inscription.match(/\bAGED?\s+(\d+)\s+YEAR/i);
      if (ageMatch) {
        const parsedAge = parseInt(ageMatch[1], 10);
        if (parsedAge > 150) {
          crossFieldWarnings.push(`IMPLAUSIBLE_AGE: inscription age ${parsedAge} exceeds 150 years`);
          confidenceScores.inscription = Math.min(confidenceScores.inscription ?? 1, 0.4);
        }
        if (result.year_of_death != null && result.year_of_death - parsedAge < 1400) {
          const impliedBirth = result.year_of_death - parsedAge;
          crossFieldWarnings.push(
            `IMPLAUSIBLE_AGE: implied birth year ${impliedBirth} (death ${result.year_of_death} - age ${parsedAge}) is before 1400`
          );
          confidenceScores.inscription = Math.min(confidenceScores.inscription ?? 1, 0.4);
          confidenceScores.year_of_death = Math.min(confidenceScores.year_of_death ?? 1, 0.4);
        }
      }
    }

    // DEATH_YEAR_IMPLAUSIBLE: flag years before reliable historical records (pre-1400)
    // Note: future years are already rejected by the year_of_death field validator (max: currentYear)
    if (result.year_of_death != null && result.year_of_death < 1400) {
      crossFieldWarnings.push(
        `DEATH_YEAR_IMPLAUSIBLE: year_of_death ${result.year_of_death} is before 1400`
      );
      confidenceScores.year_of_death = Math.min(confidenceScores.year_of_death ?? 1, 0.4);
    }

    logger.info('[MemorialOCRPrompt] Final result:', JSON.stringify(result, null, 2));
    return { data: result, confidenceScores, validationWarnings: crossFieldWarnings };
  }
}

module.exports = MemorialOCRPrompt; 