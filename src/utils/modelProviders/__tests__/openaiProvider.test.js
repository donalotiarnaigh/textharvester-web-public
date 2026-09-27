const OpenAIProvider = require('../openaiProvider');
const BaseVisionProvider = require('../baseProvider');

// Mock OpenAI client
jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: jest.fn()
      }
    }
  }));
});

describe('OpenAIProvider', () => {
  let provider;
  let mockConfig;
  let mockOpenAIResponse;

  beforeEach(() => {
    mockConfig = {
      OPENAI_API_KEY: 'test-key',
      OPENAI_MODEL: 'gpt-5.4',
      MAX_TOKENS: 4000,
      TEMPERATURE: 0.2,
      retry: { maxProviderRetries: 0 }
    };
    
    mockOpenAIResponse = {
      choices: [{
        message: {
          content: JSON.stringify({
            memorial_number: '123',
            first_name: 'John',
            last_name: 'Doe',
            year_of_death: 1923,
            inscription: 'Test inscription'
          })
        }
      }],
      usage: {
        prompt_tokens: 100,
        completion_tokens: 50,
        total_tokens: 150
      }
    };

    provider = new OpenAIProvider(mockConfig);
    provider.client.chat.completions.create.mockReset();
    provider.client.chat.completions.create.mockResolvedValue(mockOpenAIResponse);
  });

  describe('constructor', () => {
    it('should extend BaseVisionProvider', () => {
      expect(provider).toBeInstanceOf(BaseVisionProvider);
    });

    it('should initialize with provided API key', () => {
      expect(provider.client).toBeDefined();
    });

    it('should use environment variable if no API key in config', () => {
      process.env.OPENAI_API_KEY = 'env-test-key';
      const envProvider = new OpenAIProvider({});
      expect(envProvider.client).toBeDefined();
      delete process.env.OPENAI_API_KEY;
    });

    it('should use provided model from config', () => {
      expect(provider.model).toBe('gpt-5.4');
    });

    it('should use default model if not specified', () => {
      const defaultProvider = new OpenAIProvider({});
      expect(defaultProvider.model).toBe('gpt-5.4');
    });

    it('should use provided max tokens from config', () => {
      expect(provider.maxTokens).toBe(4000);
    });

    it('should use default max tokens if not specified', () => {
      const defaultProvider = new OpenAIProvider({});
      expect(defaultProvider.maxTokens).toBe(4000);
    });

    it('should use provided temperature from config', () => {
      expect(provider.temperature).toBe(0.2);
    });

    it('should use default temperature if not specified', () => {
      const defaultProvider = new OpenAIProvider({});
      expect(defaultProvider.temperature).toBe(0);
    });

    it('should read reasoningEffort from config', () => {
      const configWithReasoning = {
        ...mockConfig,
        openAI: { reasoningEffort: 'low' }
      };
      const providerWithReasoning = new OpenAIProvider(configWithReasoning);
      expect(providerWithReasoning.reasoningEffort).toBe('low');
    });

    it('should auto-detect GPT-5 models and set reasoningEffort to none', () => {
      const gpt5Config = {
        ...mockConfig,
        OPENAI_MODEL: 'gpt-5.4'
      };
      const gpt5Provider = new OpenAIProvider(gpt5Config);
      expect(gpt5Provider.reasoningEffort).toBe('none');
    });

    it('should not override explicit reasoningEffort for GPT-5 models', () => {
      const gpt5Config = {
        ...mockConfig,
        OPENAI_MODEL: 'gpt-5.4',
        openAI: { reasoningEffort: 'low' }
      };
      const gpt5Provider = new OpenAIProvider(gpt5Config);
      expect(gpt5Provider.reasoningEffort).toBe('low');
    });

    it('should not set reasoningEffort for non-GPT-5 models', () => {
      const gpt4Provider = new OpenAIProvider({ ...mockConfig, OPENAI_MODEL: 'gpt-4' });
      expect(gpt4Provider.reasoningEffort).toBeNull();
    });
  });

  describe('getModelVersion', () => {
    it('should return current model version', () => {
      expect(provider.getModelVersion()).toBe('gpt-5.4');
    });
  });

  describe('processImage', () => {
    const testImage = 'base64-image-data';
    const testPrompt = 'Test prompt';

    it('should call OpenAI API with correct parameters', async () => {
      await provider.processImage(testImage, testPrompt);
      
      expect(provider.client.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-5.4',
          response_format: { type: 'json_object' },
          max_completion_tokens: 4000,
          temperature: 0.2,
          reasoning_effort: 'none'
        })
      );
    });

    it('should include reasoning_effort parameter for GPT-5.1 model', async () => {
      const gpt5Config = {
        ...mockConfig,
        OPENAI_MODEL: 'gpt-5.4'
      };
      const gpt5Provider = new OpenAIProvider(gpt5Config);
      gpt5Provider.client.chat.completions.create.mockResolvedValue(mockOpenAIResponse);
      
      await gpt5Provider.processImage(testImage, testPrompt);
      
      expect(gpt5Provider.client.chat.completions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gpt-5.4',
          reasoning_effort: 'none'
        })
      );
    });

    it('should not include reasoning_effort parameter for non-GPT-5 models', async () => {
      const gpt4Provider = new OpenAIProvider({ ...mockConfig, OPENAI_MODEL: 'gpt-4' });
      gpt4Provider.client.chat.completions.create.mockResolvedValue(mockOpenAIResponse);
      await gpt4Provider.processImage(testImage, testPrompt);

      const callArgs = gpt4Provider.client.chat.completions.create.mock.calls[0][0];
      expect(callArgs.reasoning_effort).toBeUndefined();
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
      provider.client.chat.completions.create.mockResolvedValue({
        ...mockOpenAIResponse,
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 }
      });
      const result = await provider.processImage(testImage, testPrompt);
      expect(result.usage).toMatchObject({ input_tokens: 100, output_tokens: 50 });
    });

    it('should default usage tokens to 0 when usage is absent', async () => {
      provider.client.chat.completions.create.mockResolvedValue({
        ...mockOpenAIResponse,
        usage: undefined
      });
      const result = await provider.processImage(testImage, testPrompt);
      expect(result.usage).toMatchObject({ input_tokens: 0, output_tokens: 0 });
    });

    it('should extract cached_tokens from prompt_tokens_details as cache_read_input_tokens', async () => {
      provider.client.chat.completions.create.mockResolvedValue({
        ...mockOpenAIResponse,
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
          prompt_tokens_details: { cached_tokens: 80 }
        }
      });
      const result = await provider.processImage(testImage, testPrompt);
      expect(result.usage.cache_read_input_tokens).toBe(80);
    });

    it('should default cache_read_input_tokens to 0 when prompt_tokens_details absent', async () => {
      provider.client.chat.completions.create.mockResolvedValue({
        ...mockOpenAIResponse,
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 }
      });
      const result = await provider.processImage(testImage, testPrompt);
      expect(result.usage.cache_read_input_tokens).toBe(0);
    });

    it('should return raw response when raw option is true', async () => {
      const result = await provider.processImage(testImage, testPrompt, { raw: true });
      expect(result.content).toBe(mockOpenAIResponse.choices[0].message.content);
      expect(result.usage).toBeDefined();
    });

    it('should handle API errors', async () => {
      const errorMessage = 'API Error';
      provider.client.chat.completions.create.mockRejectedValue(new Error(errorMessage));
      
      await expect(provider.processImage(testImage, testPrompt))
        .rejects
        .toThrow(`OpenAI processing failed: ${errorMessage}`);
    });

    it('should handle invalid JSON response', async () => {
      provider.client.chat.completions.create.mockResolvedValue({
        choices: [{
          message: {
            content: 'Invalid JSON'
          }
        }]
      });
      
      await expect(provider.processImage(testImage, testPrompt))
        .rejects
        .toThrow('OpenAI processing failed: Unexpected token');
    });
  });

  describe('validateConfig', () => {
    it('should pass with valid configuration', () => {
      expect(provider.validateConfig()).toBe(true);
    });

    it('should throw error if client is not initialized', () => {
      provider.client = null;
      expect(() => provider.validateConfig())
        .toThrow('OpenAI client not initialized. Check API key configuration.');
    });

    it('should accept GPT-4 models', () => {
      provider.model = 'gpt-4';
      expect(provider.validateConfig()).toBe(true);
    });

    it('should accept GPT-5 models', () => {
      provider.model = 'gpt-5.4';
      expect(provider.validateConfig()).toBe(true);
    });

    it('should accept GPT-5.4 models', () => {
      provider.model = 'gpt-5.4';
      expect(provider.validateConfig()).toBe(true);
    });

    it('should throw error if model is not vision-capable', () => {
      provider.model = 'gpt-3.5-turbo';
      expect(() => provider.validateConfig())
        .toThrow('Invalid model specified. Must be a vision-capable model');
    });
  });

  describe('schema-constrained generation', () => {
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

    it('should use json_object response_format when no jsonSchema option', async () => {
      await provider.processImage(testImage, testPrompt);
      const callArgs = provider.client.chat.completions.create.mock.calls[0][0];
      expect(callArgs.response_format).toEqual({ type: 'json_object' });
    });

    it('should use json_schema response_format when jsonSchema option provided', async () => {
      await provider.processImage(testImage, testPrompt, { jsonSchema: testSchema });
      const callArgs = provider.client.chat.completions.create.mock.calls[0][0];
      expect(callArgs.response_format).toEqual({
        type: 'json_schema',
        json_schema: {
          name: 'extraction',
          strict: true,
          schema: testSchema
        }
      });
    });
  });
}); 