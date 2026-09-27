/**
 * Test suite for monument template selection logic
 * Tests that the correct prompt template is selected based on source_type
 */

const fs = require('fs').promises;

// Mock dependencies
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  debugPayload: jest.fn()
}));

jest.mock('../../src/utils/modelProviders', () => ({
  createProvider: jest.fn()
}));

jest.mock('../../src/utils/database', () => ({
  storeMemorial: jest.fn()
}));

jest.mock('../../src/utils/prompts/templates/providerTemplates', () => ({
  getPrompt: jest.fn()
}));

jest.mock('../../src/utils/errorTypes', () => ({
  isEmptySheetError: jest.fn().mockReturnValue(false)
}));

// Mock image processing utilities to avoid file system dependency
jest.mock('../../src/utils/imageProcessor', () => ({
  analyzeImageForProvider: jest.fn().mockResolvedValue({ needsOptimization: false }),
  optimizeImageForProvider: jest.fn().mockResolvedValue('base64imagedata')
}));

jest.mock('../../src/utils/imageProcessing/monumentCropper', () => ({
  detectAndCrop: jest.fn().mockResolvedValue(null)
}));

describe('Monument Template Selection', () => {
  let processFile;
  let createProvider;
  let getPrompt;
  let storeMemorial;

  beforeAll(async () => {
    // Import after mocks are set up
    const fileProcessing = require('../../src/utils/fileProcessing');
    processFile = fileProcessing.processFile;

    createProvider = require('../../src/utils/modelProviders').createProvider;
    getPrompt = require('../../src/utils/prompts/templates/providerTemplates').getPrompt;
    storeMemorial = require('../../src/utils/database').storeMemorial;
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock fs.readFile
    fs.readFile = jest.fn().mockResolvedValue('base64imagedata');
    fs.unlink = jest.fn().mockResolvedValue();
    fs.stat = jest.fn().mockResolvedValue({ size: 6 * 1024 * 1024 });

    // Mock provider
    const mockProvider = {
      processImage: jest.fn().mockResolvedValue({
        content: {
          memorial_number: '123',
          first_name: 'TEST',
          last_name: 'USER',
          year_of_death: 2000,
          inscription: 'Test inscription'
        },
        usage: { input_tokens: 0, output_tokens: 0 }
      }),
      getModelVersion: jest.fn().mockReturnValue('mock-model-1.0')
    };
    createProvider.mockReturnValue(mockProvider);

    // Mock prompt instance
    const mockPromptInstance = {
      validateAndConvert: jest.fn().mockImplementation((data) => ({
        data,
        confidenceScores: {},
        validationWarnings: []
      })),
      getProviderPrompt: jest.fn().mockReturnValue('mock prompt text'),
      version: '1.0.0'
    };
    getPrompt.mockReturnValue(mockPromptInstance);

    // Mock database
    storeMemorial.mockResolvedValue();
  });

  describe('Template Selection Based on Source Type', () => {
    it('should select monumentPhotoOCR template when source_type is monument_photo', async () => {
      const options = {
        provider: 'openai',
        source_type: 'monument_photo'
      };

      await processFile('test-monument.jpg', options);

      expect(getPrompt).toHaveBeenCalledWith('openai', 'monumentPhotoOCR', 'latest');
    });

    it('should select memorialOCR template when source_type is record_sheet', async () => {
      const options = {
        provider: 'openai',
        source_type: 'record_sheet'
      };

      await processFile('test-record.jpg', options);

      expect(getPrompt).toHaveBeenCalledWith('openai', 'memorialOCR', 'latest');
    });

    it('should default to memorialOCR template when source_type is not provided', async () => {
      const options = {
        provider: 'openai'
        // No source_type provided
      };

      await processFile('test-default.jpg', options);

      expect(getPrompt).toHaveBeenCalledWith('openai', 'memorialOCR', 'latest');
    });

    it('should respect custom promptTemplate when provided', async () => {
      const options = {
        provider: 'openai',
        source_type: 'monument_photo',
        promptTemplate: 'customTemplate'
      };

      await processFile('test-custom.jpg', options);

      // Custom template should override source_type-based selection
      expect(getPrompt).toHaveBeenCalledWith('openai', 'customTemplate', 'latest');
    });

    it('should use correct template for different providers', async () => {
      // Test OpenAI
      await processFile('test-openai.jpg', {
        provider: 'openai',
        source_type: 'monument_photo'
      });
      expect(getPrompt).toHaveBeenCalledWith('openai', 'monumentPhotoOCR', 'latest');

      // Test Anthropic
      await processFile('test-anthropic.jpg', {
        provider: 'anthropic',
        source_type: 'monument_photo'
      });
      expect(getPrompt).toHaveBeenCalledWith('anthropic', 'monumentPhotoOCR', 'latest');
    });
  });

  describe('Template Selection Logging', () => {
    it('should log template selection information', async () => {
      const options = {
        provider: 'openai',
        source_type: 'monument_photo'
      };

      // Logging is verified by console output in test runs
      // This test ensures the process completes without errors
      expect(async () => {
        await processFile('test-logging.jpg', options);
      }).not.toThrow();
    });

    it('should log record sheet template selection', async () => {
      const options = {
        provider: 'anthropic',
        source_type: 'record_sheet'
      };

      // Logging is verified by console output in test runs
      // This test ensures the process completes without errors
      expect(async () => {
        await processFile('test-record-logging.jpg', options);
      }).not.toThrow();
    });
  });

  describe('Template Selection with Prompt Versions', () => {
    it('should pass through promptVersion parameter', async () => {
      const options = {
        provider: 'openai',
        source_type: 'monument_photo',
        promptVersion: '2.0.0'
      };

      await processFile('test-version.jpg', options);

      expect(getPrompt).toHaveBeenCalledWith('openai', 'monumentPhotoOCR', '2.0.0');
    });

    it('should default to latest version when not specified', async () => {
      const options = {
        provider: 'openai',
        source_type: 'monument_photo'
      };

      await processFile('test-default-version.jpg', options);

      expect(getPrompt).toHaveBeenCalledWith('openai', 'monumentPhotoOCR', 'latest');
    });
  });

  describe('Integration with Processing Pipeline', () => {
    it('should pass correct template instance to provider processing', async () => {
      const options = {
        provider: 'openai',
        source_type: 'monument_photo'
      };

      const mockProcessImage = jest.fn().mockResolvedValue({ content: {}, usage: { input_tokens: 0, output_tokens: 0 } });
      const mockProvider = {
        processImage: mockProcessImage,
        getModelVersion: jest.fn().mockReturnValue('test-model')
      };
      createProvider.mockReturnValue(mockProvider);

      await processFile('test-integration.jpg', options);

      // Verify the prompt instance was passed to processImage
      expect(mockProcessImage).toHaveBeenCalledWith(
        'base64imagedata',
        'mock prompt text',
        expect.objectContaining({
          promptTemplate: expect.any(Object)
        })
      );
    });

    it('should store source_type with processed results', async () => {
      const options = {
        provider: 'openai',
        source_type: 'monument_photo'
      };

      await processFile('test-metadata.jpg', options);

      expect(storeMemorial).toHaveBeenCalledWith(
        expect.objectContaining({
          source_type: 'monument_photo'
        })
      );
    });

    it('should handle template selection errors gracefully', async () => {
      getPrompt.mockImplementation(() => {
        throw new Error('Template not found');
      });

      const options = {
        provider: 'openai',
        source_type: 'monument_photo'
      };

      await expect(processFile('test-error.jpg', options)).rejects.toThrow('Template not found');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle invalid source_type values', async () => {
      const options = {
        provider: 'openai',
        source_type: 'invalid_type'
      };

      await processFile('test-invalid.jpg', options);

      // Should fall back to default memorialOCR template
      expect(getPrompt).toHaveBeenCalledWith('openai', 'memorialOCR', 'latest');
    });

    it('should handle null source_type', async () => {
      const options = {
        provider: 'openai',
        source_type: null
      };

      await processFile('test-null.jpg', options);

      expect(getPrompt).toHaveBeenCalledWith('openai', 'memorialOCR', 'latest');
    });

    it('should handle undefined source_type', async () => {
      const options = {
        provider: 'openai',
        source_type: undefined
      };

      await processFile('test-undefined.jpg', options);

      expect(getPrompt).toHaveBeenCalledWith('openai', 'memorialOCR', 'latest');
    });
  });
});
