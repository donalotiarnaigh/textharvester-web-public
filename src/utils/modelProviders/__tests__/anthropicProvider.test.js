const AnthropicProvider = require('../anthropicProvider');
const BaseVisionProvider = require('../baseProvider');

// Mock Anthropic client
jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: {
      create: jest.fn()
    }
  }));
});

describe('AnthropicProvider', () => {
  let provider;
  let mockConfig;
  let mockAnthropicResponse;

  beforeEach(() => {
    mockConfig = {
      ANTHROPIC_API_KEY: 'test-key',
      ANTHROPIC_MODEL: 'claude-4-sonnet-20250514',
      MAX_TOKENS: 4000,
      TEMPERATURE: 0.2,
      retry: { maxProviderRetries: 0 }
    };
    
    mockAnthropicResponse = {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            memorial_number: '123',
            first_name: 'John',
            last_name: 'Doe',
            year_of_death: 1923,
            inscription: 'Test inscription'
          })
        }
      ],
      usage: {
        input_tokens: 100,
        output_tokens: 50
      }
    };

    provider = new AnthropicProvider(mockConfig);
    provider.client.messages.create.mockReset();
    provider.client.messages.create.mockResolvedValue(mockAnthropicResponse);
  });

  describe('constructor', () => {
    it('should extend BaseVisionProvider', () => {
      expect(provider).toBeInstanceOf(BaseVisionProvider);
    });

    it('should initialize with provided API key', () => {
      expect(provider.client).toBeDefined();
    });

    it('should use environment variable if no API key in config', () => {
      process.env.ANTHROPIC_API_KEY = 'env-test-key';
      const envProvider = new AnthropicProvider({});
      expect(envProvider.client).toBeDefined();
      delete process.env.ANTHROPIC_API_KEY;
    });

    it('should use provided model from config', () => {
      expect(provider.model).toBe('claude-4-sonnet-20250514');
    });

    it('should use default model if not specified', () => {
      const defaultProvider = new AnthropicProvider({});
      expect(defaultProvider.model).toBe('claude-opus-4-6');
    });

    it('should use provided max tokens from config', () => {
      expect(provider.maxTokens).toBe(4000);
    });

    it('should use default max tokens if not specified', () => {
      const defaultProvider = new AnthropicProvider({});
      expect(defaultProvider.maxTokens).toBe(8000);
    });

    it('should use provided temperature from config', () => {
      expect(provider.temperature).toBe(0.2);
    });

    it('should use default temperature if not specified', () => {
      const defaultProvider = new AnthropicProvider({});
      expect(defaultProvider.temperature).toBe(0);
    });
  });

  describe('getModelVersion', () => {
    it('should return current model version', () => {
      expect(provider.getModelVersion()).toBe('claude-4-sonnet-20250514');
    });
  });

  describe('processImage', () => {
    const testImage = 'base64-image-data';
    const testPrompt = 'Test prompt';

    it('should call Anthropic API with correct parameters', async () => {
      await provider.processImage(testImage, testPrompt);
      
      expect(provider.client.messages.create).toHaveBeenCalledWith({
        model: 'claude-4-sonnet-20250514',
        max_tokens: 4000,
        temperature: 0.2,
        system: 'Return a JSON object with the extracted text details.',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: testPrompt, cache_control: { type: 'ephemeral' } },
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: 'image/jpeg',
                  data: testImage
                }
              }
            ]
          }
        ]
      });
    });

    it('should return { content, usage } with parsed JSON content', async () => {
      const result = await provider.processImage(testImage, testPrompt);
      expect(result.content).toEqual({
        memorial_number: '123',
        first_name: 'John',
        last_name: 'Doe',
        year_of_death: 1923,
        inscription: 'Test inscription'
      });
      expect(result.usage).toMatchObject({ input_tokens: 100, output_tokens: 50 });
    });

    it('should extract usage tokens from API response', async () => {
      provider.client.messages.create.mockResolvedValue({
        ...mockAnthropicResponse,
        usage: { input_tokens: 100, output_tokens: 50 }
      });
      const result = await provider.processImage(testImage, testPrompt);
      expect(result.usage).toMatchObject({ input_tokens: 100, output_tokens: 50 });
    });

    it('should default usage tokens to 0 when usage is absent', async () => {
      provider.client.messages.create.mockResolvedValue({
        ...mockAnthropicResponse,
        usage: undefined
      });
      const result = await provider.processImage(testImage, testPrompt);
      expect(result.usage).toMatchObject({ input_tokens: 0, output_tokens: 0 });
    });

    it('should extract cache tokens from API response', async () => {
      provider.client.messages.create.mockResolvedValue({
        ...mockAnthropicResponse,
        usage: {
          input_tokens: 100,
          output_tokens: 50,
          cache_creation_input_tokens: 300,
          cache_read_input_tokens: 200
        }
      });
      const result = await provider.processImage(testImage, testPrompt);
      expect(result.usage).toEqual({
        input_tokens: 100,
        output_tokens: 50,
        cache_creation_input_tokens: 300,
        cache_read_input_tokens: 200
      });
    });

    it('should default cache tokens to 0 when absent from API response', async () => {
      provider.client.messages.create.mockResolvedValue({
        ...mockAnthropicResponse,
        usage: { input_tokens: 100, output_tokens: 50 }
      });
      const result = await provider.processImage(testImage, testPrompt);
      expect(result.usage.cache_creation_input_tokens).toBe(0);
      expect(result.usage.cache_read_input_tokens).toBe(0);
    });

    it('should attach cache_control to user text content block', async () => {
      await provider.processImage(testImage, testPrompt);
      const callArgs = provider.client.messages.create.mock.calls[0][0];
      const userContent = callArgs.messages[0].content;
      const textBlock = userContent.find(b => b.type === 'text');
      expect(textBlock).toMatchObject({
        type: 'text',
        cache_control: { type: 'ephemeral' }
      });
    });

    it('should return raw response when raw option is true', async () => {
      const result = await provider.processImage(testImage, testPrompt, { raw: true });
      expect(result.content).toBe(mockAnthropicResponse.content[0].text);
      expect(result.usage).toBeDefined();
    });

    it('should handle API errors', async () => {
      const errorMessage = 'API Error';
      provider.client.messages.create.mockRejectedValue(new Error(errorMessage));
      
      await expect(provider.processImage(testImage, testPrompt))
        .rejects
        .toThrow(`Anthropic processing failed: ${errorMessage}`);
    });

    it('should handle missing text content in response', async () => {
      provider.client.messages.create.mockResolvedValue({
        content: [{ type: 'other' }]
      });
      
      await expect(provider.processImage(testImage, testPrompt))
        .rejects
        .toThrow('No text content in response');
    });

    it('should handle invalid JSON response', async () => {
      provider.client.messages.create.mockResolvedValue({
        content: [{ type: 'text', text: 'Invalid JSON' }]
      });
      
      await expect(provider.processImage(testImage, testPrompt))
        .rejects
        .toThrow('Failed to parse JSON response: Invalid JSON: Unexpected token');
    });

    it('should handle JSON response in code block', async () => {
      const jsonInCodeBlock = '```json\n{"memorial_number":"123"}\n```';
      provider.client.messages.create.mockResolvedValue({
        content: [{ type: 'text', text: jsonInCodeBlock }]
      });

      const result = await provider.processImage(testImage, testPrompt);
      expect(result.content).toEqual({ memorial_number: '123' });
    });

    describe('JSON extraction from multi-fragment responses', () => {
      it('should extract first JSON object when response contains multiple fragments', async () => {
        const multiFragmentResponse = '{"memorial_number": "456", "first_name": "Jane"} ' +
          'Some extra text {"other": "data"}';
        provider.client.messages.create.mockResolvedValue({
          content: [{ type: 'text', text: multiFragmentResponse }],
          usage: { input_tokens: 100, output_tokens: 50 }
        });

        const result = await provider.processImage(testImage, testPrompt);
        expect(result.content).toEqual({
          memorial_number: '456',
          first_name: 'Jane'
        });
      });

      it('should handle JSON with nested braces in string values', async () => {
        const nestedBracesResponse = '{"inscription": "In memory of {beloved} father"}';
        provider.client.messages.create.mockResolvedValue({
          content: [{ type: 'text', text: nestedBracesResponse }],
          usage: { input_tokens: 100, output_tokens: 50 }
        });

        const result = await provider.processImage(testImage, testPrompt);
        expect(result.content).toEqual({
          inscription: 'In memory of {beloved} father'
        });
      });

      it('should prefer code_block extraction over balanced-brace scanning', async () => {
        const codeBlockWithExtra = '```json\n{"from_block": true}\n```\n{"loose": true}';
        provider.client.messages.create.mockResolvedValue({
          content: [{ type: 'text', text: codeBlockWithExtra }],
          usage: { input_tokens: 100, output_tokens: 50 }
        });

        const result = await provider.processImage(testImage, testPrompt);
        expect(result.content).toEqual({ from_block: true });
      });

      it('should extract JSON when model first response mentions format then provides JSON', async () => {
        // This tests the scenario where a model explains something first, then provides the JSON
        const chattierResponse = 'Here is the extracted data: ' +
          '{"memorial_number": "789", "inscription": "RIP"}';
        provider.client.messages.create.mockResolvedValue({
          content: [{ type: 'text', text: chattierResponse }],
          usage: { input_tokens: 100, output_tokens: 50 }
        });

        const result = await provider.processImage(testImage, testPrompt);
        expect(result.content).toEqual({
          memorial_number: '789',
          inscription: 'RIP'
        });
      });
    });
  });

  describe('validateConfig', () => {
    it('should pass with valid configuration', () => {
      expect(provider.validateConfig()).toBe(true);
    });

    it('should throw error if client is not initialized', () => {
      provider.client = null;
      expect(() => provider.validateConfig())
        .toThrow('Anthropic client not initialized. Check API key configuration.');
    });

    it('should throw error if model is not vision-capable', () => {
      provider.model = 'gpt-4';
      expect(() => provider.validateConfig())
        .toThrow('Invalid model specified. Must be a vision-capable model.');
    });
  });

  describe('schema-constrained generation (tool-use)', () => {
    const testImage = 'base64-image-data';
    const testPrompt = 'Test prompt';
    const testSchema = {
      type: 'object',
      additionalProperties: false,
      properties: {
        first_name: { type: ['string', 'null'] }
      },
      required: ['first_name']
    };
    const toolUseResponse = {
      content: [
        {
          type: 'tool_use',
          name: 'extract',
          input: { first_name: 'John' }
        }
      ],
      usage: { input_tokens: 100, output_tokens: 50 }
    };

    it('should use plain messages.create when no jsonSchema option', async () => {
      await provider.processImage(testImage, testPrompt);
      const callArgs = provider.client.messages.create.mock.calls[0][0];
      expect(callArgs.tools).toBeUndefined();
      expect(callArgs.tool_choice).toBeUndefined();
    });

    it('should use tool-use when jsonSchema option provided', async () => {
      provider.client.messages.create.mockResolvedValue(toolUseResponse);
      await provider.processImage(testImage, testPrompt, { jsonSchema: testSchema });
      const callArgs = provider.client.messages.create.mock.calls[0][0];
      expect(callArgs.tools).toEqual([
        expect.objectContaining({
          name: 'extract',
          input_schema: testSchema
        })
      ]);
      expect(callArgs.tool_choice).toEqual({ type: 'tool', name: 'extract' });
    });

    it('should extract content from tool_use input block', async () => {
      provider.client.messages.create.mockResolvedValue(toolUseResponse);
      const result = await provider.processImage(testImage, testPrompt, { jsonSchema: testSchema });
      expect(result.content).toEqual({ first_name: 'John' });
    });

    it('should stringify tool_use input for audit log raw_response', async () => {
      const llmAuditLog = require('../../llmAuditLog');
      jest.spyOn(llmAuditLog, 'logEntry').mockResolvedValue(undefined);
      provider.client.messages.create.mockResolvedValue(toolUseResponse);
      await provider.processImage(testImage, testPrompt, { jsonSchema: testSchema, processingId: 'test-pid' });
      expect(llmAuditLog.logEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          raw_response: JSON.stringify({ first_name: 'John' })
        })
      );
      llmAuditLog.logEntry.mockRestore();
    });
  });
});