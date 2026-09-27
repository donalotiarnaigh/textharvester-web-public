const MistralProvider = require('../mistralProvider');
const BaseVisionProvider = require('../baseProvider');

// Mock the Mistral SDK
jest.mock('@mistralai/mistralai', () => {
  return {
    Mistral: jest.fn().mockImplementation(() => ({
      ocr: { process: jest.fn() },
      chat: { complete: jest.fn() }
    }))
  };
});

jest.mock('../../llmAuditLog', () => ({
  logEntry: jest.fn().mockResolvedValue(undefined)
}));

jest.mock('../../performanceTracker', () => ({
  trackAPICall: jest.fn().mockImplementation((_p, _m, _o, fn) => fn())
}));

const llmAuditLog = require('../../llmAuditLog');

describe('MistralProvider', () => {
  let provider;
  let mockConfig;
  let mockOcrProcess;
  let mockChatComplete;
  const testBase64 = 'base64imagecontent';
  const testPrompt = 'Extract this memorial';
  const mockOcrResponse = {
    pages: [{ markdown: 'JOHN SMITH\nDied 1923' }],
    model: 'mistral-ocr-latest',
    usageInfo: { pagesProcessed: 1 }
  };
  const mockChatResponse = {
    choices: [{
      message: {
        content: JSON.stringify({
          first_name: 'John',
          last_name: 'Smith',
          year_of_death: 1923
        })
      }
    }],
    usage: { promptTokens: 150, completionTokens: 40 }
  };

  beforeEach(() => {
    jest.clearAllMocks();

    mockConfig = {
      MISTRAL_API_KEY: 'test-key',
      mistral: {
        ocrModel: 'mistral-ocr-latest',
        chatModel: 'mistral-large-latest',
        maxTokens: 8000
      },
      retry: { maxProviderRetries: 0 }
    };

    const { Mistral } = require('@mistralai/mistralai');
    mockOcrProcess = jest.fn().mockResolvedValue(mockOcrResponse);
    mockChatComplete = jest.fn().mockResolvedValue(mockChatResponse);
    Mistral.mockImplementation(() => ({
      ocr: { process: mockOcrProcess },
      chat: { complete: mockChatComplete }
    }));

    provider = new MistralProvider(mockConfig);
  });

  describe('constructor', () => {
    it('should extend BaseVisionProvider', () => {
      expect(provider).toBeInstanceOf(BaseVisionProvider);
    });

    it('should initialise ocrModel from config', () => {
      expect(provider.ocrModel).toBe('mistral-ocr-latest');
    });

    it('should initialise chatModel from config', () => {
      expect(provider.chatModel).toBe('mistral-large-latest');
    });

    it('should fall back to default models when config omitted', () => {
      const { Mistral } = require('@mistralai/mistralai');
      Mistral.mockImplementation(() => ({ ocr: { process: jest.fn() }, chat: { complete: jest.fn() } }));
      const p = new MistralProvider({});
      expect(p.ocrModel).toBe('mistral-ocr-latest');
      expect(p.chatModel).toBe('mistral-large-latest');
    });

    it('should use MISTRAL_API_KEY env var when not in config', () => {
      process.env.MISTRAL_API_KEY = 'env-key';
      const { Mistral } = require('@mistralai/mistralai');
      Mistral.mockImplementation(() => ({ ocr: { process: jest.fn() }, chat: { complete: jest.fn() } }));
      const p = new MistralProvider({});
      expect(p.apiKey).toBe('env-key');
      delete process.env.MISTRAL_API_KEY;
    });

    it('should use maxTokens from config', () => {
      expect(provider.maxTokens).toBe(8000);
    });

    it('should default maxTokens to 8000 when not specified', () => {
      const { Mistral } = require('@mistralai/mistralai');
      Mistral.mockImplementation(() => ({ ocr: { process: jest.fn() }, chat: { complete: jest.fn() } }));
      const p = new MistralProvider({});
      expect(p.maxTokens).toBe(8000);
    });
  });

  describe('getModelVersion', () => {
    it('should return the chatModel string', () => {
      expect(provider.getModelVersion()).toBe('mistral-large-latest');
    });
  });

  describe('validateConfig', () => {
    it('should return true when API key is present', () => {
      expect(provider.validateConfig()).toBe(true);
    });

    it('should throw FatalError when API key is absent', () => {
      const { Mistral } = require('@mistralai/mistralai');
      Mistral.mockImplementation(() => ({ ocr: { process: jest.fn() }, chat: { complete: jest.fn() } }));
      const p = new MistralProvider({});
      p.apiKey = null;
      expect(() => p.validateConfig()).toThrow('Mistral API key not configured');
    });
  });

  describe('processImage', () => {
    it('should call ocr.process with base64 data URI', async () => {
      await provider.processImage(testBase64, testPrompt);
      expect(mockOcrProcess).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'mistral-ocr-latest',
          document: {
            type: 'image_url',
            imageUrl: `data:image/jpeg;base64,${testBase64}`
          }
        })
      );
    });

    it('should call chat.complete with OCR markdown appended to prompt', async () => {
      await provider.processImage(testBase64, testPrompt);
      expect(mockChatComplete).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'mistral-large-latest',
          messages: expect.arrayContaining([
            expect.objectContaining({ role: 'user', content: expect.stringContaining('JOHN SMITH') })
          ])
        })
      );
    });

    it('should return { content, usage } with parsed JSON and normalised tokens', async () => {
      const result = await provider.processImage(testBase64, testPrompt);
      expect(result).toEqual({
        content: { first_name: 'John', last_name: 'Smith', year_of_death: 1923 },
        usage: { input_tokens: 150, output_tokens: 40, pages_processed: 1 }
      });
    });

    it('should return raw OCR markdown when options.raw is true', async () => {
      const result = await provider.processImage(testBase64, testPrompt, { raw: true });
      expect(result.content).toContain('JOHN SMITH');
      expect(result.usage).toBeDefined();
    });

    it('should use promptTemplate.getProviderPrompt when provided', async () => {
      const mockTemplate = {
        getProviderPrompt: jest.fn().mockReturnValue({
          systemPrompt: 'Template system prompt',
          userPrompt: 'Template user prompt'
        })
      };
      await provider.processImage(testBase64, testPrompt, { promptTemplate: mockTemplate });
      expect(mockTemplate.getProviderPrompt).toHaveBeenCalledWith('mistral');
      expect(mockChatComplete).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: expect.arrayContaining([
            { role: 'system', content: 'Template system prompt' }
          ])
        })
      );
    });

    it('should default usage tokens to 0 when usage is absent from chat response', async () => {
      mockChatComplete.mockResolvedValue({
        choices: [{ message: { content: JSON.stringify({ test: 'ok' }) } }],
        usage: undefined
      });
      const result = await provider.processImage(testBase64, testPrompt);
      expect(result.usage.input_tokens).toBe(0);
      expect(result.usage.output_tokens).toBe(0);
    });

    it('should call llmAuditLog.logEntry with status success when processingId is set', async () => {
      await provider.processImage(testBase64, testPrompt, { processingId: 'pid-123' });
      expect(llmAuditLog.logEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          processing_id: 'pid-123',
          provider: 'mistral',
          status: 'success'
        })
      );
    });

    it('should call llmAuditLog.logEntry with status error on failure', async () => {
      mockChatComplete.mockRejectedValue(new Error('API down'));
      await expect(provider.processImage(testBase64, testPrompt, { processingId: 'pid-err' })).rejects.toThrow();
      expect(llmAuditLog.logEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          processing_id: 'pid-err',
          status: 'error',
          error_message: 'API down'
        })
      );
    });

    it('should throw when chat.complete fails', async () => {
      mockChatComplete.mockRejectedValue(new Error('Chat failed'));
      await expect(provider.processImage(testBase64, testPrompt)).rejects.toThrow('Mistral processing failed: Chat failed');
    });

    it('should throw when ocr.process fails', async () => {
      mockOcrProcess.mockRejectedValue(new Error('OCR failed'));
      await expect(provider.processImage(testBase64, testPrompt)).rejects.toThrow('Mistral processing failed: OCR failed');
    });

    it('should handle multi-page OCR by joining page markdown', async () => {
      mockOcrProcess.mockResolvedValue({
        pages: [
          { markdown: 'Page one content' },
          { markdown: 'Page two content' }
        ],
        model: 'mistral-ocr-latest',
        usageInfo: { pagesProcessed: 2 }
      });
      await provider.processImage(testBase64, testPrompt);
      const chatCall = mockChatComplete.mock.calls[0][0];
      const userMsg = chatCall.messages.find(m => m.role === 'user');
      expect(userMsg.content).toContain('Page one content');
      expect(userMsg.content).toContain('Page two content');
    });

    it('should report pages_processed from OCR usageInfo', async () => {
      mockOcrProcess.mockResolvedValue({
        pages: [{ markdown: 'p1' }, { markdown: 'p2' }],
        model: 'mistral-ocr-latest',
        usageInfo: { pagesProcessed: 2 }
      });
      const result = await provider.processImage(testBase64, testPrompt);
      expect(result.usage.pages_processed).toBe(2);
    });

    it('should throw FatalError on auth errors', async () => {
      const authError = new Error('Unauthorized');
      authError.statusCode = 401;
      mockChatComplete.mockRejectedValue(authError);
      await expect(provider.processImage(testBase64, testPrompt)).rejects.toMatchObject({
        type: 'auth_error'
      });
    });
  });
});
