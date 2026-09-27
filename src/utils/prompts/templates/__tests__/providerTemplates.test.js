const { promptManager, openaiTemplate, anthropicTemplate, getPrompt } = require('../providerTemplates');
const BasePrompt = require('../../BasePrompt');
const BurialRegisterPrompt = require('../BurialRegisterPrompt');

// Test prompt class using field-based approach
class TestPrompt extends BasePrompt {
  constructor(config = {}) {
    super({
      version: '1.0.0',
      description: 'Test prompt',
      fields: {
        memorial_number: {
          type: 'string',
          description: 'Memorial identifier',
          required: true
        },
        first_name: {
          type: 'string',
          description: 'First name of the deceased',
          required: false
        },
        year_of_death: {
          type: 'integer',
          description: 'Year of death',
          required: false,
          constraints: { min: 1500, max: 2100 }
        }
      },
      ...config
    });
  }

  getPromptText() {
    return 'Extract the following fields from the data';
  }
}

describe('Provider Templates', () => {
  let testPrompt;

  beforeEach(() => {
    testPrompt = new TestPrompt();
  });

  describe('OpenAI Template', () => {
    it('should have correct provider name', () => {
      expect(openaiTemplate.provider).toBe('openai');
    });

    it('should format prompt correctly', () => {
      const formatted = promptManager.formatPrompt(testPrompt, 'openai');

      // Check for field definitions and format instructions
      expect(formatted.prompt).toContain('Extract the following fields from the data');
      expect(formatted.prompt).toContain('Field Definitions:');
      expect(formatted.prompt).toContain('memorial_number');
      expect(formatted.prompt).toContain('first_name');
      expect(formatted.prompt).toContain('year_of_death');
      expect(formatted.prompt).toContain('response_format');
    });
  });

  describe('Anthropic Template', () => {
    it('should have correct provider name', () => {
      expect(anthropicTemplate.provider).toBe('anthropic');
    });

    it('should format prompt correctly', () => {
      const formatted = promptManager.formatPrompt(testPrompt, 'anthropic');

      // Check for field definitions and format instructions
      expect(formatted.prompt).toContain('Extract the following fields from the data');
      expect(formatted.prompt).toContain('Field Definitions:');
      expect(formatted.prompt).toContain('memorial_number');
      expect(formatted.prompt).toContain('first_name');
      expect(formatted.prompt).toContain('year_of_death');
      expect(formatted.prompt).toContain('JSON');
    });
  });

  describe('Template Validation', () => {
    it('should validate test prompt against OpenAI template', () => {
      const result = promptManager.validatePrompt(testPrompt, 'openai');
      expect(result.isValid).toBe(true);
    });

    it('should validate test prompt against Anthropic template', () => {
      const result = promptManager.validatePrompt(testPrompt, 'anthropic');
      expect(result.isValid).toBe(true);
    });
  });

  describe('Burial register prompt registration', () => {
    it('should return burial register prompt for OpenAI', () => {
      const promptInstance = getPrompt('openai', 'burialRegister', 'latest');
      expect(promptInstance).toBeInstanceOf(BurialRegisterPrompt);
    });

    it('should return burial register prompt for Anthropic', () => {
      const promptInstance = getPrompt('anthropic', 'burialRegister', 'latest');
      expect(promptInstance).toBeInstanceOf(BurialRegisterPrompt);
    });
  });
});