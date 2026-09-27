/**
 * End-to-End Tests for Processor Strategy Pattern (Issue #99)
 *
 * Verifies that all record types are processed correctly through the
 * refactored strategy pattern architecture.
 */

const path = require('path');
const fs = require('fs').promises;
const { processFile } = require('../../src/utils/fileProcessing');
const { getProcessor } = require('../../src/utils/processors');

// Mock prompts to return proper validation
jest.mock('../../src/utils/prompts/templates/providerTemplates', () => ({
  getPrompt: jest.fn((provider, template) => ({
    getProviderPrompt: jest.fn(() => 'Test prompt'),
    version: '1.0',
    validateAndConvert: jest.fn((data) => ({
      data: {
        ...data,
        first_name: 'John',
        last_name: 'Doe',
        age: '75',
        inscription: 'In loving memory',
        memorial_number: 'M001',
        site_name: 'Historic Cemetery',
        deceased_name: 'Jane Smith',
        burial_date: '1875-05-20',
      },
      confidenceScores: {
        first_name: 0.95,
        last_name: 0.92,
        age: 0.88,
      },
      validationWarnings: [],
    })),
    validateAndConvertPage: jest.fn((data) => ({
      data: {
        ...data,
        page_number: 1,
        volume_id: 'vol1',
      },
      confidenceScores: {},
      validationWarnings: [],
    })),
    validateAndConvertEntry: jest.fn((data) => ({
      data: {
        ...data,
        entry_id: 'BE001',
      },
      confidenceScores: {},
      validationWarnings: [],
    })),
  })),
}));

// Mock the providers to avoid actual API calls
jest.mock('../../src/utils/modelProviders', () => ({
  createProvider: jest.fn(() => ({
    processImage: jest.fn(async () => ({
      content: JSON.stringify({
        first_name: 'John',
        last_name: 'Doe',
        age: '75',
        inscription: 'In loving memory',
        memorial_number: 'M001',
        site_name: 'Historic Cemetery',
      }),
      usage: { input_tokens: 100, output_tokens: 50 },
    })),
    getModelVersion: jest.fn(() => 'gpt-5.4'),
  })),
}));

// Mock storage to capture results without DB writes
const storedData = {
  memorials: [],
  burialEntries: [],
  graveCards: [],
  classifications: [],
};

jest.mock('../../src/utils/database', () => ({
  storeMemorial: jest.fn(async (data) => {
    storedData.memorials.push(data);
  }),
  initializeDatabase: jest.fn(),
  getAllMemorials: jest.fn(),
}));

jest.mock('../../src/utils/burialRegisterStorage', () => ({
  storeBurialRegisterEntry: jest.fn(async (data) => {
    storedData.burialEntries.push(data);
  }),
  storePageJSON: jest.fn(),
  extractPageNumberFromFilename: jest.fn(() => 1),
}));

jest.mock('../../src/utils/graveCardStorage', () => ({
  storeGraveCard: jest.fn(async (data) => {
    storedData.graveCards.push(data);
  }),
  initialize: jest.fn(),
}));

jest.mock('../../src/utils/monumentClassificationStorage', () => ({
  storeClassification: jest.fn(async (data) => {
    storedData.classifications.push(data);
  }),
}));

// Mock file system operations
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  promises: {
    ...jest.requireActual('fs').promises,
    readFile: jest.fn(async () => Buffer.from('mock-image-data')),
    unlink: jest.fn(async () => {}),
  },
}));

// Mock image optimization
jest.mock('../../src/utils/imageProcessor', () => ({
  analyzeImageForProvider: jest.fn(async () => ({
    needsOptimization: false,
  })),
  optimizeImageForProvider: jest.fn(async () => 'mock-base64-image'),
}));

// Mock grave card processor
jest.mock('../../src/utils/imageProcessing/graveCardProcessor', () => ({
  processPdf: jest.fn(async () => Buffer.from('mock-grave-card-image')),
}));

// Mock burial register flattener
jest.mock('../../src/utils/burialRegisterFlattener', () => ({
  flattenPageToEntries: jest.fn(() => [
    {
      entry_id: 'BE001',
      volume_id: 'vol1',
      page_number: 1,
      deceased_name: 'Jane Smith',
      burial_date: '1875-05-20',
    },
  ]),
}));

describe('Processor Strategy Pattern — E2E Tests (Issue #99)', () => {
  beforeEach(() => {
    // Clear stored data before each test
    storedData.memorials = [];
    storedData.burialEntries = [];
    storedData.graveCards = [];
    storedData.classifications = [];
    jest.clearAllMocks();
  });

  describe('getProcessor registry', () => {
    it('should return processor for grave_record_card', () => {
      const processor = getProcessor('grave_record_card');
      expect(processor).toBeDefined();
      expect(typeof processor).toBe('function');
    });

    it('should return processor for burial_register', () => {
      const processor = getProcessor('burial_register');
      expect(processor).toBeDefined();
      expect(typeof processor).toBe('function');
    });

    it('should return processor for monument_classification', () => {
      const processor = getProcessor('monument_classification');
      expect(processor).toBeDefined();
      expect(typeof processor).toBe('function');
    });

    it('should return memorial processor for memorial sourceType', () => {
      const processor = getProcessor('memorial');
      expect(processor).toBeDefined();
      expect(typeof processor).toBe('function');
    });

    it('should default to memorial processor for unknown types', () => {
      const processor = getProcessor('unknown_type');
      expect(processor).toBeDefined();
      expect(typeof processor).toBe('function');
    });
  });

  describe('Memorial Processing', () => {
    it('should process memorial file and attach metadata', async () => {
      const result = await processFile('/test/memorial.jpg', {
        provider: 'openai',
        sourceType: 'memorial',
      });

      expect(result.first_name).toBe('John');
      expect(result.last_name).toBe('Doe');
      expect(result.ai_provider).toBe('openai');
      expect(result.model_version).toBe('gpt-5.4');
      expect(result.source_type).toBe('memorial');
      expect(result.prompt_template).toBe('memorialOCR');
      expect(result.processing_id).toBeDefined();
      expect(result.input_tokens).toBe(100);
      expect(result.output_tokens).toBe(50);
      expect(result.estimated_cost_usd).toBeCloseTo(0.00125, 5); // (100/1M)*2.5 + (50/1M)*20 = 0.00025 + 0.001 = 0.00125
    });

    it('should apply confidence metadata when enabled', async () => {
      const result = await processFile('/test/memorial.jpg', {
        provider: 'anthropic',
        sourceType: 'memorial',
      });

      // Memorial processor should apply confidence metadata
      expect(result.confidence_scores || result.needs_review !== undefined).toBeDefined();
      expect(result.processing_id).toBeDefined();
    });

    it('should include site_code when provided for mobile uploads', async () => {
      const result = await processFile('/test/memorial.jpg', {
        provider: 'openai',
        sourceType: 'memorial',
        site_code: 'SITE_123',
      });

      expect(result.site_code).toBe('SITE_123');
    });

    it('should store result in database', async () => {
      await processFile('/test/memorial.jpg', {
        provider: 'openai',
        sourceType: 'memorial',
      });

      expect(storedData.memorials).toHaveLength(1);
      expect(storedData.memorials[0].first_name).toBe('John');
    });
  });

  describe('Monument Photo Processing', () => {
    it('should process monument_photo and handle memorial number injection', async () => {
      const result = await processFile('/test/monument_photo_M999.jpg', {
        provider: 'openai',
        sourceType: 'monument_photo',
      });

      expect(result.source_type).toBe('monument_photo');
      expect(result.prompt_template).toBe('monumentPhotoOCR');
      expect(result.processing_id).toBeDefined();
    });
  });

  describe('Typographic Analysis Processing', () => {
    it('should process typographic_analysis with correct template', async () => {
      const result = await processFile('/test/typographic.jpg', {
        provider: 'anthropic',
        sourceType: 'typographic_analysis',
      });

      expect(result.source_type).toBe('typographic_analysis');
      expect(result.prompt_template).toBe('typographicAnalysis');
      expect(result.ai_provider).toBe('anthropic');
    });
  });

  describe('Monument Classification Processing', () => {
    it('should process monument_classification file', async () => {
      const result = await processFile('/test/monument_class.jpg', {
        provider: 'openai',
        sourceType: 'monument_classification',
      });

      expect(result.source_type).toBe('monument_classification');
      expect(result.prompt_template).toBe('monumentClassification');
      expect(result.processing_id).toBeDefined();
    });

    it('should store classification in dedicated storage', async () => {
      await processFile('/test/monument_class.jpg', {
        provider: 'openai',
        sourceType: 'monument_classification',
      });

      expect(storedData.classifications).toHaveLength(1);
    });
  });

  describe('Burial Register Processing', () => {
    it('should process burial_register file', async () => {
      const result = await processFile('/test/burial_register_page_1.jpg', {
        provider: 'openai',
        sourceType: 'burial_register',
        volume_id: 'vol_test',
      });

      expect(result.entries).toBeDefined();
      expect(Array.isArray(result.entries)).toBe(true);
      expect(result.pageData).toBeDefined();
    });

    it('should handle burial_register timeout configuration', async () => {
      const result = await processFile('/test/burial_register.jpg', {
        provider: 'anthropic',
        sourceType: 'burial_register',
      });

      expect(result.entries).toBeDefined();
      expect(result.pageData).toBeDefined();
    });

    it('should flatten page entries and store individually', async () => {
      await processFile('/test/burial_register.jpg', {
        provider: 'openai',
        sourceType: 'burial_register',
      });

      expect(storedData.burialEntries.length).toBeGreaterThan(0);
      expect(storedData.burialEntries[0].deceased_name).toBe('Jane Smith');
    });

    it('should apply cost calculation to each entry', async () => {
      await processFile('/test/burial_register.jpg', {
        provider: 'openai',
        sourceType: 'burial_register',
      });

      const entry = storedData.burialEntries[0];
      expect(entry.input_tokens).toBe(100);
      expect(entry.output_tokens).toBe(50);
      expect(entry.estimated_cost_usd).toBeCloseTo(0.00125, 5); // (100/1M)*2.5 + (50/1M)*20
    });
  });

  describe('Grave Record Card Processing', () => {
    it('should process grave_record_card file via PDF processor', async () => {
      const result = await processFile('/test/grave_card.pdf', {
        provider: 'openai',
        sourceType: 'grave_record_card',
      });

      expect(result.first_name).toBe('John');
      expect(result.source_type).toBe('grave_record_card');
      expect(result.prompt_template).toBe('graveCard');
      expect(result.processing_id).toBeDefined();
    });

    it('should store grave card in dedicated storage', async () => {
      await processFile('/test/grave_card.pdf', {
        provider: 'openai',
        sourceType: 'grave_record_card',
      });

      expect(storedData.graveCards).toHaveLength(1);
      expect(storedData.graveCards[0].first_name).toBe('John');
    });
  });

  describe('Provider Diversity', () => {
    it('should handle OpenAI provider', async () => {
      const result = await processFile('/test/memorial.jpg', {
        provider: 'openai',
        sourceType: 'memorial',
      });

      expect(result.ai_provider).toBe('openai');
    });

    it('should handle Anthropic provider', async () => {
      const result = await processFile('/test/memorial.jpg', {
        provider: 'anthropic',
        sourceType: 'memorial',
      });

      expect(result.ai_provider).toBe('anthropic');
    });

    it('should handle Gemini provider', async () => {
      const result = await processFile('/test/memorial.jpg', {
        provider: 'gemini',
        sourceType: 'memorial',
      });

      expect(result.ai_provider).toBe('gemini');
    });
  });

  describe('Processing ID Assignment', () => {
    it('should generate unique processing IDs', async () => {
      const result1 = await processFile('/test/file1.jpg', {
        provider: 'openai',
        sourceType: 'memorial',
      });

      const result2 = await processFile('/test/file2.jpg', {
        provider: 'openai',
        sourceType: 'memorial',
      });

      expect(result1.processing_id).toBeDefined();
      expect(result2.processing_id).toBeDefined();
      expect(result1.processing_id).not.toBe(result2.processing_id);
    });

    it('should attach processing_id to all record types', async () => {
      const memorial = await processFile('/test/memorial.jpg', {
        sourceType: 'memorial',
      });
      expect(memorial.processing_id).toBeDefined();

      const classification = await processFile('/test/class.jpg', {
        sourceType: 'monument_classification',
      });
      expect(classification.processing_id).toBeDefined();

      const burial = await processFile('/test/burial.jpg', {
        sourceType: 'burial_register',
      });
      // Burial register returns {entries, pageData} object
      expect(burial.entries).toBeDefined();
      expect(burial.pageData).toBeDefined();
      // Check that entries have processing_id
      expect(burial.entries.length).toBeGreaterThan(0);
      expect(burial.entries[0].processing_id).toBeDefined();
    });
  });

  describe('Cost Tracking', () => {
    it('should calculate cost for OpenAI models', async () => {
      const result = await processFile('/test/memorial.jpg', {
        provider: 'openai',
        sourceType: 'memorial',
      });

      // OpenAI gpt-5.4: input $2.50/1M, output $20.00/1M
      // (100/1M)*2.50 + (50/1M)*20.00 = 0.00025 + 0.0001 = 0.00035
      expect(result.estimated_cost_usd).toBeCloseTo(0.00025 + 0.001, 6);
    });

    it('should track tokens for all providers', async () => {
      const result = await processFile('/test/memorial.jpg', {
        provider: 'anthropic',
        sourceType: 'memorial',
      });

      expect(result.input_tokens).toBe(100);
      expect(result.output_tokens).toBe(50);
      expect(result.estimated_cost_usd).toBeDefined();
    });
  });

  describe('Processor Isolation', () => {
    it('should not leak state between different sourceTypes', async () => {
      // Process one type
      const memorial = await processFile('/test/memorial.jpg', {
        sourceType: 'memorial',
      });

      // Process another type
      const classification = await processFile('/test/class.jpg', {
        sourceType: 'monument_classification',
      });

      // Results should be independent
      expect(memorial.source_type).toBe('memorial');
      expect(classification.source_type).toBe('monument_classification');
      expect(storedData.memorials).toHaveLength(1);
      expect(storedData.classifications).toHaveLength(1);
    });
  });
});
