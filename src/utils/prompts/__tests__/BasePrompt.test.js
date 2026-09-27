const BasePrompt = require('../BasePrompt');

describe('BasePrompt', () => {
  describe('constructor', () => {
    it('should initialize with default values when no config provided', () => {
      const prompt = new BasePrompt();
      expect(prompt.version).toBe('1.0.0');
      expect(prompt.description).toBe('');
      expect(prompt.fields).toEqual({});
      expect(prompt.providers).toEqual(['openai', 'anthropic', 'gemini', 'mistral', 'mock']);
    });

    it('should initialize with provided config values', () => {
      const config = {
        version: '2.0.0',
        description: 'Test prompt',
        fields: {
          name: { type: 'string', description: 'Full name' },
          age: { type: 'integer', description: 'Age in years' }
        },
        providers: ['openai']
      };
      const prompt = new BasePrompt(config);
      expect(prompt.version).toBe('2.0.0');
      expect(prompt.description).toBe('Test prompt');
      expect(prompt.fields).toEqual(config.fields);
      expect(prompt.providers).toEqual(['openai']);
    });

    it('should validate field types against supported types', () => {
      expect(() => {
        new BasePrompt({
          fields: {
            test: { type: 'unsupported_type', description: 'Test field' }
          }
        });
      }).toThrow('Unsupported field type: unsupported_type');
    });
  });

  describe('field validation', () => {
    let prompt;

    beforeEach(() => {
      prompt = new BasePrompt({
        fields: {
          name: { type: 'string', description: 'Full name' },
          age: { type: 'integer', description: 'Age in years' },
          active: { type: 'boolean', description: 'Is active' },
          score: { type: 'float', description: 'Test score' },
          birthdate: { type: 'date', description: 'Date of birth' }
        }
      });
    });

    it('should validate and convert string fields', () => {
      expect(prompt.validateField('name', 'John Doe')).toBe('John Doe');
      expect(prompt.validateField('name', null)).toBeNull();
    });

    it('should validate and convert integer fields', () => {
      expect(prompt.validateField('age', '25')).toBe(25);
      expect(prompt.validateField('age', 25)).toBe(25);
      expect(prompt.validateField('age', null)).toBeNull();
      expect(() => prompt.validateField('age', 'invalid')).toThrow('Cannot convert value "invalid" to integer');
    });

    it('should validate and convert boolean fields', () => {
      expect(prompt.validateField('active', true)).toBe(true);
      expect(prompt.validateField('active', 'true')).toBe(true);
      expect(prompt.validateField('active', 'false')).toBe(false);
      expect(() => prompt.validateField('active', 'invalid')).toThrow('Invalid boolean value');
      expect(prompt.validateField('active', null)).toBeNull();
    });

    it('should validate and convert float fields', () => {
      expect(prompt.validateField('score', '92.5')).toBe(92.5);
      expect(prompt.validateField('score', 92.5)).toBe(92.5);
      expect(prompt.validateField('score', null)).toBeNull();
      expect(() => prompt.validateField('score', 'invalid')).toThrow('Cannot convert value "invalid" to float');
    });

    it('should validate and convert date fields', () => {
      const date = new Date('2024-03-22');
      expect(prompt.validateField('birthdate', '2024-03-22')).toEqual(date);
      expect(prompt.validateField('birthdate', date)).toEqual(date);
      expect(prompt.validateField('birthdate', null)).toBeNull();
      expect(() => prompt.validateField('birthdate', 'invalid')).toThrow('Invalid date value');
    });

    it('should handle null and undefined values', () => {
      expect(prompt.validateField('name', null)).toBeNull();
      expect(prompt.validateField('age', undefined)).toBeNull();
    });
  });

  describe('provider integration', () => {
    let prompt;

    beforeEach(() => {
      prompt = new BasePrompt({
        fields: {
          name: { type: 'string', description: 'Full name' },
          age: { type: 'integer', description: 'Age in years' }
        }
      });
      prompt.getPromptText = jest.fn().mockReturnValue('Extract the following fields from the data');
    });

    it('should format prompt for specific provider', () => {
      const formatted = prompt.getProviderPrompt('openai');
      expect(formatted).toHaveProperty('systemPrompt');
      expect(formatted).toHaveProperty('userPrompt');
      expect(formatted.systemPrompt).toContain('OpenAI');
    });

    it('should include field descriptions in provider prompt', () => {
      const formatted = prompt.getProviderPrompt('openai');
      expect(formatted.userPrompt).toContain('Full name');
      expect(formatted.userPrompt).toContain('Age in years');
    });

    it('should throw error for unsupported provider', () => {
      expect(() => {
        prompt.getProviderPrompt('unsupported');
      }).toThrow('Provider not supported: unsupported');
    });

    it('should validate provider configuration', () => {
      expect(() => {
        prompt.validateProvider('invalid');
      }).toThrow('Provider not supported: invalid');

      expect(() => {
        prompt.validateProvider('openai');
      }).not.toThrow();
    });
  });

  describe('data validation', () => {
    let prompt;

    beforeEach(() => {
      prompt = new BasePrompt({
        fields: {
          name: {
            type: 'string',
            description: 'Full name',
            metadata: { required: true }
          },
          age: {
            type: 'integer',
            description: 'Age in years',
            metadata: { required: true }
          },
          email: {
            type: 'string',
            description: 'Email address'
          }
        }
      });
    });

    it('should validate and convert complete data object', () => {
      const data = {
        name: 'John Doe',
        age: '25',
        email: 'john@example.com'
      };
      const { data: validatedData, confidenceScores, validationWarnings } = prompt.validateAndConvert(data);
      expect(validatedData).toEqual(expect.objectContaining({
        name: 'John Doe',
        age: 25,
        email: 'john@example.com'
      }));
      expect(confidenceScores).toBeDefined();
      expect(validationWarnings).toBeDefined();
      // Verify no keys start with underscore
      expect(Object.keys(validatedData).every(k => !k.startsWith('_'))).toBe(true);
    });

    it('should handle missing fields', () => {
      expect(() => {
        prompt.validateAndConvert({
          age: 25
        });
      }).toThrow('Name is required');

      const { data: validatedData } = prompt.validateAndConvert({
        name: 'John Doe',
        age: 25
      });
      expect(validatedData.email).toBeNull();
    });

    it('should handle invalid data', () => {
      expect(() => {
        prompt.validateAndConvert({
          name: 'John Doe',
          age: 'invalid',
          email: 'john@example.com'
        });
      }).toThrow('Cannot convert value "invalid" to integer');
    });
  });

  describe('enhanced provider integration', () => {
    let prompt;

    beforeEach(() => {
      prompt = new BasePrompt({
        fields: {
          name: { type: 'string', description: 'Full name' },
          age: { type: 'integer', description: 'Age in years' }
        }
      });
      prompt.getPromptText = jest.fn().mockReturnValue('Extract the following fields from the data');
    });

    it('should get provider-specific field formatting', () => {
      const openaiFields = prompt.getProviderFields('openai');
      expect(openaiFields).toEqual({
        name: { type: 'string', description: 'Full name', format: 'text' },
        age: { type: 'integer', description: 'Age in years', format: 'integer' }
      });

      const anthropicFields = prompt.getProviderFields('anthropic');
      expect(anthropicFields).toEqual({
        name: { type: 'string', description: 'Full name', format: 'text' },
        age: { type: 'integer', description: 'Age in years', format: 'number' }
      });
    });

    it('should format response for specific provider', () => {
      const openaiResponse = prompt.formatProviderResponse('openai', {
        name: 'John Doe',
        age: 25
      });
      expect(openaiResponse).toEqual({
        response_format: { type: 'json' },
        content: {
          name: 'John Doe',
          age: 25
        }
      });

      const anthropicResponse = prompt.formatProviderResponse('anthropic', {
        name: 'John Doe',
        age: 25
      });
      expect(anthropicResponse).toEqual({
        messages: [{
          role: 'assistant',
          content: JSON.stringify({
            name: 'John Doe',
            age: 25
          }, null, 2)
        }]
      });
    });

    it('should get provider-specific validation rules', () => {
      const openaiRules = prompt.getProviderValidationRules('openai');
      expect(openaiRules).toEqual({
        maxTokens: 2000,
        temperature: 0.7,
        responseFormat: { type: 'json' }
      });

      const anthropicRules = prompt.getProviderValidationRules('anthropic');
      expect(anthropicRules).toEqual({
        maxTokens: 2000,
        temperature: 0.7,
        format: 'json'
      });
    });

    it('should validate provider-specific response format', () => {
      // Valid OpenAI response
      expect(() => {
        prompt.validateProviderResponse('openai', {
          response_format: { type: 'json' },
          content: { name: 'John', age: 25 }
        });
      }).not.toThrow();

      // Invalid OpenAI response
      expect(() => {
        prompt.validateProviderResponse('openai', {
          content: { name: 'John', age: 25 }
        });
      }).toThrow('Invalid OpenAI response format');

      // Valid Anthropic response
      expect(() => {
        prompt.validateProviderResponse('anthropic', {
          messages: [{
            role: 'assistant',
            content: '{"name": "John", "age": 25}'
          }]
        });
      }).not.toThrow();

      // Invalid Anthropic response
      expect(() => {
        prompt.validateProviderResponse('anthropic', {
          content: '{"name": "John", "age": 25}'
        });
      }).toThrow('Invalid Anthropic response format');
    });

    it('should handle provider-specific error cases', () => {
      // Test token limit exceeded
      expect(() => {
        prompt.validateProviderResponse('openai', {
          response_format: { type: 'json' },
          content: { error: 'token_limit_exceeded' }
        });
      }).toThrow('OpenAI token limit exceeded');

      // Test invalid JSON response
      expect(() => {
        prompt.validateProviderResponse('anthropic', {
          messages: [{
            role: 'assistant',
            content: 'Invalid JSON'
          }]
        });
      }).toThrow('Invalid JSON in Anthropic response');
    });
  });

  describe('enhanced type conversion', () => {
    let prompt;

    beforeEach(() => {
      prompt = new BasePrompt({
        fields: {
          name: {
            type: 'string',
            description: 'Full name',
            metadata: {
              maxLength: 100,
              required: true,
              format: 'name'
            }
          },
          age: {
            type: 'integer',
            description: 'Age in years',
            metadata: {
              min: 0,
              max: 150,
              required: true
            }
          },
          email: {
            type: 'string',
            description: 'Email address',
            metadata: {
              format: 'email',
              required: false
            }
          },
          score: {
            type: 'float',
            description: 'Test score',
            metadata: {
              min: 0.0,
              max: 100.0,
              precision: 2
            }
          }
        }
      });
    });

    it('should validate and convert data with metadata constraints', () => {
      const validData = {
        name: 'John Doe',
        age: 25,
        email: 'john@example.com',
        score: 92.5
      };
      const { data: result } = prompt.validateAndConvert(validData);
      expect(result).toEqual(expect.objectContaining(validData));

      // Test maxLength constraint
      expect(() => {
        prompt.validateAndConvert({
          ...validData,
          name: 'a'.repeat(101)
        });
      }).toThrow('Name exceeds maximum length of 100 characters');

      // Test min/max constraints
      expect(() => {
        prompt.validateAndConvert({
          ...validData,
          age: -1
        });
      }).toThrow('Age must be between 0 and 150');

      expect(() => {
        prompt.validateAndConvert({
          ...validData,
          score: 100.001
        });
      }).toThrow('Score must be between 0 and 100');
    });

    it('should handle required fields correctly', () => {
      // Missing required field
      expect(() => {
        prompt.validateAndConvert({
          age: 25,
          email: 'john@example.com'
        });
      }).toThrow('Name is required');

      // Optional field can be omitted
      const { data: result } = prompt.validateAndConvert({
        name: 'John Doe',
        age: 25,
        score: 92.5
      });
      expect(result.email).toBeNull();
    });

    it('should validate field formats', () => {
      // Invalid email format
      expect(() => {
        prompt.validateAndConvert({
          name: 'John Doe',
          age: 25,
          email: 'invalid-email'
        });
      }).toThrow('Invalid email format');

      // Invalid name format (e.g., contains numbers)
      expect(() => {
        prompt.validateAndConvert({
          name: 'John123',
          age: 25
        });
      }).toThrow('Invalid name format');
    });

    it('should handle precision for float values', () => {
      const { data: result } = prompt.validateAndConvert({
        name: 'John Doe',
        age: 25,
        score: 92.555
      });
      expect(result.score).toBe(92.56); // Rounded to 2 decimal places
    });

    it('should provide detailed error messages', () => {
      let caughtError;
      try {
        prompt.validateAndConvert({
          name: 'a'.repeat(101),
          age: -1,
          email: 'invalid-email',
          score: 150
        });
      } catch (error) {
        caughtError = error;
      }

      expect(caughtError).toBeDefined();
      expect(caughtError.details).toBeDefined();
      expect(caughtError.details).toEqual([
        'Name exceeds maximum length of 100 characters',
        'Age must be between 0 and 150',
        'Invalid email format',
        'Score must be between 0 and 100'
      ]);
    });

    it('should handle type coercion with metadata', () => {
      const { data: result } = prompt.validateAndConvert({
        name: '  John Doe  ', // Should trim
        age: '25', // Should convert to number
        score: '92.555' // Should convert and round
      });

      expect(result).toEqual(expect.objectContaining({
        name: 'John Doe',
        age: 25,
        email: null,
        score: 92.56
      }));
    });
  });
}); 