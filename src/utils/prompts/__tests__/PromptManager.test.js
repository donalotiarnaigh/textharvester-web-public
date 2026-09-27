// Mock dependencies
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
jest.mock('../BasePrompt', () => MockBasePrompt);

// Import PromptManager after mocking BasePrompt
const PromptManager = require('../PromptManager');

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

describe('PromptManager', () => {
  let manager;

  beforeEach(() => {
    jest.clearAllMocks();
    manager = new PromptManager();
  });

  describe('class registration', () => {
    it('should register a prompt class successfully', () => {
      expect(() => {
        manager.registerPromptClass('test', TestPrompt);
      }).not.toThrow();
    });

    it('should throw error when registering invalid prompt class', () => {
      class InvalidPrompt { }
      expect(() => {
        manager.registerPromptClass('invalid', InvalidPrompt);
      }).toThrow('Invalid prompt class: Must extend BasePrompt');
    });

    it('should throw error when registering duplicate prompt name', () => {
      manager.registerPromptClass('test', TestPrompt);
      expect(() => {
        manager.registerPromptClass('test', TestPrompt);
      }).toThrow('Prompt name already registered');
    });
  });

  describe('instance caching', () => {
    beforeEach(() => {
      manager.registerPromptClass('test', TestPrompt);
    });

    it('should return cached instance for same config', () => {
      const config = { provider: 'openai' };
      const instance1 = manager.getPrompt('test', config);
      const instance2 = manager.getPrompt('test', config);
      expect(instance1).toBe(instance2); // Same instance
    });

    it('should create new instance for different config', () => {
      const instance1 = manager.getPrompt('test', { provider: 'openai' });
      const instance2 = manager.getPrompt('test', { provider: 'anthropic' });
      expect(instance1).not.toBe(instance2); // Different instances
    });

    it('should create new instance when force=true', () => {
      const config = { provider: 'openai' };
      const instance1 = manager.getPrompt('test', config);
      const instance2 = manager.getPrompt('test', config, true);
      expect(instance1).not.toBe(instance2); // Different instances
    });
  });

  describe('configuration overrides', () => {
    beforeEach(() => {
      manager.registerPromptClass('test', TestPrompt);
    });

    it('should apply default configuration', () => {
      const instance = manager.getPrompt('test');
      expect(instance.version).toBe('1.0.0');
      expect(instance.description).toBe('Test prompt');
    });

    it('should override default configuration', () => {
      const config = {
        version: '1.1.0',
        description: 'Modified test prompt'
      };
      const instance = manager.getPrompt('test', config);
      expect(instance.version).toBe('1.1.0');
      expect(instance.description).toBe('Modified test prompt');
    });

    it('should merge field configurations', () => {
      const config = {
        fields: {
          field1: { required: true },
          field2: { transform: (val) => val * 2 }
        }
      };
      const instance = manager.getPrompt('test', config);
      expect(instance.fields.field1.required).toBe(true);
      expect(instance.fields.field1.type).toBe('string');
      expect(typeof instance.fields.field2.transform).toBe('function');
    });
  });

  describe('error handling', () => {
    it('should throw error when getting unregistered prompt', () => {
      expect(() => {
        manager.getPrompt('nonexistent');
      }).toThrow('Prompt class not found: nonexistent');
    });

    it('should throw error when config is invalid', () => {
      manager.registerPromptClass('test', TestPrompt);
      expect(() => {
        manager.getPrompt('test', { providers: 'invalid' });
      }).toThrow('Invalid providers configuration');
    });
  });
}); 