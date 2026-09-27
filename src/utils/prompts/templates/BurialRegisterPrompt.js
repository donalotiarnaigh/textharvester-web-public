const BasePrompt = require('../BasePrompt');
const { StringType, IntegerType, validateValue } = require('../types/dataTypes');
const { parseBurialDate } = require('../../historicalDateParser');

const PAGE_FIELDS = {
  volume_id: {
    type: new StringType(),
    description: 'Volume identifier for the burial register',
    metadata: { required: true, format: 'identifier', maxLength: 50 }
  },
  page_number: {
    type: new IntegerType(),
    description: 'Sequential page number within the volume',
    metadata: {}
  },
  parish_header_raw: {
    type: new StringType(),
    description: 'Parish name as it appears in the page header',
    metadata: { maxLength: 200 }
  },
  county_header_raw: {
    type: new StringType(),
    description: 'County name from the page header',
    metadata: { maxLength: 200 }
  },
  year_header_raw: {
    type: new StringType(),
    description: 'Year indicated in the page header',
    metadata: { maxLength: 50 }
  },
  page_marginalia_raw: {
    type: new StringType(),
    description: 'Any marginalia or notes that apply to the whole page',
    metadata: { maxLength: 1000 }
  }
};

const ENTRY_FIELDS = {
  row_index_on_page: {
    type: new IntegerType(),
    description: 'Row index of the entry on the page, starting from 1',
    metadata: { required: true, min: 1 }
  },
  entry_id: {
    type: new StringType(),
    description: 'Generated entry identifier formatted as {volume_id}_p{page_number}_r{row_index}'
  },
  entry_no_raw: {
    type: new StringType(),
    description: 'Entry number exactly as written on the register page',
    metadata: { maxLength: 50 }
  },
  name_raw: {
    type: new StringType(),
    description: 'Full name as written in the register entry',
    metadata: { maxLength: 300 }
  },
  abode_raw: {
    type: new StringType(),
    description: 'Place of residence as written in the entry',
    metadata: { maxLength: 300 }
  },
  burial_date_raw: {
    type: new StringType(),
    description: 'Burial date as written, including any partial or uncertain values',
    metadata: { maxLength: 100 }
  },
  age_raw: {
    type: new StringType(),
    description: 'Age at death as written in the entry',
    metadata: { maxLength: 50 }
  },
  officiant_raw: {
    type: new StringType(),
    description: 'Name or title of officiant as written',
    metadata: { maxLength: 200 }
  },
  marginalia_raw: {
    type: new StringType(),
    description: 'Entry-level marginalia or notes',
    metadata: { maxLength: 1000 }
  },
  extra_notes_raw: {
    type: new StringType(),
    description: 'Any additional notes for this entry',
    metadata: { maxLength: 1000 }
  },
  row_ocr_raw: {
    type: new StringType(),
    description: 'Raw OCR text for the entire entry row',
    metadata: { maxLength: 2000 }
  },
  uncertainty_flags: {
    type: new StringType(),
    description: 'List of uncertainty flags for this entry (array of strings)'
  }
};

/**
 * Prompt template for burial register extraction
 * @extends BasePrompt
 */
class BurialRegisterPrompt extends BasePrompt {
  /**
   * Create a new burial register prompt
   * @param {Object} config Configuration options
   */
  constructor(config = {}) {
    super({
      version: '1.1.0',
      description: 'Prompt template for extracting burial register data',
      fields: PAGE_FIELDS,
      providers: ['openai', 'anthropic', 'gemini', 'mistral', 'mock'],
      ...config
    });

    this.pageFields = PAGE_FIELDS;
    this.entryFields = ENTRY_FIELDS;
  }

  /**
   * Get the complete prompt text with extraction instructions
   * @returns {string} Formatted prompt text
   */
  getPromptText() {
    return `You are an expert in reading historical burial registers.

Extract the data from the provided page image and return a single JSON object with this exact structure:
{
  "volume_id": string,
  "page_number": integer,
  "parish_header_raw": { "value": string | null, "confidence": 0.0-1.0 },
  "county_header_raw": { "value": string | null, "confidence": 0.0-1.0 },
  "year_header_raw": { "value": string | null, "confidence": 0.0-1.0 },
  "page_marginalia_raw": { "value": string | null, "confidence": 0.0-1.0 },
  "entries": [
    {
      "row_index_on_page": integer,                                          // 1-based position of the row on the page
      "entry_id": string,                                                    // leave blank/null, will be generated downstream
      "entry_no_raw": { "value": string | null, "confidence": 0.0-1.0 },   // entry number as written
      "name_raw": { "value": string | null, "confidence": 0.0-1.0 },       // full name as written
      "abode_raw": { "value": string | null, "confidence": 0.0-1.0 },      // abode/residence as written
      "burial_date_raw": { "value": string | null, "confidence": 0.0-1.0 },// burial date as written (allow partial/uncertain)
      "age_raw": { "value": string | null, "confidence": 0.0-1.0 },        // age as written
      "officiant_raw": { "value": string | null, "confidence": 0.0-1.0 },  // officiant/ministers initials or name
      "marginalia_raw": { "value": string | null, "confidence": 0.0-1.0 }, // entry-level marginalia
      "extra_notes_raw": { "value": string | null, "confidence": 0.0-1.0 },// any extra notes for the entry
      "row_ocr_raw": { "value": string | null, "confidence": 0.0-1.0 },    // raw OCR text for the entire row
      "uncertainty_flags": [string]                                          // array of uncertainty notes; use [] if none
    }
  ]
}

Important instructions:
- Preserve the original spelling/punctuation from the page. Do not standardise or infer.
- If a field is missing or unreadable, use null as the value (or [] for uncertainty_flags).
- Do not add extra fields or nesting beyond what is shown.
- Maintain the original row order; set row_index_on_page starting at 1 and incrementing.
- Return only the JSON object, nothing else.

TRANSCRIPTION NOTATION RULES:
- Use single dashes (-) for each illegible character/digit
- Use pipes (|) for line breaks in text fields, never newlines
- Preserve original spelling exactly

CONFIDENCE SCORING:
For every field shown as { "value": ..., "confidence": ... }, return that envelope with a score in [0.0, 1.0]:
- 0.9-1.0: Clearly readable, certain
- 0.7-0.9: Readable but some ambiguity (faded text, unusual spelling)
- 0.5-0.7: Uncertain, best guess
- Below 0.5: Very uncertain`;
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
    const entrySchema = {
      type: 'object',
      additionalProperties: false,
      properties: {
        row_index_on_page: { type: 'integer' },
        entry_id:          { type: ['string', 'null'] },
        entry_no_raw:      envelope({ type: ['string', 'null'] }),
        name_raw:          envelope({ type: ['string', 'null'] }),
        abode_raw:         envelope({ type: ['string', 'null'] }),
        burial_date_raw:   envelope({ type: ['string', 'null'] }),
        age_raw:           envelope({ type: ['string', 'null'] }),
        officiant_raw:     envelope({ type: ['string', 'null'] }),
        marginalia_raw:    envelope({ type: ['string', 'null'] }),
        extra_notes_raw:   envelope({ type: ['string', 'null'] }),
        row_ocr_raw:       envelope({ type: ['string', 'null'] }),
        uncertainty_flags: { type: 'array', items: { type: 'string' } }
      },
      required: ['row_index_on_page', 'entry_id', 'entry_no_raw', 'name_raw', 'abode_raw',
        'burial_date_raw', 'age_raw', 'officiant_raw', 'marginalia_raw',
        'extra_notes_raw', 'row_ocr_raw', 'uncertainty_flags']
    };
    return {
      type: 'object',
      additionalProperties: false,
      properties: {
        volume_id:           { type: 'string' },
        page_number:         { type: 'integer' },
        parish_header_raw:   envelope({ type: ['string', 'null'] }),
        county_header_raw:   envelope({ type: ['string', 'null'] }),
        year_header_raw:     envelope({ type: ['string', 'null'] }),
        page_marginalia_raw: envelope({ type: ['string', 'null'] }),
        entries:             { type: 'array', items: entrySchema }
      },
      required: ['volume_id', 'page_number', 'parish_header_raw', 'county_header_raw',
        'year_header_raw', 'page_marginalia_raw', 'entries']
    };
  }

  getProviderPrompt(provider) {
    this.validateProvider(provider);
    const basePrompt = this.getPromptText();

    switch (provider.toLowerCase()) {
    case 'openai':
      return {
        systemPrompt: 'You are an expert OCR system trained by OpenAI, specialising in structured extraction from historical burial registers.',
        userPrompt: `${basePrompt}\n\nResponse Format:\n- Use response_format: { type: "json" }\n- Return a single JSON object matching the schema above\n- Ensure numeric fields (page_number, row_index_on_page) are integers\n- Use null for missing text fields and [] for uncertainty_flags`
      };

    case 'anthropic':
      return {
        systemPrompt: 'You are Claude, an expert OCR system trained by Anthropic, specialising in structured extraction from historical burial registers.',
        userPrompt: `${basePrompt}\n\nResponse Format:\n- Return valid JSON only (no markdown)\n- Return a single JSON object matching the schema above\n- Ensure numeric fields (page_number, row_index_on_page) are integers\n- Use null for missing text fields and [] for uncertainty_flags`
      };

    case 'gemini':
      return {
        systemPrompt: 'You are Gemini, an expert OCR system created by Google, specialising in structured extraction from historical burial registers.',
        userPrompt: `${basePrompt}\n\nResponse Format:\n- Return valid JSON only\n- Return a single JSON object matching the schema above\n- Ensure numeric fields (page_number, row_index_on_page) are integers\n- Use null for missing text fields and [] for uncertainty_flags`
      };

    case 'mistral':
      return {
        systemPrompt: 'You are an expert OCR system specialising in structured extraction from historical burial registers.',
        userPrompt: `${basePrompt}\n\nResponse Format:\n- Return valid JSON only (no markdown)\n- Return a single JSON object matching the schema above\n- Ensure numeric fields (page_number, row_index_on_page) are integers\n- Use null for missing text fields and [] for uncertainty_flags`
      };

    default:
      return { userPrompt: basePrompt };
    }
  }

  /**
   * Validate and normalize page-level burial register data
   * @param {Object} pageDataRaw Raw page JSON from the provider
   * @returns {Object} Validated page data with entries array preserved
   */
  validateAndConvertPage(pageDataRaw) {
    if (!pageDataRaw || typeof pageDataRaw !== 'object') {
      throw new Error('Page data must be an object with required fields');
    }

    const errors = [];
    let pageData = {};
    let pageConfidenceScores = {};

    try {
      const superResult = super.validateAndConvert(pageDataRaw);
      pageData = superResult.data;
      pageConfidenceScores = superResult.confidenceScores;
    } catch (error) {
      if (error.details?.length) {
        errors.push(...error.details);
      } else {
        errors.push(error.message);
      }
    }

    if (!('entries' in pageDataRaw)) {
      errors.push('Entries array is required');
    } else if (!Array.isArray(pageDataRaw.entries)) {
      errors.push('Entries must be an array');
    } else {
      const invalidIndex = pageDataRaw.entries.findIndex(entry => entry !== null && typeof entry !== 'object');
      if (invalidIndex !== -1) {
        errors.push(`Entry at index ${invalidIndex} must be an object`);
      }
    }

    if (errors.length > 0) {
      const error = new Error(errors[0]);
      error.details = errors;
      throw error;
    }

    return {
      data: {
        ...pageData,
        entries: pageDataRaw.entries || []
      },
      confidenceScores: pageConfidenceScores,
      validationWarnings: []
    };
  }

  /**
   * Validate and normalize an individual entry object
   * @param {Object} entryRaw Raw entry data
   * @returns {Object} Validated entry data
   */
  validateAndConvertEntry(entryRaw) {
    if (!entryRaw || typeof entryRaw !== 'object') {
      throw new Error('Entry must be an object with required fields');
    }

    // Unwrap {value, confidence} format if present (backward-compatible with plain values)
    const confidenceScores = {};
    const unwrapped = {};
    for (const fieldName of Object.keys(this.entryFields)) {
      const raw = fieldName in entryRaw ? entryRaw[fieldName] : null;
      const { value, confidence } = this._extractValueAndConfidence(raw);
      unwrapped[fieldName] = value;
      confidenceScores[fieldName] = confidence;
    }

    const errors = [];
    const result = {};

    for (const [fieldName, field] of Object.entries(this.entryFields)) {
      if (field.metadata?.required && !(fieldName in entryRaw)) {
        errors.push(`${fieldName.charAt(0).toUpperCase() + fieldName.slice(1)} is required`);
      }
    }

    for (const fieldName of Object.keys(this.entryFields)) {
      if (fieldName === 'uncertainty_flags') {
        const flagsRaw = unwrapped[fieldName] !== undefined ? unwrapped[fieldName] : [];

        if (flagsRaw === null || flagsRaw === undefined) {
          result.uncertainty_flags = [];
        } else if (!Array.isArray(flagsRaw)) {
          errors.push('uncertainty_flags must be an array of strings');
        } else {
          const invalidIndex = flagsRaw.findIndex(flag => typeof flag !== 'string');
          if (invalidIndex !== -1) {
            errors.push(`uncertainty_flags must be an array of strings (invalid value at index ${invalidIndex})`);
          } else {
            result.uncertainty_flags = flagsRaw.map(flag => flag.trim());
          }
        }
        continue;
      }

      try {
        const value = unwrapped[fieldName] !== undefined ? unwrapped[fieldName] : null;
        result[fieldName] = this.validateEntryField(fieldName, value);
      } catch (error) {
        errors.push(error.message);
      }
    }

    if (errors.length > 0) {
      const error = new Error(errors[0]);
      error.details = errors;
      throw error;
    }

    // Cross-field plausibility checks
    const crossFieldWarnings = [];

    // IMPLAUSIBLE_AGE: parse first number from age_raw
    if (result.age_raw) {
      const ageMatch = result.age_raw.match(/(\d+)/);
      if (ageMatch) {
        const parsedAge = parseInt(ageMatch[1], 10);
        if (parsedAge > 150) {
          crossFieldWarnings.push(`IMPLAUSIBLE_AGE: age_raw "${result.age_raw}" exceeds 150 years`);
          // Cap confidence below reviewThreshold (0.70)
          confidenceScores.age_raw = Math.min(confidenceScores.age_raw ?? 1, 0.4);
        }
      }
    }

    // Historical date parsing — normalize burial_date_raw and detect OS/NS ambiguities
    if (result.burial_date_raw) {
      const parsed = parseBurialDate(result.burial_date_raw);
      if (parsed.normalizedDate !== null) result.burial_date_normalized = parsed.normalizedDate;
      if (parsed.normalizedYear !== null) result.burial_date_year = parsed.normalizedYear;
      crossFieldWarnings.push(...parsed.warnings);
    }

    // DATE_ORDER_ANOMALY / BURIAL_YEAR_IMPLAUSIBLE: check burial year against header year and range
    const burialYear = result.burial_date_year ||
      (result.burial_date_raw && (result.burial_date_raw.match(/(\d{4})/) || [])[1]
        ? parseInt((result.burial_date_raw.match(/(\d{4})/) || [])[1], 10)
        : null);

    if (burialYear != null) {
      const currentYear = new Date().getFullYear();
      if (burialYear < 1500 || burialYear > currentYear) {
        crossFieldWarnings.push(
          `BURIAL_YEAR_IMPLAUSIBLE: burial year ${burialYear} is outside the plausible range (1500–${currentYear})`
        );
        confidenceScores.burial_date_raw = Math.min(confidenceScores.burial_date_raw ?? 1, 0.4);
      }

      // year_header_raw is a page-level field, not in entryFields — read from the raw input
      const yearHeaderRaw = entryRaw.year_header_raw !== undefined ? entryRaw.year_header_raw : null;
      if (yearHeaderRaw) {
        const headerMatch = String(yearHeaderRaw).match(/(\d{4})/);
        if (headerMatch) {
          const headerYear = parseInt(headerMatch[1], 10);
          if (burialYear > headerYear + 2) {
            crossFieldWarnings.push(
              `DATE_ORDER_ANOMALY: burial year ${burialYear} is more than 2 years after page header year ${headerYear}`
            );
          }
        }
      }
    }

    return { data: result, confidenceScores, validationWarnings: crossFieldWarnings };
  }

  validateEntryField(fieldName, value) {
    const field = this.entryFields[fieldName];

    if (!field) {
      throw new Error(`Unknown field: ${fieldName}`);
    }

    if (value === null || value === undefined) {
      return null;
    }

    const fieldType = typeof field.type === 'object' ? field.type.name : field.type;
    let convertedValue = value;

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

    const result = validateValue(convertedValue, fieldType, field.metadata);

    if (result.errors.length > 0) {
      const errorMessages = result.errors.map(error => {
        let transformedError = error.replace('Value', fieldName.charAt(0).toUpperCase() + fieldName.slice(1));

        if (transformedError.includes('Invalid integer value:')) {
          const valueMatch = transformedError.match(/Invalid integer value: (.+)/);
          const invalidValue = valueMatch ? valueMatch[1] : 'unknown';
          transformedError = `Cannot convert value "${invalidValue}" to integer`;
        }
        if (transformedError.includes('Invalid float value:')) {
          const valueMatch = transformedError.match(/Invalid float value: (.+)/);
          const invalidValue = valueMatch ? valueMatch[1] : 'unknown';
          transformedError = `Cannot convert value "${invalidValue}" to float`;
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
}

module.exports = BurialRegisterPrompt;
