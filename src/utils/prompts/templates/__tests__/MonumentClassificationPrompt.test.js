const MonumentClassificationPrompt = require('../MonumentClassificationPrompt');
const { ProcessingError } = require('../../../errorTypes');

describe('MonumentClassificationPrompt', () => {
  let prompt;

  beforeEach(() => {
    prompt = new MonumentClassificationPrompt();
  });

  describe('Config', () => {
    test('has version 1.0.0', () => {
      expect(prompt.version).toBe('1.0.0');
    });

    test('includes all 4 providers', () => {
      expect(prompt.providers).toContain('openai');
      expect(prompt.providers).toContain('anthropic');
      expect(prompt.providers).toContain('gemini');
      expect(prompt.providers).toContain('mock');
    });

    test('description mentions DEBS', () => {
      expect(prompt.description).toContain('DEBS');
    });
  });

  describe('getProviderPrompt', () => {
    test('returns { systemPrompt, userPrompt } for openai', () => {
      const config = prompt.getProviderPrompt('openai');
      expect(config).toHaveProperty('systemPrompt');
      expect(config).toHaveProperty('userPrompt');
      expect(typeof config.systemPrompt).toBe('string');
      expect(typeof config.userPrompt).toBe('string');
    });

    test('openai prompt contains all 20 field names', () => {
      const config = prompt.getProviderPrompt('openai');
      const allFields = [
        'memorial_number', 'broad_type', 'detailed_type', 'memorial_condition',
        'inscription_condition', 'height_mm', 'width_mm', 'depth_mm',
        'material_primary', 'material_base', 'orientation', 'additional_elements',
        'text_panel_shape', 'text_panel_definition', 'inscription_technique',
        'letter_style', 'central_motifs', 'marginal_motifs', 'date_of_monument',
        'confidence_level'
      ];
      const combinedPrompt = `${config.systemPrompt} ${config.userPrompt}`;
      allFields.forEach(field => {
        expect(combinedPrompt).toContain(field);
      });
    });

    test('openai prompt mentions DEBS context', () => {
      const config = prompt.getProviderPrompt('openai');
      expect(config.systemPrompt).toMatch(/DEBS|classification/i);
    });

    test('anthropic prompt appends "Strictly output valid JSON only"', () => {
      const config = prompt.getProviderPrompt('anthropic');
      expect(config.userPrompt).toContain('Strictly output valid JSON only');
    });

    test('gemini prompt appends "Strictly output valid JSON only"', () => {
      const config = prompt.getProviderPrompt('gemini');
      expect(config.userPrompt).toContain('Strictly output valid JSON only');
    });

    test('throws on invalid provider', () => {
      expect(() => prompt.getProviderPrompt('invalid')).toThrow();
    });
  });

  describe('validateAndConvert — happy path', () => {
    const validCompleteResponse = {
      memorial_number: '123',
      broad_type: 'Headstone',
      detailed_type: 'Headstone with round top',
      memorial_condition: 'Sound and in situ',
      inscription_condition: 'All legible',
      height_mm: 1200,
      width_mm: 600,
      depth_mm: 100,
      material_primary: 'Granite',
      material_base: 'Slate',
      orientation: 'N',
      additional_elements: 'Footstone present',
      text_panel_shape: 'Rectangle',
      text_panel_definition: 'Rectilinear',
      inscription_technique: 'Incised',
      letter_style: 'Roman',
      central_motifs: 'Cross',
      marginal_motifs: 'Floral border',
      date_of_monument: '1850-1870',
      confidence_level: 'High',
      comments: 'Well-preserved example'
    };

    test('valid complete response succeeds', () => {
      const result = prompt.validateAndConvert(validCompleteResponse);
      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('confidenceScores');
      expect(result).toHaveProperty('validationWarnings');
      expect(result.data.broad_type).toBe('Headstone');
    });

    test('returns object with data, confidenceScores, validationWarnings', () => {
      const result = prompt.validateAndConvert(validCompleteResponse);
      expect(result.data).toBeDefined();
      expect(result.confidenceScores).toBeDefined();
      expect(result.validationWarnings).toBeDefined();
    });

    test('partial data with optional nulls succeeds', () => {
      const partial = {
        broad_type: 'Headstone',
        memorial_condition: 'Sound and in situ',
        inscription_condition: 'All legible',
        confidence_level: 'Medium'
      };
      const result = prompt.validateAndConvert(partial);
      expect(result.data.broad_type).toBe('Headstone');
    });
  });

  describe('validateAndConvert — validation', () => {
    test('null input throws ProcessingError', () => {
      expect(() => prompt.validateAndConvert(null)).toThrow();
    });

    test('undefined input throws ProcessingError', () => {
      expect(() => prompt.validateAndConvert(undefined)).toThrow();
    });

    test('empty object throws', () => {
      expect(() => prompt.validateAndConvert({})).toThrow();
    });

    test('missing broad_type throws', () => {
      const missing = {
        memorial_condition: 'Sound and in situ',
        confidence_level: 'Medium'
      };
      expect(() => prompt.validateAndConvert(missing)).toThrow();
    });
  });

  describe('validateAndConvert — confidence_level mapping', () => {
    test('confidence_level "High" maps to 1.0', () => {
      const data = {
        broad_type: 'Headstone',
        confidence_level: 'High'
      };
      const result = prompt.validateAndConvert(data);
      expect(result.confidenceScores.confidence_level).toBe(1.0);
    });

    test('confidence_level "Medium" maps to 0.75', () => {
      const data = {
        broad_type: 'Headstone',
        confidence_level: 'Medium'
      };
      const result = prompt.validateAndConvert(data);
      expect(result.confidenceScores.confidence_level).toBe(0.75);
    });

    test('confidence_level "Low" maps to 0.3', () => {
      const data = {
        broad_type: 'Headstone',
        confidence_level: 'Low'
      };
      const result = prompt.validateAndConvert(data);
      expect(result.confidenceScores.confidence_level).toBe(0.3);
    });

    test('invalid confidence_level defaults to "Medium" (0.75)', () => {
      const data = {
        broad_type: 'Headstone',
        confidence_level: 'Invalid'
      };
      const result = prompt.validateAndConvert(data);
      expect(result.confidenceScores.confidence_level).toBe(0.75);
    });
  });

  describe('validateAndConvert — field_verify_flags extraction', () => {
    test('preserves [FV] tags in data fields', () => {
      const data = {
        broad_type: 'Headstone',
        material_primary: '[FV] Limestone',
        confidence_level: 'Medium'
      };
      const result = prompt.validateAndConvert(data);
      expect(result.data.material_primary).toBe('[FV] Limestone');
    });

    test('extracts [FV] tagged fields into field_verify_flags array', () => {
      const data = {
        broad_type: 'Headstone',
        material_primary: '[FV] Limestone',
        letter_style: '[FV] Roman',
        date_of_monument: '[FV] 1850',
        confidence_level: 'Medium'
      };
      const result = prompt.validateAndConvert(data);
      expect(result.data.field_verify_flags).toContain('material_primary');
      expect(result.data.field_verify_flags).toContain('letter_style');
      expect(result.data.field_verify_flags).toContain('date_of_monument');
      expect(result.data.field_verify_flags.length).toBe(3);
    });

    test('no [FV] tags results in empty field_verify_flags', () => {
      const data = {
        broad_type: 'Headstone',
        material_primary: 'Granite',
        confidence_level: 'Medium'
      };
      const result = prompt.validateAndConvert(data);
      expect(result.data.field_verify_flags).toEqual([]);
    });
  });

  describe('validateAndConvert — numeric validation', () => {
    test('negative height_mm is rejected', () => {
      const data = {
        broad_type: 'Headstone',
        height_mm: -1200,
        confidence_level: 'Medium'
      };
      expect(() => prompt.validateAndConvert(data)).toThrow();
    });

    test('negative width_mm is rejected', () => {
      const data = {
        broad_type: 'Headstone',
        width_mm: -600,
        confidence_level: 'Medium'
      };
      expect(() => prompt.validateAndConvert(data)).toThrow();
    });

    test('negative depth_mm is rejected', () => {
      const data = {
        broad_type: 'Headstone',
        depth_mm: -100,
        confidence_level: 'Medium'
      };
      expect(() => prompt.validateAndConvert(data)).toThrow();
    });

    test('positive dimensions are accepted', () => {
      const data = {
        broad_type: 'Headstone',
        height_mm: 1200,
        width_mm: 600,
        depth_mm: 100,
        confidence_level: 'Medium'
      };
      const result = prompt.validateAndConvert(data);
      expect(result.data.height_mm).toBe(1200);
    });

    test('null dimensions are accepted', () => {
      const data = {
        broad_type: 'Headstone',
        height_mm: null,
        width_mm: null,
        confidence_level: 'Medium'
      };
      const result = prompt.validateAndConvert(data);
      expect(result.data.height_mm).toBeNull();
    });
  });

  describe('getPromptText', () => {
    test('returns non-empty string containing DEBS', () => {
      const text = prompt.getPromptText();
      expect(typeof text).toBe('string');
      expect(text.length).toBeGreaterThan(0);
      expect(text).toContain('DEBS');
    });
  });
});
