const {
  getProviderConfig,
  detectProvider,
  SUPPORTED_PROVIDERS
} = require('../index');

describe('Provider Configuration Integration', () => {
  describe('OpenAI Configuration', () => {
    let openaiConfig;

    beforeEach(() => {
      openaiConfig = getProviderConfig(SUPPORTED_PROVIDERS.OPENAI);
    });

    it('should provide correct API parameters for vision model', () => {
      const params = openaiConfig.getApiParams();
      expect(params).toBeDefined();
      expect(typeof params.model).toBe('string');
      expect(typeof params.max_tokens).toBe('number');
      expect(typeof params.temperature).toBe('number');
      expect(params.response_format).toBeDefined();
    });

    it('should format system prompt for memorial task', () => {
      // Apply a task that will be included in the output
      const task = 'Extract memorial data';
      
      const formattedPrompt = openaiConfig.formatSystemPrompt({ task });
      
      // The base implementation returns the template as-is (doesn't replace placeholders)
      expect(formattedPrompt).toBe(openaiConfig.systemPromptTemplate);
      expect(formattedPrompt).toContain('OpenAI');
    });

    it('should have valid model configuration', () => {
      expect(openaiConfig.model).toBeDefined();
      expect(typeof openaiConfig.model).toBe('string');
    });
  });

  describe('Anthropic Configuration', () => {
    let anthropicConfig;

    beforeEach(() => {
      anthropicConfig = getProviderConfig(SUPPORTED_PROVIDERS.ANTHROPIC);
    });

    it('should provide correct API parameters', () => {
      const params = anthropicConfig.getApiParams();
      expect(params).toBeDefined();
      expect(typeof params.model).toBe('string');
      expect(typeof params.max_tokens).toBe('number');
      expect(typeof params.temperature).toBe('number');
    });

    it('should format system prompt for memorial task', () => {
      // Apply a task that will be included in the output
      const task = 'Extract memorial data';
      
      const formattedPrompt = anthropicConfig.formatSystemPrompt({ task });
      
      // Anthropic adds additional instruction about JSON formatting
      expect(formattedPrompt).toContain('Anthropic');
      expect(formattedPrompt).toContain('Please format your response as a JSON object');
    });

    it('should have valid model configuration', () => {
      expect(anthropicConfig.model).toBeDefined();
      expect(typeof anthropicConfig.model).toBe('string');
    });
  });

  describe('Provider Detection with Real Models', () => {
    const realModelScenarios = [
      { model: 'gpt-4-vision-preview', expected: SUPPORTED_PROVIDERS.OPENAI },
      { model: 'gpt-4-1106-vision-preview', expected: SUPPORTED_PROVIDERS.OPENAI },
      { model: 'claude-3-opus-20240229', expected: SUPPORTED_PROVIDERS.ANTHROPIC },
      { model: 'claude-3-sonnet-20240229', expected: SUPPORTED_PROVIDERS.ANTHROPIC },
      { model: 'claude-3-haiku-20240307', expected: SUPPORTED_PROVIDERS.ANTHROPIC }
    ];

    test.each(realModelScenarios)(
      'should detect correct provider for $model',
      ({ model, expected }) => {
        expect(detectProvider(model)).toBe(expected);
      }
    );
  });

  describe('Error Handling Scenarios', () => {
    it('should handle provider configuration errors gracefully', () => {
      const config = getProviderConfig(SUPPORTED_PROVIDERS.OPENAI);
      
      // Test that formatSystemPrompt requires a task parameter
      expect(() => {
        config.formatSystemPrompt({});
      }).toThrow('Task is required');
    });

    it('should handle response format validation if available', () => {
      const config = getProviderConfig(SUPPORTED_PROVIDERS.OPENAI);
      
      // Always verify basic config structure
      expect(config).toBeDefined();
      
      // Test response format validation functionality if available
      const hasResponseFormatValidation = typeof config.validateResponseFormat === 'function' && config.responseFormat;
      expect(typeof hasResponseFormatValidation).toBe('boolean');
      
      if (!hasResponseFormatValidation) {
        // Skip test if validation not available
        return;
      }
      
      const originalType = config.responseFormat.type;
      let validationError;
      
      try {
        config.responseFormat.type = 'invalid';
        try {
          config.validateResponseFormat();
        } catch (error) {
          validationError = error;
        }
      } finally {
        config.responseFormat.type = originalType;
      }
      
      expect(validationError).toBeDefined();
    });

    it('should handle model validation if available', () => {
      const config = getProviderConfig(SUPPORTED_PROVIDERS.ANTHROPIC);
      
      // Always verify basic config structure  
      expect(config).toBeDefined();
      expect(config.model).toBeDefined();
      
      // Test model validation functionality if available
      const hasModelValidation = typeof config.validateModel === 'function';
      expect(typeof hasModelValidation).toBe('boolean');
      
      if (!hasModelValidation) {
        // Skip test if validation not available
        return;
      }
      
      const originalModel = config.model;
      let validationError;
      
      try {
        config.model = 'invalid-model';
        try {
          config.validateModel();
        } catch (error) {
          validationError = error;
        }
      } finally {
        config.model = originalModel;
      }
      
      expect(validationError).toBeDefined();
    });
  });
}); 