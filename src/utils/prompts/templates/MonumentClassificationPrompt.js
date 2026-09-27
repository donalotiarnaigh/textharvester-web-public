const BasePrompt = require('../BasePrompt');
const { ProcessingError } = require('../../errorTypes');
const logger = require('../../logger');

/**
 * Monument Classification prompt for extracting DEBS V3 physical characteristics
 * @extends BasePrompt
 */
class MonumentClassificationPrompt extends BasePrompt {
  constructor(config = {}) {
    super({
      version: '1.0.0',
      description: 'Prompt for classifying monument physical characteristics against DEBS V3 schema',
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
  getProviderPrompt(provider) {
    this.validateProvider(provider);

    const systemInstruction = `You are an expert in recording the physical characteristics of funerary monuments against the DEBS V3 (Descriptive Encoding and Digitisation Standards) schema from the CBA Practical Handbook 15 (Mytum).

Your task is to classify each monument based on its visible physical characteristics:
- Material composition and condition
- Dimensions and structural elements
- Inscription legibility and technique
- Decorative motifs and lettering style

Classification output should be accurate and complete. For uncertain fields, use the [FV] prefix to mark values needing verification.`;

    const userInstruction = `Classify this funerary monument image against the DEBS V3 schema. Extract the following 20 fields as a JSON object:

{
  "memorial_number": "string | null (visible number on stone)",
  "broad_type": "string (REQUIRED — Headstone, Cross, Tomb, Ledger, Sculpture, etc.)",
  "detailed_type": "string | null (full description, e.g., 'Headstone with round top, quarter-circular shoulders')",
  "memorial_condition": "string (Sound and in situ / Sound but displaced / Falling apart / Collapsed / Overgrown)",
  "inscription_condition": "string (All legible / Partially legible / Not legible / Traces / Never inscribed)",
  "height_mm": "number | null (height including base, mm)",
  "width_mm": "number | null (width, mm)",
  "depth_mm": "number | null (thickness/depth, mm)",
  "material_primary": "string | null (Slate, Marble, Granite, Sandstone, Limestone, Concrete, etc.)",
  "material_base": "string | null (base material if different from primary)",
  "orientation": "string | null (Compass direction: N/NE/E/SE/S/SW/W/NW)",
  "additional_elements": "string | null (Footstone, bodystone, kerbs, infill description)",
  "text_panel_shape": "string | null (Square, Circle, Oval, Rectangle, Shield, Cartouche, etc.)",
  "text_panel_definition": "string | null (Rectilinear / Incised design / Moulded design / Inset panel / Raised panel)",
  "inscription_technique": "string | null (Incised / Inlaid / Relief / Painted / Applied, etc.)",
  "letter_style": "string | null (Roman / San serif / Clarendon / Egyptian / Copper plate / Gothic)",
  "central_motifs": "string | null (Central decorative motif description)",
  "marginal_motifs": "string | null (Border/marginal decoration description)",
  "date_of_monument": "string | null (Estimated date or range, e.g., '1850-1870')",
  "confidence_level": "string (High / Medium / Low)"
}

INSTRUCTIONS:
1. ALL VALUES MUST MATCH THE ALLOWED ENUMS/TYPES ABOVE.
2. For uncertain classifications, prefix the value with [FV] to mark for verification, e.g., "[FV] Marble".
3. confidence_level must be High / Medium / Low only.
4. All dimensions (height_mm, width_mm, depth_mm) must be positive integers or null.
5. Return ONLY valid JSON matching the exact schema specified. No explanatory text outside the JSON object.`;

    if (provider === 'openai') {
      return {
        systemPrompt: systemInstruction,
        userPrompt: userInstruction
      };
    } else if (provider === 'anthropic') {
      return {
        systemPrompt: systemInstruction,
        userPrompt: `${userInstruction}\n\nStrictly output valid JSON only.`
      };
    } else if (provider === 'gemini') {
      return {
        systemPrompt: systemInstruction,
        userPrompt: `${userInstruction}\n\nStrictly output valid JSON only.`
      };
    }
  }

  /**
   * Stub for abstract method
   */
  getPromptText() {
    return 'DEBS V3 Monument Classification: Extract 20 physical characteristic fields from funerary monument images. Refer to getProviderPrompt for full instructions.';
  }

  /**
   * Validate and convert the raw AI response
   * @param {Object} rawData - The parsed JSON data from the model
   * @returns {Object} Validated data with { data, confidenceScores, validationWarnings }
   */
  validateAndConvert(rawData) {
    logger.info('[MonumentClassificationPrompt] Validating raw data');

    if (!rawData || typeof rawData !== 'object') {
      throw new ProcessingError('Invalid response: expected JSON object', 'validation_error');
    }

    // 1. Require broad_type (the only truly required field)
    if (!rawData.broad_type) {
      throw new Error('Missing required field: broad_type');
    }

    // 2. Validate confidence_level (default to 'Medium')
    const confidenceLevel = rawData.confidence_level || 'Medium';
    const validConfidenceLevels = ['High', 'Medium', 'Low'];
    let normalizedConfidenceLevel = confidenceLevel;
    if (!validConfidenceLevels.includes(confidenceLevel)) {
      logger.warn(`Invalid confidence_level: ${confidenceLevel}, defaulting to Medium`);
      normalizedConfidenceLevel = 'Medium';
    }

    // 3. Validate numeric fields (positive or null)
    const numericFields = ['height_mm', 'width_mm', 'depth_mm'];
    for (const field of numericFields) {
      if (rawData[field] !== null && rawData[field] !== undefined) {
        const value = parseFloat(rawData[field]);
        if (isNaN(value) || value < 0) {
          throw new Error(`Invalid value for ${field}: must be positive number or null`);
        }
      }
    }

    // 4. Extract [FV] tagged fields
    const fieldVerifyFlags = [];
    const stringFields = [
      'memorial_number', 'detailed_type', 'material_primary', 'material_base',
      'orientation', 'additional_elements', 'text_panel_shape', 'text_panel_definition',
      'inscription_technique', 'letter_style', 'central_motifs', 'marginal_motifs',
      'date_of_monument'
    ];

    for (const field of stringFields) {
      if (rawData[field] && typeof rawData[field] === 'string' && rawData[field].startsWith('[FV]')) {
        fieldVerifyFlags.push(field);
      }
    }

    // 5. Attach field_verify_flags to data
    rawData.field_verify_flags = fieldVerifyFlags;

    // 6. Normalize confidence_level in data
    rawData.confidence_level = normalizedConfidenceLevel;

    // 7. Map confidence_level to numeric score
    const confidenceMapping = {
      'High': 1.0,
      'Medium': 0.75,
      'Low': 0.3
    };
    const confidenceScores = {
      confidence_level: confidenceMapping[normalizedConfidenceLevel]
    };

    return {
      data: rawData,
      confidenceScores,
      validationWarnings: []
    };
  }
}

module.exports = MonumentClassificationPrompt;
