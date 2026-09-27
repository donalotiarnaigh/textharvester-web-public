jest.mock('../types/dataTypes', () => ({
  isValidType: () => true,
  validateValue: (value) => ({ value, errors: [] })
}));

jest.mock('../providers/providerConfig', () => ({
  PROVIDER_TYPES: ['openai', 'anthropic'],
  createProviderConfig: () => ({
    getFieldFormat: () => 'string',
    systemPromptTemplate: 'test system prompt',
    formatInstructions: 'test format instructions',
    maxTokens: 1000,
    temperature: 0.7
  })
}));

// Mock BasePrompt class
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

// Mock the BasePrompt module
jest.mock('../BasePrompt', () => ({
  BasePrompt: MockBasePrompt
}));

// Mock PromptManager
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
      throw new Error('Prompt class not found');
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

  validateConfig(name, config) {
    const PromptClass = this.promptClasses.get(name);
    if (!PromptClass) {
      throw new Error('Prompt class not found');
    }

    if (config.providers && typeof config.providers !== 'object') {
      throw new Error('Invalid configuration: providers must be an array');
    }

    // Create a temporary instance to validate the config
    try {
      new PromptClass(config);
    } catch (error) {
      throw new Error(`Invalid configuration: ${error.message}`);
    }
  }
}

jest.mock('../PromptManager', () => ({
  PromptManager: MockPromptManager
}));

// Mock MemorialOCRPrompt
jest.mock('../templates/MemorialOCRPrompt', () => ({
  MemorialOCRPrompt: class extends MockBasePrompt {
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
}));

// Import after mocking
const { PromptFactory } = require('../PromptFactory');

// Mock prompt classes for testing
class TestPrompt extends MockBasePrompt {
  constructor(config = {}) {
    super({
      version: '1.0.0',
      description: 'Test prompt',
      fields: {
        field1: { type: 'string', description: 'Test field 1' },
        field2: { type: 'integer', description: 'Test field 2' }
      },
      ...config
    });
  }

  getPromptText() {
    return 'Test prompt text';
  }
}

describe('PromptFactory', () => {
  let factory;

  beforeEach(() => {
    jest.clearAllMocks();
    factory = new PromptFactory();
  });

  describe('registration', () => {
    it('should register prompt classes on initialization', () => {
      expect(factory.getAvailablePrompts()).toContain('memorial_ocr');
    });

    it('should allow registering custom prompt classes', () => {
      factory.registerPrompt('test', TestPrompt);
      expect(factory.getAvailablePrompts()).toContain('test');
    });

    it('should throw error when registering invalid prompt name', () => {
      expect(() => {
        factory.registerPrompt('', TestPrompt);
      }).toThrow('Invalid prompt name');
    });
  });

  describe('getPrompt', () => {
    beforeEach(() => {
      factory.registerPrompt('test', TestPrompt);
    });

    it('should create prompt instance with default config', () => {
      const prompt = factory.getPrompt('test');
      expect(prompt instanceof TestPrompt).toBe(true);
      expect(prompt.version).toBe('1.0.0');
    });

    it('should create prompt instance with custom config', () => {
      const config = {
        version: '1.1.0',
        description: 'Custom test prompt'
      };
      const prompt = factory.getPrompt('test', config);
      expect(prompt.version).toBe('1.1.0');
      expect(prompt.description).toBe('Custom test prompt');
    });

    it('should throw error for unknown prompt type', () => {
      expect(() => {
        factory.getPrompt('unknown');
      }).toThrow('Unknown prompt type: unknown');
    });

    it('should reuse cached instances by default', () => {
      const prompt1 = factory.getPrompt('test');
      const prompt2 = factory.getPrompt('test');
      expect(prompt1).toBe(prompt2);
    });

    it('should create new instance when force=true', () => {
      const prompt1 = factory.getPrompt('test');
      const prompt2 = factory.getPrompt('test', {}, true);
      expect(prompt1).not.toBe(prompt2);
    });
  });

  describe('helper utilities', () => {
    beforeEach(() => {
      factory.registerPrompt('test', TestPrompt);
    });

    it('should list all available prompts', () => {
      const prompts = factory.getAvailablePrompts();
      expect(prompts).toContain('test');
    });

    it('should get prompt info', () => {
      const info = factory.getPromptInfo('test');
      expect(info).toEqual({
        version: '1.0.0',
        description: 'Test prompt',
        fields: {
          field1: { type: 'string', description: 'Test field 1' },
          field2: { type: 'integer', description: 'Test field 2' }
        }
      });
    });

    it('should throw error when getting info for unknown prompt', () => {
      expect(() => {
        factory.getPromptInfo('unknown');
      }).toThrow('Unknown prompt type: unknown');
    });

    it('should validate prompt configuration', () => {
      const config = {
        version: '1.0.0',
        fields: {
          field1: { required: true }
        }
      };
      expect(() => {
        factory.validateConfig('test', config);
      }).not.toThrow();
    });

    it('should throw error for invalid configuration', () => {
      const config = {
        providers: 'invalid'
      };
      expect(() => {
        factory.validateConfig('test', config);
      }).toThrow('Invalid configuration: providers must be an array');
    });
  });
}); 