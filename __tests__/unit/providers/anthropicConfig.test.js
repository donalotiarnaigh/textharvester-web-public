const AnthropicConfig = require('../../../src/utils/prompts/providers/anthropicConfig');

describe('AnthropicConfig', () => {
  describe('constructor', () => {
    it('should create a valid Anthropic configuration', () => {
      const config = new AnthropicConfig();
      expect(config.model).toBe('claude-sonnet-4-5');
      expect(config.maxTokens).toBe(2000);
      expect(config.temperature).toBe(0.7);
    });

    it('should accept custom model', () => {
      const config = new AnthropicConfig({
        model: 'claude-3-sonnet'
      });
      expect(config.model).toBe('claude-3-sonnet');
    });

    it('should throw error for unsupported model', () => {
      expect(() => new AnthropicConfig({
        model: 'unsupported-model'
      })).toThrow('Unsupported Anthropic model');
    });
  });

  describe('getApiParams', () => {
    it('should return valid API parameters', () => {
      const config = new AnthropicConfig();
      const params = config.getApiParams();
      expect(params).toEqual({
        model: 'claude-sonnet-4-5',
        max_tokens: 2000,
        temperature: 0.7,
        response_format: {
          type: 'markdown'
        }
      });
    });
  });
}); 