const TypographicAnalysisPrompt = require('../../../../src/utils/prompts/templates/TypographicAnalysisPrompt');
const BasePrompt = require('../../../../src/utils/prompts/BasePrompt');
const { ProcessingError, isEmptySheetError } = require('../../../../src/utils/errorTypes');

describe('TypographicAnalysisPrompt', () => {
  let prompt;

  beforeEach(() => {
    prompt = new TypographicAnalysisPrompt();
  });

  test('should verify strict inheritance from BasePrompt', () => {
    expect(prompt).toBeInstanceOf(BasePrompt);
  });

  describe('getProviderPrompt', () => {
    test('should return correct structure for openai', () => {
      const result = prompt.getProviderPrompt('openai');
      expect(result).toHaveProperty('systemPrompt');
      expect(result).toHaveProperty('userPrompt');

      // Verify key instructions exist in the prompts
      expect(result.systemPrompt + result.userPrompt).toMatch(/line-for-line/i);
      expect(result.systemPrompt + result.userPrompt).toMatch(/dash/i); // illegible notation
      expect(result.systemPrompt + result.userPrompt).toMatch(/botanical|mechanical/i);
    });

    test('should return correct structure for anthropic', () => {
      const result = prompt.getProviderPrompt('anthropic');
      expect(result).toHaveProperty('systemPrompt');
      expect(result).toHaveProperty('messages');
      expect(Array.isArray(result.messages)).toBe(true);

      const promptText = result.systemPrompt + JSON.stringify(result.messages);
      expect(promptText).toMatch(/line-for-line/i);
    });

    test('should throw error for unsupported provider', () => {
      expect(() => {
        prompt.getProviderPrompt('unsupported_provider');
      }).toThrow(/provider not supported/i);
    });

    test('should throw validation error for null provider', () => {
      expect(() => {
        prompt.getProviderPrompt(null);
      }).toThrow();
    });
  });

  describe('validateAndConvert', () => {
    const validFullResponse = {
      transcription_raw: 'HERE LIES|JOHN SMITH',
      stone_condition: 'Weathered limestone',
      structural_observations: 'Centred text',
      typography_analysis: { style: 'Roman', serifs: 'Slab' },
      iconography: {
        central_symbol: { type: 'Cross', features: ['Ribbed volutes'] },
        style_technique: { carving_method: 'Incised' },
        decorative_elements: [],
        daisy_wheels: false
      },
      // Optional fields explicitly null for complete match
      memorial_number: null,
      first_name: null,
      last_name: null,
      year_of_death: null,
      inscription: null
    };

    const validMinimalResponse = {
      transcription_raw: 'JANE DOE',
      // Optional fields omitted or null
      stone_condition: null,
      structural_observations: null,
      typography_analysis: null,
      iconography: null
    };

    test('should validate a complete valid response', () => {
      const { data: result, confidenceScores } = prompt.validateAndConvert(validFullResponse);
      expect(result).toEqual(expect.objectContaining(validFullResponse));
      expect(confidenceScores).toBeDefined();
    });

    test('should validate a minimal valid response', () => {
      const { data: result } = prompt.validateAndConvert(validMinimalResponse);
      // We now ensure iconography is always an initialized object structure
      expect(result.iconography).toMatchObject({
        style_technique: {},
        central_symbol: {},
        decorative_elements: [],
        daisy_wheels: false
      });
      // Check other fields match
      expect(result.transcription_raw).toBe(validMinimalResponse.transcription_raw);
    });

    test('should throw ProcessingError for null input', () => {
      expect(() => {
        prompt.validateAndConvert(null);
      }).toThrow(ProcessingError);
    });

    test('should throw specific type for empty object', () => {
      let error;
      try {
        prompt.validateAndConvert({});
      } catch (e) {
        error = e;
      }
      expect(error).toBeInstanceOf(ProcessingError);
      expect(isEmptySheetError(error)).toBe(true); // Should map to empty_monument/empty_sheet concept
    });

    test('should throw validation error if transcription_raw is missing', () => {
      const invalidResponse = { ...validFullResponse };
      delete invalidResponse.transcription_raw;

      expect(() => {
        prompt.validateAndConvert(invalidResponse);
      }).toThrow(/transcription_raw is required/i);
    });

    test('should throw specialized error for prohibted notation [?]', () => {
      const invalidResponse = {
        ...validFullResponse,
        transcription_raw: 'Agnes [?] Smith'
      };

      expect(() => {
        prompt.validateAndConvert(invalidResponse);
      }).toThrow(/prohibited notation/i);
    });

    test('should preserve historical characters', () => {
      const historicalResponse = {
        ...validMinimalResponse,
        transcription_raw: 'Here lieſ ye Body'
      };

      const { data: result } = prompt.validateAndConvert(historicalResponse);
      expect(result.transcription_raw).toBe('Here lieſ ye Body');
    });

    test('should throw error for malformed iconography structure', () => {
      const invalidResponse = {
        ...validFullResponse,
        iconography: 'Just a string description' // Should be object
      };

      expect(() => {
        prompt.validateAndConvert(invalidResponse);
      }).toThrow(/iconography/i); // Should mention field name in error
    });
  });
  describe('Iconography Validation', () => {
    // Base valid iconography object for reuse
    const validIconography = {
      base_type: 'Headstone',
      cultural_context: '18th Century Anglican',
      religious_context: 'Christian',
      style_technique: {
        carving_method: 'Incised',
        relief_depth: 'Shallow',
        artistic_style: 'Primitive'
      },
      central_symbol: {
        type: 'Cross',
        features: ['Flared terminals']
      },
      decorative_elements: [
        { type: 'Acanthus', location: 'Top corners' }
      ],
      daisy_wheels: false
    };

    const validResponse = {
      transcription_raw: 'TEST',
      iconography: validIconography
    };

    test('should validate a complete iconography object', () => {
      const { data: result } = prompt.validateAndConvert(validResponse);
      expect(result.iconography).toEqual(validIconography);
    });

    test('should automatically detect daisy wheels from description if boolean is false/missing', () => {
      const response = {
        ...validResponse,
        iconography: {
          ...validIconography,
          daisy_wheels: false,
          decorative_elements: [
            { type: 'Hexfoil', description: 'Interlocking arcs of a single radius' }
          ]
        }
      };

      const { data: result } = prompt.validateAndConvert(response);
      expect(result.iconography.daisy_wheels).toBe(true);
    });

    test('should accept botanical terms without warning', () => {
      const spy = jest.spyOn(console, 'warn');
      const response = {
        ...validResponse,
        iconography: {
          ...validIconography,
          decorative_elements: [
            { type: 'Cordate leaf', description: 'Undulating vine' }
          ]
        }
      };

      prompt.validateAndConvert(response);
      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    test('should log warning but accept interpretive labels', () => {
      const spy = jest.spyOn(console, 'warn').mockImplementation(() => { });
      const response = {
        ...validResponse,
        iconography: {
          ...validIconography,
          decorative_elements: [
            { type: 'Depiction of a flower', description: 'Lovely rosette' }
          ]
        }
      };

      const { data: result } = prompt.validateAndConvert(response);
      expect(result.iconography).toBeDefined();
      // Should match "flower" or "rosette" in warning
      expect(spy).toHaveBeenCalledWith(expect.stringMatching(/quality warning/i));
      spy.mockRestore();
    });

    test('should handle completely empty iconography by returning initialized empty structure', () => {
      const response = {
        transcription_raw: 'TEST',
        iconography: {}
      };

      const { data: result } = prompt.validateAndConvert(response);
      expect(result.iconography).toMatchObject({
        style_technique: {},
        central_symbol: {},
        decorative_elements: [],
        daisy_wheels: false
      });
    });

    test('should ensure style_technique is an object', () => {
      const response = {
        transcription_raw: 'TEST',
        iconography: {
          style_technique: 'Just a string' // Invalid
        }
      };

      // Should arguably throw or convert? Plan says "ensure correct types"
      // Let's assume strict validation per earlier requirements
      expect(() => {
        prompt.validateAndConvert(response);
      }).toThrow(/style_technique/i);
    });
  });
});
