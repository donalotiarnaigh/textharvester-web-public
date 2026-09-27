const BasePrompt = require('../BasePrompt');
const { ProcessingError } = require('../../errorTypes');

class TypographicAnalysisPrompt extends BasePrompt {
  constructor(config = {}) {
    super({
      version: config.version || '1.0.0',
      description: 'Generates comprehensive typographic and iconographic analysis of gravestones.',
      providers: ['openai', 'anthropic', 'gemini', 'mistral'],
      fields: {
        memorial_number: { type: 'integer', description: 'Unique identifier for the memorial if visible', metadata: { required: false } },
        first_name: { type: 'string', description: 'First name of the deceased', metadata: { required: false } },
        last_name: { type: 'string', description: 'Last name of the deceased', metadata: { required: false } },
        year_of_death: { type: 'string', description: 'Year of death (or partial year e.g. 19--)', metadata: { required: false } },
        inscription: { type: 'string', description: 'Cleaned inscription text for search', metadata: { required: false } },
        transcription_raw: { type: 'string', description: 'Exact line-for-line transcription with | separators', metadata: { required: true } },
        stone_condition: { type: 'string', description: 'Physical condition of the stone', metadata: { required: false } },
        structural_observations: { type: 'string', description: 'Observations about layout and structure', metadata: { required: false } },
        typography_analysis: {
          type: { name: 'object' },
          description: 'Detailed analysis of lettering style',
          metadata: { required: false }
        },
        iconography: {
          type: { name: 'object' },
          description: 'Analysis of decorative elements',
          metadata: { required: false }
        }
      }
    });

    if (config.provider) {
      this.provider = config.provider;
    }
  }

  getPromptText() {
    return `
You are an expert typographic analyst specializing in historical gravestone inscriptions. 
Your task is to analyze the provided image and generate a structured JSON response.

CRITICAL INSTRUCTIONS:

1. **Line-for-Line Transcription Fidelity**:
   - Return a \`transcription_raw\` field where each line of text on the stone is separated by a pipe character (\`|\`).
   - Preserve original spelling, even if incorrect or archaic.
   - Do NOT autocorrect text.
   - For illegible or eroded characters, use a single dash \`-\` for each missing character (e.g., "J-HN SM-TH").
   - Do NOT use notation like "[?]", "[illegible]", or "[weathered]".

2. **Historical Characters**:
   - Preserve the long-s ('ſ') where present.
   - Preserve the thorn ('þ') where present.
   - Preserve superscripts (e.g., in "19th" or "Wm") by noting them in the \`typography_analysis\` section, but transcribe them as standard characters in \`transcription_raw\` unless Unicode superscripts are clearly readable.

3. **Iconography & Ornamentation**:
   - Use precise **mechanical and botanical terminology**.
   - Avoid interpretive labels.
     - ❌ "flower", "rosette", "heart-shaped", "ivy"
     - ✅ "concentric circles", "ribbed volutes", "cordate leaves", "undulating vine"
   - If you see compass-drawn hexfoils (daisy wheels), identify them by their geometric construction ("interlocking arcs of a single radius").

4. **Typographic Analysis**:
   - Analyze serifs, case style, and any specific letter inconsistencies.

5. **Stone Condition**:
   - Describe the material and weathering state objectively.

Output MUST be valid JSON matching the defined schema.

CONFIDENCE SCORING:
For each field, return { "value": <extracted_value>, "confidence": <0.0-1.0> }
- 0.9-1.0: Clearly readable, certain
- 0.7-0.9: Readable but some ambiguity (faded text, unusual spelling)
- 0.5-0.7: Uncertain, best guess
- Below 0.5: Very uncertain
For inscription, also include: "uncertain_segments": ["word1", "word2"] for ambiguous spans.
    `;
  }

  getProviderPrompt(provider) {
    // Validate provider first
    this.validateProvider(provider);

    // Get the base prompt components
    const baseComponents = super.getProviderPrompt(provider);

    if (provider === 'anthropic' || provider === 'gemini' || provider === 'mistral') {
      // Override for Anthropic and Gemini to return 'messages' array format
      return {
        systemPrompt: baseComponents.systemPrompt,
        messages: [
          {
            role: 'user',
            content: baseComponents.userPrompt
          }
        ]
      };
    }

    // Default (OpenAI) returns standard structure
    return baseComponents;
  }

  /**
     * Validate and convert the response data
     * @param {Object} data Raw response data
     * @returns {Object} Validated and converted data
     * @throws {ProcessingError} If validation fails
     */
  validateAndConvert(data) {
    // Handle null/undefined
    if (!data) {
      throw new ProcessingError('No data received for validation', 'validation_error');
    }

    // Check for empty object
    if (Object.keys(data).length === 0) {
      throw new ProcessingError('Empty response received from AI', 'empty_sheet');
    }

    try {
      // Unwrap {value, confidence} format if present (backward-compatible with plain values)
      const confidenceScores = {};
      const unwrapped = {};
      for (const fieldName of Object.keys(this.fields)) {
        const raw = fieldName in data ? data[fieldName] : null;
        const { value, confidence } = this._extractValueAndConfidence(raw);
        unwrapped[fieldName] = value;
        confidenceScores[fieldName] = confidence;
      }

      // First pass: validate required fields are present
      for (const [fieldName, field] of Object.entries(this.fields)) {
        if (field.metadata?.required && !(fieldName in data)) {
          throw new Error(`${fieldName} is required`);
        }
      }

      const result = {};
      const errors = [];

      // Validate each field
      for (const [fieldName] of Object.entries(this.fields)) {
        try {
          const value = unwrapped[fieldName] !== undefined ? unwrapped[fieldName] : null;

          // Special handling for iconography to ensure structure even if null
          if (fieldName === 'iconography') {
            result[fieldName] = this.validateIconography(value);
          } else {
            result[fieldName] = this.validateField(fieldName, value);
          }
        } catch (error) {
          errors.push(error.message);
        }
      }

      if (errors.length > 0) {
        const error = new Error(errors[0]);
        error.details = errors;
        throw error;
      }

      return { data: result, confidenceScores, validationWarnings: [] };
    } catch (error) {
      if (!(error instanceof ProcessingError)) {
        throw new ProcessingError(error.message, 'validation_error');
      }
      throw error;
    }
  }

  /**
     * specialized validation for style_technique object
     */
  validateStyleTechnique(styleTechnique) {
    if (!styleTechnique) return {};
    if (typeof styleTechnique !== 'object') {
      throw new Error('style_technique must be an object');
    }
    return styleTechnique;
  }

  /**
     * specialized validation for iconography object
     */
  validateIconography(iconography) {
    // If null/undefined/empty object, return initialized structure
    if (!iconography || (typeof iconography === 'object' && Object.keys(iconography).length === 0)) {
      return {
        style_technique: {},
        central_symbol: {},
        decorative_elements: [],
        daisy_wheels: false
      };
    }

    if (typeof iconography !== 'object') {
      throw new Error('Invalid iconography: must be an object');
    }

    const validated = { ...iconography };

    // Validate sub-objects
    validated.style_technique = this.validateStyleTechnique(validated.style_technique);

    // Ensure array for decorative elements
    if (!Array.isArray(validated.decorative_elements)) {
      validated.decorative_elements = [];
    }

    // Check for interpretive labels (quality check)
    this.checkInterpretiveLabels(validated.decorative_elements);

    // Auto-detect daisy wheels from descriptions if not explicitly true
    if (!validated.daisy_wheels) {
      const hasDaisyWheelDesc = validated.decorative_elements.some(el =>
        (el.description && /interlocking arcs|single radius/i.test(el.description)) ||
        (el.type && /hexfoil/i.test(el.type))
      );
      if (hasDaisyWheelDesc) {
        validated.daisy_wheels = true;
      }
    }

    return validated;
  }

  checkInterpretiveLabels(elements) {
    const interpretiveTerms = ['flower', 'rosette', 'heart-shaped', 'ivy'];
    const warnings = [];

    elements.forEach(el => {
      const text = (el.type || '') + ' ' + (el.description || '');
      interpretiveTerms.forEach(term => {
        if (text.toLowerCase().includes(term)) {
          warnings.push(`Quality warning: Found interpretive term "${term}". Prefer specific botanical/mechanical terms.`);
        }
      });
    });

    if (warnings.length > 0) {
      console.warn(warnings.join(' | '));
    }
  }

  /**
     * Validate a single field with support for object types
     * @param {string} fieldName Name of the field
     * @param {*} value Value to validate
     * @returns {*} Validated value
     */
  validateField(fieldName, value) {
    // Handle object fields
    if (fieldName === 'typography_analysis') {
      if (value === null || value === undefined) {
        return null;
      }
      if (typeof value !== 'object') {
        throw new Error(`Invalid ${fieldName}: must be an object`);
      }
      return value;
    }

    // Iconography is handled via validateIconography called directly in validateAndConvert
    // but we keep this check for completeness if called directly
    if (fieldName === 'iconography') {
      return this.validateIconography(value);
    }

    // Handle transcription specific validation
    if (fieldName === 'transcription_raw') {
      const validated = super.validateField(fieldName, value);

      // Check for prohibited notation
      if (/\[\?\]/.test(validated)) {
        throw new Error('Prohibited notation [?] found in transcription. Use dashes (-) for illegible characters.');
      }

      return validated;
    }

    // Delegate to base for other fields
    return super.validateField(fieldName, value);
  }
}

module.exports = TypographicAnalysisPrompt;
