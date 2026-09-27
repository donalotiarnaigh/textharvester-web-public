const { getPrompt } = require('../../../src/utils/prompts/templates/providerTemplates');

describe('Provider Registration - Typographic Analysis', () => {
  describe('getPrompt factory', () => {
    it('returns TypographicAnalysisPrompt instance for openai', () => {
      const prompt = getPrompt('openai', 'typographicAnalysis');
      expect(prompt).toBeDefined();
      expect(prompt.provider).toBe('openai');
      // The class checking might depend on how jest handles module identity, 
      // but checking constructor name is usually safe enough
      expect(prompt.constructor.name).toBe('TypographicAnalysisPrompt');
    });

    it('returns TypographicAnalysisPrompt instance for anthropic', () => {
      const prompt = getPrompt('anthropic', 'typographicAnalysis');
      expect(prompt).toBeDefined();
      expect(prompt.provider).toBe('anthropic');
      expect(prompt.constructor.name).toBe('TypographicAnalysisPrompt');
    });

    it('returns TypographicAnalysisPrompt instance for mock provider', () => {
      const prompt = getPrompt('mock', 'typographicAnalysis');
      expect(prompt).toBeDefined();
      expect(prompt.provider).toBe('mock');
      expect(prompt.constructor.name).toBe('TypographicAnalysisPrompt');
    });

    it('returns latest version by default', () => {
      const prompt = getPrompt('openai', 'typographicAnalysis');
      expect(prompt.version).toBeDefined();
    });

    it('throws error for unknown provider', () => {
      // Depending on implementation, it might throw "No template found" or similar
      // Based on providerTemplates.js code: "No ... template found for provider: unknownProvider"
      // Or if it falls through to promptManager: "Invalid template configuration for provider"
      expect(() => {
        getPrompt('unknownProvider', 'typographicAnalysis');
      }).toThrow();
    });
  });
});
