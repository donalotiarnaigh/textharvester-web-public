const GeminiProvider = require('../geminiProvider');
const BaseVisionProvider = require('../baseProvider');

// Mock Google Generative AI SDK
jest.mock('@google/generative-ai', () => {
  return {
    GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
      getGenerativeModel: jest.fn()
    }))
  };
});

describe('GeminiProvider', () => {
  let provider;
  let mockConfig;
  let mockGeminiResponse;
  let mockModel;

  beforeEach(() => {
    mockConfig = {
      GEMINI_API_KEY: 'test-key',
      gemini: {
        model: 'gemini-3.1-pro',
        maxTokens: 8000
      },
      retry: { maxProviderRetries: 0 }
    };

    mockGeminiResponse = {
      response: {
        text: () => JSON.stringify({
          memorial_number: '123',
          first_name: 'John',
          last_name: 'Doe',
          year_of_death: 1923,
          inscription: 'Test inscription'
        }),
        usageMetadata: {
          promptTokenCount: 100,
          candidatesTokenCount: 50
        }
      }
    };

    // Create mock model with generateContent
    mockModel = {
      generateContent: jest.fn().mockResolvedValue(mockGeminiResponse)
    };

    // Mock GoogleGenerativeAI
    const { GoogleGenerativeAI } = require('@google/generative-ai');
    GoogleGenerativeAI.mockImplementation(() => ({
      getGenerativeModel: jest.fn().mockReturnValue(mockModel)
    }));

    provider = new GeminiProvider(mockConfig);
  });

  describe('constructor', () => {
    it('should extend BaseVisionProvider', () => {
      expect(provider).toBeInstanceOf(BaseVisionProvider);
    });

    it('should initialize with provided API key', () => {
      expect(provider.client).toBeDefined();
    });

    it('should use environment variable if no API key in config', () => {
      process.env.GEMINI_API_KEY = 'env-test-key';
      const envProvider = new GeminiProvider({});
      expect(envProvider.client).toBeDefined();
      delete process.env.GEMINI_API_KEY;
    });

    it('should use provided model from config', () => {
      expect(provider.model).toBe('gemini-3.1-pro');
    });

    it('should use default model if not specified', () => {
      const defaultProvider = new GeminiProvider({});
      expect(defaultProvider.model).toBe('gemini-3.1-pro');
    });

    it('should use provided max tokens from config', () => {
      expect(provider.maxTokens).toBe(8000);
    });

    it('should use default max tokens if not specified', () => {
      const defaultProvider = new GeminiProvider({});
      expect(defaultProvider.maxTokens).toBe(8000);
    });
  });

  describe('getModelVersion', () => {
    it('should return current model version', () => {
      expect(provider.getModelVersion()).toBe('gemini-3.1-pro');
    });
  });

  describe('processImage', () => {
    const testImage = 'base64-image-data';
    const testPrompt = 'Test prompt';

    it('should call Gemini API with correct parameters', async () => {
      await provider.processImage(testImage, testPrompt);

      expect(mockModel.generateContent).toHaveBeenCalled();
      const callArgs = mockModel.generateContent.mock.calls[0][0];
      expect(callArgs).toContainEqual({ text: testPrompt });
      expect(callArgs).toContainEqual({
        inlineData: {
          data: testImage,
          mimeType: 'image/jpeg'
        }
      });
    });

    it('should call getGenerativeModel with correct config', async () => {
      const gmock = provider.client.getGenerativeModel;
      await provider.processImage(testImage, testPrompt);

      expect(gmock).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'gemini-3.1-pro',
          generationConfig: expect.objectContaining({
            responseMimeType: 'application/json',
            maxOutputTokens: 8000
          })
        })
      );
    });

    it('should return { content, usage } with parsed JSON content', async () => {
      const result = await provider.processImage(testImage, testPrompt);
      expect(result).toEqual({
        content: {
          memorial_number: '123',
          first_name: 'John',
          last_name: 'Doe',
          year_of_death: 1923,
          inscription: 'Test inscription'
        },
        usage: { input_tokens: 100, output_tokens: 50 }
      });
    });

    it('should extract usage tokens from API response', async () => {
      mockModel.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify({ test: 'data' }),
          usageMetadata: {
            promptTokenCount: 200,
            candidatesTokenCount: 75
          }
        }
      });
      const result = await provider.processImage(testImage, testPrompt);
      expect(result.usage).toEqual({ input_tokens: 200, output_tokens: 75 });
    });

    it('should default usage tokens to 0 when usage is absent', async () => {
      mockModel.generateContent.mockResolvedValue({
        response: {
          text: () => JSON.stringify({ test: 'data' }),
          usageMetadata: undefined
        }
      });
      const result = await provider.processImage(testImage, testPrompt);
      expect(result.usage).toEqual({ input_tokens: 0, output_tokens: 0 });
    });

    it('should return raw response when raw option is true', async () => {
      const rawText = JSON.stringify({ test: 'data' });
      mockModel.generateContent.mockResolvedValue({
        response: {
          text: () => rawText,
          usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50 }
        }
      });
      const result = await provider.processImage(testImage, testPrompt, { raw: true });
      expect(result.content).toBe(rawText);
      expect(result.usage).toBeDefined();
    });

    it('should handle API errors', async () => {
      const errorMessage = 'API Error';
      mockModel.generateContent.mockRejectedValue(new Error(errorMessage));

      await expect(provider.processImage(testImage, testPrompt))
        .rejects
        .toThrow(`Gemini processing failed: ${errorMessage}`);
    });

    it('should handle missing text content in response', async () => {
      mockModel.generateContent.mockResolvedValue({
        response: {
          text: () => null,
          usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50 }
        }
      });

      await expect(provider.processImage(testImage, testPrompt))
        .rejects
        .toThrow('No text content in response');
    });

    it('should handle invalid JSON response', async () => {
      mockModel.generateContent.mockResolvedValue({
        response: {
          text: () => 'Invalid JSON',
          usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50 }
        }
      });

      await expect(provider.processImage(testImage, testPrompt))
        .rejects
        .toThrow('Failed to parse JSON response');
    });

    it('should handle JSON response in code block', async () => {
      const jsonInCodeBlock = '```json\n{"memorial_number":"123"}\n```';
      mockModel.generateContent.mockResolvedValue({
        response: {
          text: () => jsonInCodeBlock,
          usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50 }
        }
      });

      const result = await provider.processImage(testImage, testPrompt);
      expect(result.content).toEqual({ memorial_number: '123' });
    });

    it('should handle object prompt format', async () => {
      const objectPrompt = {
        systemPrompt: 'You are helpful',
        userPrompt: 'Extract data'
      };
      await provider.processImage(testImage, objectPrompt);

      const callArgs = mockModel.generateContent.mock.calls[0][0];
      expect(callArgs).toContainEqual({ text: 'Extract data' });
    });

    describe('JSON extraction from multi-fragment responses', () => {
      it('should extract first JSON object when response contains multiple fragments', async () => {
        const multiFragmentResponse = '{"memorial_number": "456", "first_name": "Jane"} ' +
          'Some extra text {"other": "data"}';
        mockModel.generateContent.mockResolvedValue({
          response: {
            text: () => multiFragmentResponse,
            usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50 }
          }
        });

        const result = await provider.processImage(testImage, testPrompt);
        expect(result.content).toEqual({
          memorial_number: '456',
          first_name: 'Jane'
        });
      });

      it('should handle JSON with nested braces in string values', async () => {
        const nestedBracesResponse = '{"inscription": "In memory of {beloved} father"}';
        mockModel.generateContent.mockResolvedValue({
          response: {
            text: () => nestedBracesResponse,
            usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50 }
          }
        });

        const result = await provider.processImage(testImage, testPrompt);
        expect(result.content).toEqual({
          inscription: 'In memory of {beloved} father'
        });
      });

      it('should prefer code_block extraction over balanced-brace scanning', async () => {
        const codeBlockWithExtra = '```json\n{"from_block": true}\n```\n{"loose": true}';
        mockModel.generateContent.mockResolvedValue({
          response: {
            text: () => codeBlockWithExtra,
            usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50 }
          }
        });

        const result = await provider.processImage(testImage, testPrompt);
        expect(result.content).toEqual({ from_block: true });
      });

      it('should extract JSON when model first response mentions format then provides JSON', async () => {
        // This tests the scenario where a model explains something first, then provides the JSON
        const chattierResponse = 'Here is the extracted data: ' +
          '{"memorial_number": "789", "inscription": "RIP"}';
        mockModel.generateContent.mockResolvedValue({
          response: {
            text: () => chattierResponse,
            usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 50 }
          }
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

    it('should throw error if API key is missing', () => {
      provider.apiKey = null;
      provider.client = null;
      expect(() => provider.validateConfig())
        .toThrow('Gemini API key not configured');
    });

    it('should throw error if model does not contain "gemini"', () => {
      provider.model = 'gpt-4';
      expect(() => provider.validateConfig())
        .toThrow('Invalid model specified. Must be a Gemini model.');
    });
  });

  describe('schema-constrained generation', () => {
    const testImage = 'base64-image-data';
    const testPrompt = 'Test prompt';
    const testSchema = {
      type: 'object',
      properties: {
        first_name: { type: 'string' }
      },
      required: ['first_name']
    };

    it('should not include responseSchema when no jsonSchema option', async () => {
      const gmock = provider.client.getGenerativeModel;
      await provider.processImage(testImage, testPrompt);
      const callArgs = gmock.mock.calls[0][0];
      expect(callArgs.generationConfig.responseSchema).toBeUndefined();
    });

    it('should include responseSchema when jsonSchema option provided', async () => {
      const gmock = provider.client.getGenerativeModel;
      await provider.processImage(testImage, testPrompt, { jsonSchema: testSchema });
      const callArgs = gmock.mock.calls[0][0];
      expect(callArgs.generationConfig.responseSchema).toEqual(testSchema);
    });

    it('should strip additionalProperties from responseSchema before sending to Gemini', async () => {
      const schemaWithExtras = {
        type: 'object',
        additionalProperties: false,
        properties: {
          name: {
            type: 'object',
            additionalProperties: false,
            properties: { value: { type: 'string' } }
          }
        }
      };
      const gmock = provider.client.getGenerativeModel;
      await provider.processImage(testImage, testPrompt, { jsonSchema: schemaWithExtras });
      const callArgs = gmock.mock.calls[0][0];
      const sent = callArgs.generationConfig.responseSchema;
      expect(sent.additionalProperties).toBeUndefined();
      expect(sent.properties.name.additionalProperties).toBeUndefined();
      expect(sent.type).toBe('object');
    });
  });
});
