const OpenAIConfig = require('../../../src/utils/prompts/providers/openaiConfig');

describe('OpenAIConfig', () => {
  describe('constructor', () => {
    it('should create a valid OpenAI configuration', () => {
      const config = new OpenAIConfig();
      expect(config.model).toBe('gpt-4');
      expect(config.maxTokens).toBe(2000);
      expect(config.temperature).toBe(0.7);
    });

    it('should accept custom model', () => {
      const config = new OpenAIConfig({
        model: 'gpt-4-turbo'
      });
      expect(config.model).toBe('gpt-4-turbo');
    });

    it('should throw error for unsupported model', () => {
      expect(() => new OpenAIConfig({
        model: 'unsupported-model'
      })).toThrow('Unsupported OpenAI model');
    });
  });

  describe('getApiParams', () => {
    it('should return valid API parameters', () => {
      const config = new OpenAIConfig();
      const params = config.getApiParams();
      expect(params).toEqual({
        model: 'gpt-4',
        max_tokens: 2000,
        temperature: 0.7,
        response_format: {
          type: 'json',
          schema: {
            type: 'object',
            properties: {
              result: { type: 'string' }
            },
            required: ['result']
          }
        }
      });
    });
  });
}); 