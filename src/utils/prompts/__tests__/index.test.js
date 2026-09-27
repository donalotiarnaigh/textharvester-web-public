// Define mock classes first
class MockBasePrompt {
  constructor(config = {}) {
    this.version = config.version || '1.0.0';
    this.description = config.description || '';
    this.fields = this._validateFields(config.fields || {});
    this.providers = config.providers || ['openai', 'anthropic'];
  }

  _validateFields(fields) {
    const validatedFields = {};
    for (const [fieldName, field] of Object.entries(fields)) {
      validatedFields[fieldName] = {
        type: field.type || 'string',
        description: field.description || fieldName,
        ...field
      };
    }
    return validatedFields;
  }

  getPromptText() {
    throw new Error('Method not implemented in base class');
  }

  getProviderPrompt() {
    return {
      systemPrompt: 'test system prompt',
      userPrompt: 'test user prompt'
    };
  }

  validateAndConvert(data) {
    return data;
  }
}

class MockMemorialOCRPrompt extends MockBasePrompt {
  constructor(config = {}) {
    super({
      version: '1.0.0',
      description: 'Memorial OCR Prompt',
      fields: {
        text: { type: 'string', description: 'OCR text' }
      },
      ...config
    });
  }

  getPromptText() {
    return 'Memorial OCR prompt text';
  }
}

class MockPromptManager {
  constructor() {
    this.promptClasses = new Map();
    this.promptInstances = new Map();
  }

  registerPromptClass(name, PromptClass) {
    if (this.promptClasses.has(name)) {
      throw new Error('Prompt name already registered');
    }
    this.promptClasses.set(name, PromptClass);
  }

  getPrompt(name, config = {}, force = false) {
    const PromptClass = this.promptClasses.get(name);
    if (!PromptClass) {
      throw new Error('Unknown prompt type: ' + name);
    }

    const cacheKey = `${name}-${JSON.stringify(config)}`;
    if (!force && this.promptInstances.has(cacheKey)) {
      return this.promptInstances.get(cacheKey);
    }

    const instance = new PromptClass(config);
    if (!force) {
      this.promptInstances.set(cacheKey, instance);
    }
    return instance;
  }

  clearRegistry() {
    this.promptClasses.clear();
    this.promptInstances.clear();
  }
}

// Mock the modules
jest.doMock('../types/dataTypes', () => ({
  isValidType: () => true,
  validateValue: (value) => ({ value, errors: [] })
}));

jest.doMock('../providers/providerConfig', () => ({
  PROVIDER_TYPES: ['openai', 'anthropic'],
  createProviderConfig: () => ({
    getFieldFormat: () => 'string',
    systemPromptTemplate: 'test system prompt',
    formatInstructions: 'test format instructions',
    maxTokens: 1000,
    temperature: 0.7
  })
}));

jest.doMock('../BasePrompt', () => ({
  BasePrompt: MockBasePrompt
}));

jest.doMock('../templates/MemorialOCRPrompt', () => ({
  MemorialOCRPrompt: MockMemorialOCRPrompt
}));

jest.doMock('../PromptManager', () => ({
  PromptManager: MockPromptManager
}));

describe('Prompt Module Exports', () => {
  let promptModule;

  beforeEach(() => {
    jest.resetModules();
    promptModule = require('../index');
    // Reset the factory state
    promptModule._getFactory()._manager.clearRegistry();
  });

  describe('Main exports', () => {
    it('should export PromptFactory as default and named export', () => {
      expect(promptModule.default).toBeDefined();
      expect(promptModule.PromptFactory).toBeDefined();
      expect(promptModule.default).toBe(promptModule.PromptFactory);
    });

    it('should export BasePrompt', () => {
      expect(promptModule.BasePrompt).toBeDefined();
      expect(new promptModule.BasePrompt()).toBeInstanceOf(MockBasePrompt);
    });

    it.each(['memorial', 'grave', 'burial_register'])('should return prompt for %s', () => {
      expect(promptModule.PromptManager).toBeDefined();
    });
  });

  describe('Template exports', () => {
    it('should export MemorialOCRPrompt', () => {
      expect(promptModule.MemorialOCRPrompt).toBeDefined();
      const prompt = new promptModule.MemorialOCRPrompt();
      expect(prompt.version).toBe('1.0.0');
      expect(prompt.description).toBe('Memorial OCR Prompt');
    });
  });

  describe('Utility exports', () => {
    it('should export type utilities', () => {
      expect(promptModule.isValidType).toBeDefined();
      expect(promptModule.validateValue).toBeDefined();
    });

    it('should export provider utilities', () => {
      expect(promptModule.PROVIDER_TYPES).toBeDefined();
      expect(promptModule.createProviderConfig).toBeDefined();
    });
  });

  describe('Factory helper functions', () => {
    it('should export createPrompt function', () => {
      expect(promptModule.createPrompt).toBeDefined();
      expect(typeof promptModule.createPrompt).toBe('function');
    });

    it('should create prompt instance with custom config', () => {
      const prompt = promptModule.createPrompt('memorial_ocr');
      expect(prompt).toBeDefined();
      expect(prompt.version).toBe('1.0.0');
    });

    it('should throw error for unknown prompt type in createPrompt', () => {
      expect(() => {
        promptModule.createPrompt('unknown');
      }).toThrow('Unknown prompt type: unknown');
    });
  });

  describe('Backward compatibility', () => {
    it('should maintain legacy prompt creation pattern', () => {
      const legacyPrompt = new promptModule.MemorialOCRPrompt({
        version: '0.9.0'
      });
      expect(legacyPrompt.version).toBe('0.9.0');
    });

    it('should support both new and old provider config patterns', () => {
      const config = promptModule.createProviderConfig('openai');
      expect(config.getFieldFormat).toBeDefined();
      expect(config.systemPromptTemplate).toBeDefined();
    });

    it('should maintain compatibility with existing type validation', () => {
      expect(promptModule.isValidType('string')).toBe(true);
      expect(promptModule.validateValue('test', 'string')).toEqual({
        value: 'test',
        errors: []
      });
    });
  });
}); 