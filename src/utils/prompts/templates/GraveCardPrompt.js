const BasePrompt = require('../BasePrompt');
const { ProcessingError } = require('../../errorTypes');
const logger = require('../../logger');

/**
 * Grave Record Card prompt for extracting structured data from processed card images
 * @extends BasePrompt
 */
class GraveCardPrompt extends BasePrompt {
  constructor(config = {}) {
    // BasePrompt requires fields, but we handle complex schema validation manually.
    // Passing empty object satisfies the constructor check.
    super({
      version: '1.0.0',
      description: 'Prompt for extracting structured data from grave record cards',
      fields: {},
      providers: ['openai', 'anthropic', 'gemini', 'mistral', 'mock'],
      ...config
    });
  }

  /**
     * Get the provider-specific prompt configuration
     * @param {string} provider - The AI provider name
     * @returns {Object} Provider prompt config
     */
  getJsonSchema() {
    const dateSchema = {
      type: ['object', 'null'],
      properties: {
        iso:       { type: ['string', 'null'] },
        certainty: { type: ['string', 'null'] }
      }
    };
    const nameSchema = {
      type: 'object',
      properties: {
        full_name:    { type: ['string', 'null'] },
        given_names:  { type: ['string', 'null'] },
        surname:      { type: ['string', 'null'] },
        title_prefix: { type: ['string', 'null'] }
      }
    };
    const intermentSchema = {
      type: 'object',
      properties: {
        sequence_number: { type: ['integer', 'null'] },
        name:            nameSchema,
        date_of_death:   dateSchema,
        date_of_burial:  dateSchema,
        age_at_death:    { type: ['integer', 'null'] },
        notes:           { type: ['string', 'null'] }
      },
      required: ['name']
    };
    return {
      type: 'object',
      properties: {
        location: {
          type: 'object',
          properties: {
            section:          { type: ['string', 'null'] },
            grave_number:     { type: ['integer', 'null'] },
            plot_identifier:  { type: ['string', 'null'] }
          },
          required: ['section', 'grave_number']
        },
        grave: {
          type: 'object',
          properties: {
            number_buried: { type: ['integer', 'null'] },
            status:        { type: ['string', 'null'] },
            description:   { type: ['string', 'null'] }
          },
          required: ['status']
        },
        interments: { type: 'array', items: intermentSchema },
        inscription: {
          type: ['object', 'null'],
          properties: {
            text:                   { type: ['string', 'null'] },
            scripture_or_quote_refs: { type: ['string', 'null'] },
            notes:                  { type: ['string', 'null'] }
          }
        }
      },
      required: ['location', 'grave', 'interments']
    };
  }

  getProviderPrompt(provider) {
    this.validateProvider(provider);

    // Core instruction set shared across providers
    const systemInstruction = `You are a specialised transcriber for historical Grave Record Cards. 
Your goal is to extract genealogical and plot data into a strict JSON format.
Follow these rules strictly:
1. TRANSCRIPTION: 
   - Transcribe text EXACTLY as written.
   - Use single dashes (-) for illegible characters.
   - Use | as line separator for multi-line fields like inscriptions.
   - Do NOT guess. If a letter is ambiguous, use -.
   - Do NOT use [?], [illegible], or similar tags.

2. SCHEMA:
   - Output must match the targeted JSON schema exactly.
   - Ensure all dates are in ISO 8601 (YYYY-MM-DD) where possible in the 'iso' field.
`;

    const userInstruction = `Extract the data from this grave record card image into the following JSON structure.

Grave Record Card Schema (TypeScript-like definition):

interface GraveRecord {
  card_metadata?: {
    source_reference?: string; // filename or id
    card_version?: string;
    notes?: string;
  };
  location: { // REQUIRED
    section: string;
    grave_number: string | number;
    plot_identifier?: string;
  };
  grave: { // REQUIRED
    number_buried?: number | string;
    status: "occupied" | "vacant" | "unknown"; // Default "unknown"
    description_of_grave?: string; // e.g. "Headstone"
    structure_type?: string;
    dimensions?: {
      raw_text?: string;
      length_ft?: number;
      width_ft?: number;
      height_ft?: number;
      unit?: string;
    };
    plot_owned_by?: string;
    comments?: string;
  };
  interments: Array<{
    sequence_number?: number;
    name: { // REQUIRED
      surname?: string;
      given_names?: string;
      full_name?: string;
    };
    date_of_death?: {
      iso?: string; // YYYY-MM-DD
      raw_text?: string;
      certainty?: "certain" | "estimated" | "uncertain";
    };
    date_of_burial?: {
        iso?: string;
        raw_text?: string;
    };
    age_at_death?: number | string;
    notes?: string;
  }>;
  inscription?: {
    text?: string;
    scripture_or_quote_refs?: string[];
    notes?: string;
  };
  sketch?: {
    present: boolean;
    description?: string;
  };
}

CRITICAL VALIDATION RULES:
1. If grave.status is "vacant", the 'interments' array MUST be empty.
2. 'location' and 'grave' objects are REQUIRED.
3. For each interment, 'name' is REQUIRED.
4. Returns valid JSON only.
`;

    if (provider === 'openai') {
      return {
        systemPrompt: systemInstruction,
        userPrompt: userInstruction
      };
    } else if (provider === 'anthropic') {
      return {
        systemPrompt: systemInstruction,
        userPrompt: `JSON SCHEMA REQUIRED:\n${userInstruction}\n\nStrictly output valid JSON only.`
      };
    } else if (provider === 'gemini') {
      return {
        systemPrompt: systemInstruction,
        userPrompt: `JSON SCHEMA REQUIRED:\n${userInstruction}\n\nStrictly output valid JSON only.`
      };
    }
  }

  /**
     * Stub for abstract method
     */
  getPromptText() {
    return 'Refer to getProviderPrompt for full instructions.';
  }

  /**
     * Validate and convert the raw AI response
     * @param {Object} rawData - The parsed JSON data from the model
     * @returns {Object} Validated data
     */
  validateAndConvert(rawData) {
    logger.info('[GraveCardPrompt] Validating raw data');

    if (!rawData || typeof rawData !== 'object') {
      throw new ProcessingError('Invalid response: expected JSON object', 'validation_error');
    }

    // 1. Top-Level Required Fields
    if (!rawData.location) throw new Error('Missing required top-level field: location');
    if (!rawData.grave) throw new Error('Missing required top-level field: grave');

    // 2. Validate Location
    if (!rawData.location.section) throw new Error('Missing required field: location.section');
    if (rawData.location.grave_number === undefined || rawData.location.grave_number === null) {
      // It can be string or int, but must exist. 0 is valid? "0" is valid.
      throw new Error('Missing required field: location.grave_number');
    }

    // 3. Validate Grave
    if (rawData.grave.status) {
      const validStatuses = ['occupied', 'vacant', 'unknown'];
      if (!validStatuses.includes(rawData.grave.status.toLowerCase())) {
        throw new Error(`Invalid value for grave.status: ${rawData.grave.status}`);
      }
    }

    // 4. Validate Logic (Vacant vs Interments)
    const interments = rawData.interments || [];
    if (!Array.isArray(interments)) {
      throw new Error('Field interments must be an array');
    }

    if (rawData.grave.status === 'vacant' && interments.length > 0) {
      throw new Error('Grave is marked \'vacant\' but contains interments');
    }

    // 5. Validate Interments items
    const intermentWarnings = [];
    interments.forEach((interment, index) => {
      if (!interment.name) {
        throw new Error(`Interment at index ${index} missing required field: name`);
      }

      // Validate Date Formats if present
      if (interment.date_of_death && interment.date_of_death.iso) {
        if (!this._isValidDate(interment.date_of_death.iso)) {
          throw new Error(`Invalid ISO date format for interment ${index}: ${interment.date_of_death.iso}`);
        }
      }

      // Cross-field plausibility checks per interment
      if (interment.date_of_death && interment.date_of_death.iso &&
          interment.date_of_burial && interment.date_of_burial.iso) {
        if (Date.parse(interment.date_of_burial.iso) < Date.parse(interment.date_of_death.iso)) {
          intermentWarnings.push(
            `BURIAL_BEFORE_DEATH: interment ${index} burial date ${interment.date_of_burial.iso} is before death date ${interment.date_of_death.iso}`
          );
        }
      }

      if (interment.age_at_death != null) {
        const age = Number(interment.age_at_death);
        if (!isNaN(age)) {
          if (age > 150 || age < 0) {
            intermentWarnings.push(
              `AGE_IMPLAUSIBLE: interment ${index} age_at_death ${age} is outside plausible range (0–150)`
            );
          }
          if (interment.date_of_death && interment.date_of_death.iso) {
            const deathYear = new Date(interment.date_of_death.iso).getFullYear();
            if (deathYear - age < 1400) {
              intermentWarnings.push(
                `AGE_DEATH_MISMATCH: interment ${index} implied birth year ${deathYear - age} (death ${deathYear} - age ${age}) is before 1400`
              );
            }
          }
        }
      }
    });

    // If we passed all checks, return the data
    // We could do deep cleaning/trimming here if needed, but for now return as-is
    return { data: rawData, confidenceScores: {}, validationWarnings: intermentWarnings };
  }

  _isValidDate(dateString) {
    if (typeof dateString !== 'string') return false;
    // Simple regex for YYYY-MM-DD or partials provided conventions allow it, 
    // but schema says format: date (ISO 8601). 
    // JavaScript Date.parse accepts YYYY-MM-DD
    const timestamp = Date.parse(dateString);
    if (isNaN(timestamp)) return false;

    // Strict regex check to avoid loose parsing like "2023" being valid if we strictly want YYYY-MM-DD
    // The schema says "format": "date" which usually implies full date. 
    // But partial_date definition allows raw_text for fuzzy ones. 
    // If 'iso' field is occupied, it should be a real date.
    return /^\d{4}-\d{2}-\d{2}$/.test(dateString);
  }
}

module.exports = GraveCardPrompt;
