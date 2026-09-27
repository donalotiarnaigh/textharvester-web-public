// First, declare all mocks
const mockOpenAICreateMethod = jest.fn();
const mockAnthropicCreateMethod = jest.fn();

const mockOpenAIInstance = {
  chat: {
    completions: {
      create: mockOpenAICreateMethod
    }
  }
};

const mockAnthropicInstance = {
  messages: {
    create: mockAnthropicCreateMethod
  }
};

// Then mock all modules
jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => mockOpenAIInstance);
});

jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => mockAnthropicInstance);
});

jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn().mockResolvedValue('base64imagestring'),
    unlink: jest.fn().mockResolvedValue(undefined),
    stat: jest.fn().mockResolvedValue({ size: 1000000 })
  },
  existsSync: jest.fn().mockReturnValue(true),
  mkdirSync: jest.fn(),
  statSync: jest.fn().mockReturnValue({ size: 1000000 })
}));

jest.mock('../../src/utils/prompts/templates/providerTemplates', () => {
  const actualProviderTemplates = jest.requireActual('../../src/utils/prompts/templates/providerTemplates');
  return {
    ...actualProviderTemplates,
    getPrompt: jest.fn(actualProviderTemplates.getPrompt)
  };
});

const actualProviderTemplates = jest.requireActual('../../src/utils/prompts/templates/providerTemplates');

jest.mock('../../src/utils/logger');
jest.mock('../../src/utils/database', () => ({
  storeMemorial: jest.fn().mockResolvedValue(true)
}));

jest.mock('../../src/utils/burialRegisterFlattener', () => ({
  flattenPageToEntries: jest.fn()
}));

jest.mock('../../src/utils/burialRegisterStorage', () => ({
  storePageJSON: jest.fn().mockResolvedValue('/tmp/page.json'),
  storeBurialRegisterEntry: jest.fn().mockResolvedValue(1),
  extractPageNumberFromFilename: jest.fn((fileName) => {
    const match = fileName.match(/page[-_](\d{1,3})(?:_\d+)?\.(jpg|png|jpeg)/i);
    if (match && match[1]) {
      const pageNumber = Number.parseInt(match[1], 10);
      if (!Number.isNaN(pageNumber) && pageNumber > 0) {
        return pageNumber;
      }
    }
    return null;
  })
}));

jest.mock('../../src/utils/imageProcessor', () => ({
  analyzeImageForProvider: jest.fn().mockResolvedValue({
    needsOptimization: false,
    reasons: []
  }),
  optimizeImageForProvider: jest.fn().mockResolvedValue('optimized_base64_string')
}));

jest.mock('../../src/utils/graveCardStorage', () => ({
  initialize: jest.fn().mockResolvedValue(undefined),
  storeGraveCard: jest.fn().mockResolvedValue(1),
  exportCardsToCsv: jest.fn().mockResolvedValue('')
}));

jest.mock('../../src/utils/imageProcessing/graveCardProcessor', () => ({
  processPdf: jest.fn().mockResolvedValue(Buffer.from('stitched-image-data'))
}));

// Mock the model providers
jest.mock('../../src/utils/modelProviders', () => {
  const OpenAIProvider = jest.fn().mockImplementation(() => ({
    processImage: mockOpenAICreateMethod,
    getModelVersion: () => 'gpt-5'
  }));

  const AnthropicProvider = jest.fn().mockImplementation(() => ({
    processImage: mockAnthropicCreateMethod,
    getModelVersion: () => 'claude-4-sonnet-20250514'
  }));

  return {
    createProvider: (config) => {
      switch (config.AI_PROVIDER.toLowerCase()) {
      case 'openai':
        return new OpenAIProvider();
      case 'anthropic':
        return new AnthropicProvider();
      default:
        throw new Error('Invalid model selected');
      }
    },
    OpenAIProvider,
    AnthropicProvider
  };
});

// Then import modules
const fs = require('fs').promises;
const { processFile } = require('../../src/utils/fileProcessing.js');
const providerTemplates = require('../../src/utils/prompts/templates/providerTemplates');
const burialRegisterFlattener = require('../../src/utils/burialRegisterFlattener');
const burialRegisterStorage = require('../../src/utils/burialRegisterStorage');

describe('processFile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    const mockResponse = {
      memorial_number: '123',
      first_name: 'Test',
      last_name: 'User',
      year_of_death: '2000',
      inscription: 'Test inscription'
    };

    // Mock OpenAI response format
    mockOpenAICreateMethod.mockResolvedValue({ content: mockResponse, usage: { input_tokens: 0, output_tokens: 0 } });

    // Mock Anthropic response format
    mockAnthropicCreateMethod.mockResolvedValue({ content: mockResponse, usage: { input_tokens: 0, output_tokens: 0 } });

    providerTemplates.getPrompt.mockImplementation(actualProviderTemplates.getPrompt);
  });

  it('should process file successfully with OpenAI', async () => {
    const result = await processFile('test.jpg', { provider: 'openai' });
    expect(result).toBeDefined();
    expect(result.ai_provider).toBe('openai');
    expect(result.model_version).toBe('gpt-5');
    expect(mockOpenAICreateMethod).toHaveBeenCalled();
    expect(mockAnthropicCreateMethod).not.toHaveBeenCalled();
  });

  it('should process file successfully with Anthropic', async () => {
    const result = await processFile('test.jpg', { provider: 'anthropic' });
    expect(result).toBeDefined();
    expect(result.ai_provider).toBe('anthropic');
    expect(result.model_version).toBe('claude-4-sonnet-20250514');
    expect(mockAnthropicCreateMethod).toHaveBeenCalled();
    expect(mockOpenAICreateMethod).not.toHaveBeenCalled();
  });

  it('should handle errors during OpenAI API call', async () => {
    mockOpenAICreateMethod.mockRejectedValueOnce(new Error('OpenAI API Error'));
    await expect(processFile('test.jpg', { provider: 'openai' }))
      .rejects
      .toThrow('OpenAI API Error');
  });

  it('should handle errors during Anthropic API call', async () => {
    mockAnthropicCreateMethod.mockRejectedValueOnce(new Error('Anthropic API Error'));
    await expect(processFile('test.jpg', { provider: 'anthropic' }))
      .rejects
      .toThrow('Anthropic API Error');
  });

  it('should handle invalid model selection', async () => {
    await expect(processFile('test.jpg', { provider: 'invalid' }))
      .rejects
      .toThrow('Invalid model selected');
  });

  it('should handle file read errors', async () => {
    fs.readFile.mockRejectedValueOnce(new Error('File read error'));
    await expect(processFile('test.jpg', { provider: 'openai' }))
      .rejects
      .toThrow('File read error');
  });

  it('should handle database storage errors', async () => {
    const storeMemorial = require('../../src/utils/database').storeMemorial;
    storeMemorial.mockRejectedValueOnce(new Error('Database error'));
    await expect(processFile('test.jpg', { provider: 'openai' }))
      .rejects
      .toThrow('Database error');
  });

  describe('burial register processing', () => {
    it('processes burial register entries and stores metadata', async () => {
      const burialPromptMock = {
        getProviderPrompt: jest.fn().mockReturnValue({ userPrompt: 'user', systemPrompt: 'system' }),
        validateAndConvertPage: jest.fn(),
        validateAndConvertEntry: jest.fn(),
        version: '1.0.0'
      };

      const pageData = { volume_id: 'vol1', page_number: 2, entries: [{}] };
      const flattenedEntries = [{
        row_index_on_page: 1,
        entry_id: 'vol1_p002_r001',
        name_raw: 'Test Name',
        volume_id: 'vol1',
        page_number: 2,
        parish_header_raw: 'Parish',
        county_header_raw: 'County',
        year_header_raw: '2025',
        uncertainty_flags: ['flagged']
      }];

      burialPromptMock.validateAndConvertPage.mockReturnValue({
        data: pageData,
        confidenceScores: {},
        validationWarnings: []
      });
      burialPromptMock.validateAndConvertEntry.mockImplementation(entry => ({
        data: {
          row_index_on_page: entry.row_index_on_page,
          entry_id: entry.entry_id,
          name_raw: entry.name_raw,
          uncertainty_flags: entry.uncertainty_flags
        },
        confidenceScores: {},
        validationWarnings: []
      }));

      providerTemplates.getPrompt.mockImplementationOnce(() => burialPromptMock);
      burialRegisterFlattener.flattenPageToEntries.mockReturnValue(flattenedEntries);

      mockOpenAICreateMethod.mockResolvedValue({ content: pageData, usage: { input_tokens: 0, output_tokens: 0 } });

      const result = await processFile('burial.jpg', {
        provider: 'openai',
        sourceType: 'burial_register',
        promptTemplate: 'burialRegister'
      });

      expect(providerTemplates.getPrompt).toHaveBeenCalledWith('openai', 'burialRegister', 'latest');
      expect(burialRegisterStorage.storePageJSON).toHaveBeenCalledWith(pageData, 'openai', 'vol1', 2);
      expect(burialRegisterFlattener.flattenPageToEntries).toHaveBeenCalledWith(pageData, {
        provider: 'openai',
        model: 'gpt-5',
        filePath: 'burial.jpg'
      }, null);

      expect(result.entries).toHaveLength(1);
      expect(result.entries[0]).toMatchObject({
        ai_provider: 'openai',
        model_name: 'gpt-5',
        prompt_template: 'burialRegister',
        prompt_version: '1.0.0',
        fileName: 'burial.jpg',
        source_type: 'burial_register',
        volume_id: 'vol1',
        page_number: 2
      });

      expect(burialRegisterStorage.storeBurialRegisterEntry).toHaveBeenCalledWith(expect.objectContaining({
        ai_provider: 'openai',
        model_name: 'gpt-5',
        entry_id: 'vol1_p002_r001',
        volume_id: 'vol1',
        page_number: 2,
        fileName: 'burial.jpg',
        prompt_template: 'burialRegister',
        prompt_version: '1.0.0',
        source_type: 'burial_register'
      }));

      expect(fs.unlink).toHaveBeenCalledWith('burial.jpg');
    });

    it('processes burial register entries with Claude provider without errors', async () => {
      const burialPromptMock = {
        getProviderPrompt: jest.fn().mockReturnValue({ userPrompt: 'user', systemPrompt: 'system' }),
        validateAndConvertPage: jest.fn(),
        validateAndConvertEntry: jest.fn(),
        version: '1.0.1'
      };

      const pageData = { volume_id: 'vol2', page_number: 4, entries: [{}], parish_header_raw: 'Parish' };
      const flattenedEntries = [{
        row_index_on_page: 1,
        entry_id: 'vol2_p004_r001',
        name_raw: 'Another Name',
        volume_id: 'vol2',
        page_number: 4,
        parish_header_raw: 'Parish',
        county_header_raw: null,
        year_header_raw: null,
        uncertainty_flags: []
      }];

      burialPromptMock.validateAndConvertPage.mockReturnValue({
        data: pageData,
        confidenceScores: {},
        validationWarnings: []
      });
      burialPromptMock.validateAndConvertEntry.mockImplementation(entry => ({
        data: {
          row_index_on_page: entry.row_index_on_page,
          entry_id: entry.entry_id,
          name_raw: entry.name_raw,
          parish_header_raw: entry.parish_header_raw,
          county_header_raw: entry.county_header_raw,
          year_header_raw: entry.year_header_raw,
          uncertainty_flags: entry.uncertainty_flags
        },
        confidenceScores: {},
        validationWarnings: []
      }));

      providerTemplates.getPrompt.mockImplementationOnce(() => burialPromptMock);
      burialRegisterFlattener.flattenPageToEntries.mockReturnValue(flattenedEntries);

      mockAnthropicCreateMethod.mockResolvedValue({ content: pageData, usage: { input_tokens: 0, output_tokens: 0 } });

      const result = await processFile('claude-burial.jpg', {
        provider: 'anthropic',
        sourceType: 'burial_register',
        promptTemplate: 'burialRegister',
        volume_id: 'vol2'
      });

      expect(providerTemplates.getPrompt).toHaveBeenCalledWith('anthropic', 'burialRegister', 'latest');
      expect(burialRegisterStorage.storePageJSON).toHaveBeenCalledWith(pageData, 'anthropic', 'vol2', 4);
      expect(burialRegisterFlattener.flattenPageToEntries).toHaveBeenCalledWith(pageData, {
        provider: 'anthropic',
        model: 'claude-4-sonnet-20250514',
        filePath: 'claude-burial.jpg'
      }, null);

      expect(result.entries).toHaveLength(1);
      expect(result.pageData).toEqual(pageData);
      expect(result.entries[0]).toMatchObject({
        ai_provider: 'anthropic',
        model_name: 'claude-4-sonnet-20250514',
        prompt_template: 'burialRegister',
        prompt_version: '1.0.1',
        fileName: 'claude-burial.jpg',
        source_type: 'burial_register',
        volume_id: 'vol2',
        page_number: 4
      });

      expect(burialRegisterStorage.storeBurialRegisterEntry).toHaveBeenCalledWith(expect.objectContaining({
        ai_provider: 'anthropic',
        model_name: 'claude-4-sonnet-20250514',
        entry_id: 'vol2_p004_r001',
        volume_id: 'vol2',
        page_number: 4,
        fileName: 'claude-burial.jpg',
        prompt_template: 'burialRegister',
        prompt_version: '1.0.1',
        source_type: 'burial_register'
      }));

      expect(fs.unlink).toHaveBeenCalledWith('claude-burial.jpg');
    });
  });
});
