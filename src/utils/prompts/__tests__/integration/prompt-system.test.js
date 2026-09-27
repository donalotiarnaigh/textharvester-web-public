const BasePrompt = require('../../BasePrompt');

class TestPrompt extends BasePrompt {
  getPromptText() {
    return 'Test prompt text';
  }
}

describe('Prompt System Integration', () => {
  describe('Real-world Memorial Data Handling', () => {
    let prompt;

    beforeEach(() => {
      prompt = new TestPrompt({
        fields: {
          memorial_number: {
            type: 'string',
            description: 'Memorial identifier',
            metadata: {
              required: true,
              maxLength: 10
            }
          },
          first_name: {
            type: 'string',
            description: 'First name',
            metadata: {
              required: true,
              maxLength: 50,
              format: 'name'
            }
          },
          last_name: {
            type: 'string',
            description: 'Last name',
            metadata: {
              required: true,
              maxLength: 50,
              format: 'name'
            }
          },
          year_of_death: {
            type: 'integer',
            description: 'Year of death',
            metadata: {
              required: true,
              min: 1500,
              max: new Date().getFullYear()
            }
          },
          inscription: {
            type: 'string',
            description: 'Full inscription text',
            metadata: {
              maxLength: 2000
            }
          }
        }
      });
    });

    it('should handle real-world memorial data with mixed formats', () => {
      const realWorldData = {
        memorial_number: ' HG-123 ',
        first_name: 'JOHN',
        last_name: 'SMITH',
        year_of_death: '1900',
        inscription: 'IN LOVING MEMORY OF JOHN SMITH WHO DIED 1ST JANUARY 1900 AGED 70 YEARS R. I. P.'
      };

      const { data: result } = prompt.validateAndConvert(realWorldData);
      expect(result.memorial_number).toBe('HG-123');
      expect(result.first_name).toBe('JOHN');
      expect(result.last_name).toBe('SMITH');
      expect(result.year_of_death).toBe(1900);
      expect(result.inscription).toBe('IN LOVING MEMORY OF JOHN SMITH WHO DIED 1ST JANUARY 1900 AGED 70 YEARS R. I. P.');
    });

    it('should handle common OCR errors and formatting issues', () => {
      const ocrData = {
        memorial_number: 'HG124',
        first_name: 'JANE',
        last_name: 'SMITH',
        year_of_death: 1900,
        inscription: 'IN LOVING MEMORY'
      };

      const { data: result } = prompt.validateAndConvert(ocrData);
      expect(result.memorial_number).toBe('HG124');
      expect(result.first_name).toBe('JANE');
      expect(result.last_name).toBe('SMITH');
      expect(result.year_of_death).toBe(1900);
      expect(result.inscription).toBe('IN LOVING MEMORY');
    });

    it('should handle incomplete data with required fields', () => {
      const incompleteData = {
        memorial_number: 'HG125',
        first_name: 'John',
        last_name: 'Smith',
        // year_of_death is missing but required
        inscription: 'Partial inscription'
      };

      expect(() => {
        prompt.validateAndConvert(incompleteData);
      }).toThrow('Year_of_death is required');
    });

    it('should validate field formats strictly', () => {
      expect(() => {
        prompt.validateAndConvert({
          memorial_number: 'HG126',
          first_name: 'John123', // Invalid name format
          last_name: 'Smith',
          year_of_death: 1923
        });
      }).toThrow('Invalid name format');
    });

    it('should handle provider-specific formatting', () => {
      const data = {
        memorial_number: 'HG126',
        first_name: 'William',
        last_name: 'Jones',
        year_of_death: 1924,
        inscription: 'Test inscription'
      };

      // OpenAI format
      const openaiResult = prompt.formatProviderResponse('openai', data);
      expect(openaiResult).toHaveProperty('response_format.type', 'json');
      expect(openaiResult.content).toMatchObject(data);

      // Anthropic format
      const anthropicResult = prompt.formatProviderResponse('anthropic', data);
      expect(anthropicResult.messages[0].role).toBe('assistant');
      const parsedContent = JSON.parse(anthropicResult.messages[0].content);
      expect(parsedContent).toMatchObject(data);
    });

    it('should handle metadata validation', () => {
      const data = {
        memorial_number: 'HG127',
        first_name: 'a'.repeat(51), // Exceeds maxLength
        last_name: 'Brown',
        year_of_death: 1923,
        inscription: 'Test'
      };

      expect(() => {
        prompt.validateAndConvert(data);
      }).toThrow('First_name exceeds maximum length of 50 characters');

      const futureData = {
        memorial_number: 'HG127',
        first_name: 'James',
        last_name: 'Brown',
        year_of_death: new Date().getFullYear() + 1,
        inscription: 'Test'
      };

      expect(() => {
        prompt.validateAndConvert(futureData);
      }).toThrow(`Year_of_death must be between 1500 and ${new Date().getFullYear()}`);
    });
  });

  describe('Provider Integration', () => {
    let prompt;

    beforeEach(() => {
      prompt = new TestPrompt({
        fields: {
          text: {
            type: 'string',
            description: 'Input text',
            metadata: {
              required: true,
              maxLength: 1000
            }
          },
          sentiment: {
            type: 'string',
            description: 'Sentiment analysis'
          },
          confidence: {
            type: 'float',
            description: 'Confidence score',
            metadata: {
              min: 0.0,
              max: 1.0,
              precision: 2
            }
          }
        }
      });
    });

    it('should format prompts correctly for each provider', () => {
      const openaiPrompt = prompt.getProviderPrompt('openai');
      expect(openaiPrompt.systemPrompt).toContain('OpenAI');
      expect(openaiPrompt.userPrompt).toContain('Test prompt text');

      const anthropicPrompt = prompt.getProviderPrompt('anthropic');
      expect(anthropicPrompt.userPrompt).toContain('Test prompt text');
    });

    it('should validate provider-specific responses', () => {
      const validOpenAIResponse = {
        response_format: { type: 'json' },
        content: {
          text: 'Sample text',
          sentiment: 'positive',
          confidence: 0.95
        }
      };
      expect(() => {
        prompt.validateProviderResponse('openai', validOpenAIResponse);
      }).not.toThrow();

      const validAnthropicResponse = {
        messages: [{
          role: 'assistant',
          content: JSON.stringify({
            text: 'Sample text',
            sentiment: 'negative',
            confidence: 0.85
          })
        }]
      };
      expect(() => {
        prompt.validateProviderResponse('anthropic', validAnthropicResponse);
      }).not.toThrow();
    });

    it('should handle provider-specific error cases', () => {
      // OpenAI token limit error
      expect(() => {
        prompt.validateProviderResponse('openai', {
          response_format: { type: 'json' },
          content: { error: 'token_limit_exceeded' }
        });
      }).toThrow('OpenAI token limit exceeded');

      // Anthropic invalid JSON
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
}); 