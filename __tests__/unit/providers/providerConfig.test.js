const {
  ProviderConfig,
  createProviderConfig,
  PROVIDER_TYPES
} = require('../../../src/utils/prompts/providers/providerConfig');

describe('Provider Configuration', () => {
  describe('ProviderConfig Class', () => {
    it('should create a valid provider configuration', () => {
      const config = new ProviderConfig(PROVIDER_TYPES.OPENAI);
      expect(config.type).toBe(PROVIDER_TYPES.OPENAI);
      expect(config.maxTokens).toBe(2000);
      expect(config.temperature).toBe(0.7);
    });

    it('should throw error for invalid provider type', () => {
      expect(() => new ProviderConfig('invalid_type')).toThrow('Invalid provider type');
    });

    it('should set default values for optional fields', () => {
      const config = new ProviderConfig(PROVIDER_TYPES.OPENAI);
      expect(config.maxTokens).toBe(2000);
      expect(config.temperature).toBe(0.7);
    });
  });

  describe('Provider Configuration Factory', () => {
    it('should create OpenAI configuration', () => {
      const config = createProviderConfig('openai');
      expect(config.type).toBe(PROVIDER_TYPES.OPENAI);
      expect(config.systemPromptTemplate).toBe('You are an AI assistant trained by OpenAI to help with data extraction.');
    });

    it('should create Anthropic configuration', () => {
      const config = createProviderConfig('anthropic');
      expect(config.type).toBe(PROVIDER_TYPES.ANTHROPIC);
      expect(config.systemPromptTemplate).toBe('You are Claude, an AI assistant created by Anthropic to help with data extraction.');
    });

    it('should throw error for unknown provider', () => {
      expect(() => createProviderConfig('unknown')).toThrow('Unknown provider: unknown');
    });
  });

  describe('System Prompts', () => {
    it('should format system prompt with task', () => {
      const config = new ProviderConfig(PROVIDER_TYPES.OPENAI);
      const formattedPrompt = config.formatSystemPrompt({ task: 'process memorial records' });
      expect(formattedPrompt).toBe('You are an AI assistant trained by OpenAI to help with data extraction.');
    });

    it('should handle missing task parameter', () => {
      const config = new ProviderConfig(PROVIDER_TYPES.OPENAI);
      expect(() => config.formatSystemPrompt({})).toThrow('Task is required');
    });
  });

  describe('Field Formats', () => {
    it('should return correct field format for provider', () => {
      const config = new ProviderConfig(PROVIDER_TYPES.OPENAI);
      expect(config.getFieldFormat('string')).toBe('text');
      expect(config.getFieldFormat('integer')).toBe('integer');
      expect(config.getFieldFormat('float')).toBe('number');
    });

    it('should return original type if no mapping exists', () => {
      const config = new ProviderConfig(PROVIDER_TYPES.OPENAI);
      expect(config.getFieldFormat('custom')).toBe('custom');
    });
  });

  describe('Response Format', () => {
    it('should set correct response format for OpenAI', () => {
      const config = new ProviderConfig(PROVIDER_TYPES.OPENAI);
      expect(config.responseFormat).toEqual({
        type: 'json',
        schema: {
          type: 'object',
          properties: {
            result: { type: 'string' }
          },
          required: ['result']
        }
      });
    });

    it('should set correct response format for Anthropic', () => {
      const config = new ProviderConfig(PROVIDER_TYPES.ANTHROPIC);
      expect(config.responseFormat).toEqual({
        type: 'markdown'
      });
    });
  });
}); 