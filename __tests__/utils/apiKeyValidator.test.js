/**
 * @jest-environment node
 */

const {
  validateApiKeys,
  getProviderStatus,
  logValidationResults,
} = require('../../src/utils/apiKeyValidator');

describe('apiKeyValidator', () => {
  const originalEnv = process.env;
  let mockLogger;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.GEMINI_API_KEY;
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('validateApiKeys', () => {
    it('should return openai true when OPENAI_API_KEY is set', () => {
      process.env.OPENAI_API_KEY = 'sk-test-key';
      const result = validateApiKeys();
      expect(result.openai).toBe(true);
    });

    it('should return anthropic true when ANTHROPIC_API_KEY is set', () => {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key';
      const result = validateApiKeys();
      expect(result.anthropic).toBe(true);
    });

    it('should return gemini true when GEMINI_API_KEY is set', () => {
      process.env.GEMINI_API_KEY = 'AIza-test-key';
      const result = validateApiKeys();
      expect(result.gemini).toBe(true);
    });

    it('should return all false when no keys are set', () => {
      const result = validateApiKeys();
      expect(result).toEqual({ openai: false, anthropic: false, gemini: false });
    });

    it('should return mixed results when only some keys are set', () => {
      process.env.OPENAI_API_KEY = 'sk-test-key';
      process.env.GEMINI_API_KEY = 'AIza-test-key';
      const result = validateApiKeys();
      expect(result).toEqual({ openai: true, anthropic: false, gemini: true });
    });

    it('should treat empty string as not configured', () => {
      process.env.OPENAI_API_KEY = '';
      const result = validateApiKeys();
      expect(result.openai).toBe(false);
    });

    it('should treat whitespace-only string as not configured', () => {
      process.env.OPENAI_API_KEY = '   ';
      const result = validateApiKeys();
      expect(result.openai).toBe(false);
    });
  });

  describe('getProviderStatus', () => {
    it('should return objects with available, name, and keyCreationUrl fields', () => {
      const status = getProviderStatus();
      for (const provider of ['openai', 'anthropic', 'gemini']) {
        expect(status[provider]).toHaveProperty('available');
        expect(status[provider]).toHaveProperty('name');
        expect(status[provider]).toHaveProperty('keyCreationUrl');
        expect(typeof status[provider].available).toBe('boolean');
        expect(typeof status[provider].name).toBe('string');
        expect(typeof status[provider].keyCreationUrl).toBe('string');
      }
    });

    it('should mark provider as available when key is set', () => {
      process.env.OPENAI_API_KEY = 'sk-test-key';
      const status = getProviderStatus();
      expect(status.openai.available).toBe(true);
      expect(status.anthropic.available).toBe(false);
    });

    it('should include correct provider display names', () => {
      const status = getProviderStatus();
      expect(status.openai.name).toMatch(/OpenAI/);
      expect(status.anthropic.name).toMatch(/Anthropic/);
      expect(status.gemini.name).toMatch(/Gemini/);
    });

    it('should include key creation URLs for each provider', () => {
      const status = getProviderStatus();
      expect(status.openai.keyCreationUrl).toContain('openai.com');
      expect(status.anthropic.keyCreationUrl).toContain('anthropic.com');
      expect(status.gemini.keyCreationUrl).toContain('google');
    });

    it('should not expose actual API key values', () => {
      process.env.OPENAI_API_KEY = 'sk-secret-key-12345';
      const status = getProviderStatus();
      const serialized = JSON.stringify(status);
      expect(serialized).not.toContain('sk-secret-key-12345');
    });
  });

  describe('logValidationResults', () => {
    it('should log warnings for each missing API key with env var name and URL', () => {
      const status = { openai: false, anthropic: false, gemini: true };
      logValidationResults(status, mockLogger);

      expect(mockLogger.warn).toHaveBeenCalledTimes(2);
      const warnCalls = mockLogger.warn.mock.calls.map(c => c[0]);
      expect(warnCalls.some(msg => msg.includes('OPENAI_API_KEY'))).toBe(true);
      expect(warnCalls.some(msg => msg.includes('ANTHROPIC_API_KEY'))).toBe(true);
    });

    it('should log error when NO keys are configured', () => {
      const status = { openai: false, anthropic: false, gemini: false };
      logValidationResults(status, mockLogger);

      expect(mockLogger.error).toHaveBeenCalledTimes(1);
      const errorMsg = mockLogger.error.mock.calls[0][0];
      expect(errorMsg).toMatch(/no api keys/i);
    });

    it('should not log error when at least one key is configured', () => {
      const status = { openai: true, anthropic: false, gemini: false };
      logValidationResults(status, mockLogger);

      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    it('should log info for configured providers', () => {
      const status = { openai: true, anthropic: true, gemini: true };
      logValidationResults(status, mockLogger);

      expect(mockLogger.warn).not.toHaveBeenCalled();
      expect(mockLogger.error).not.toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalled();
    });

    it('should include key creation URLs in warning messages', () => {
      const status = { openai: false, anthropic: false, gemini: false };
      logValidationResults(status, mockLogger);

      const allWarnMessages = mockLogger.warn.mock.calls.map(c => c[0]).join(' ');
      expect(allWarnMessages).toContain('platform.openai.com');
      expect(allWarnMessages).toContain('console.anthropic.com');
      expect(allWarnMessages).toContain('aistudio.google.com');
    });
  });
});
