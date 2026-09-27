const { processFile } = require('../fileProcessing');
const { ProcessingError } = require('../errorTypes');

// Mock dependencies
const fs = require('fs');
jest.mock('fs', () => {
  return {
    promises: {
      readFile: jest.fn().mockResolvedValue('base64Image'),
      unlink: jest.fn().mockResolvedValue(undefined)
    }
  };
});

jest.mock('../logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debugPayload: jest.fn()
}));

jest.mock('../database', () => ({
  storeMemorial: jest.fn().mockResolvedValue(true)
}));

jest.mock('../modelProviders', () => ({
  createProvider: jest.fn()
}));

jest.mock('../prompts/templates/providerTemplates', () => ({
  getPrompt: jest.fn()
}));

jest.mock('../imageProcessor', () => ({
  analyzeImageForProvider: jest.fn().mockResolvedValue({
    needsOptimization: false,
    reasons: []
  }),
  optimizeImageForProvider: jest.fn().mockResolvedValue('optimized-base64-data')
}));

jest.mock('../imageProcessing/graveCardProcessor', () => ({
  processPdf: jest.fn().mockResolvedValue(Buffer.from('stitched-image-data'))
}));

jest.mock('../graveCardStorage', () => ({
  storeGraveCard: jest.fn().mockResolvedValue(1)
}));

describe('Enhanced File Processing with Error Handling', () => {
  let mockProvider;
  let mockPrompt;
  let mockProviderResponse;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Setup mocks
    mockProviderResponse = {
      memorial_number: 'HG-123',
      first_name: 'JOHN',
      last_name: 'DOE',
      year_of_death: 1950,
      inscription: 'Rest in peace'
    };

    mockProvider = {
      processImage: jest.fn().mockResolvedValue({ content: mockProviderResponse, usage: { input_tokens: 100, output_tokens: 50 } }),
      getModelVersion: jest.fn().mockReturnValue('mock-model-1.0')
    };

    mockPrompt = {
      getProviderPrompt: jest.fn().mockReturnValue({ systemPrompt: 'test', userPrompt: 'test' }),
      validateAndConvert: jest.fn().mockReturnValue({
        data: mockProviderResponse,
        confidenceScores: {},
        validationWarnings: []
      }),
      version: '1.0.0'
    };

    // Setup module mocks
    const { createProvider } = require('../modelProviders');
    createProvider.mockReturnValue(mockProvider);

    const { getPrompt } = require('../prompts/templates/providerTemplates');
    getPrompt.mockReturnValue(mockPrompt);
  });

  it('should process a file successfully', async () => {
    const result = await processFile('test.jpg');

    expect(result).toEqual(expect.objectContaining({
      memorial_number: 'HG-123',
      first_name: 'JOHN',
      last_name: 'DOE'
    }));
    expect(fs.promises.unlink).toHaveBeenCalledWith('test.jpg');
  });

  it('should handle empty sheet errors by returning an error result instead of throwing', async () => {
    // Mock the prompt validator to throw an empty sheet error
    const emptySheetError = new ProcessingError(
      'No readable text found on the sheet',
      'empty_sheet',
      'test.jpg'
    );
    mockPrompt.validateAndConvert.mockImplementation(() => {
      throw emptySheetError;
    });

    const result = await processFile('test.jpg');

    // Should return error info rather than throwing
    expect(result).toEqual({
      fileName: 'test.jpg',
      error: true,
      errorType: 'empty_sheet',
      errorMessage: 'No readable text found on the sheet',
      ai_provider: expect.any(String), // Accept any string for the provider
      model_version: 'mock-model-1.0',
      source_type: 'record_sheet', // Default source_type
      processing_id: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i) // UUID v4
    });

    // Should still clean up the file
    expect(fs.promises.unlink).toHaveBeenCalledWith('test.jpg');
  });

  it('should still throw non-empty-sheet errors', async () => {
    // Mock the prompt validator to throw a different type of error
    const validationError = new ProcessingError(
      'Invalid name format',
      'validation',
      'test.jpg'
    );
    mockPrompt.validateAndConvert.mockImplementation(() => {
      throw validationError;
    });

    await expect(processFile('test.jpg')).rejects.toThrow('Invalid name format');
    expect(fs.promises.unlink).not.toHaveBeenCalled(); // Should not clean up file on error
  });

  describe('Grave Record Card Processing', () => {
    let mockGraveCardPrompt;
    let mockGraveCardData;

    beforeEach(() => {
      // Get references to the mocked modules
      const graveCardProcessor = require('../imageProcessing/graveCardProcessor');
      const graveCardStorage = require('../graveCardStorage');

      // Mock grave card data matching GraveRecord schema
      mockGraveCardData = {
        location: {
          section: 'A',
          grave_number: '123'
        },
        grave: {
          status: 'occupied',
          number_buried: 2
        },
        interments: [
          {
            name: {
              full_name: 'John Doe'
            },
            date_of_death: {
              iso: '1950-01-15',
              raw_text: '15 Jan 1950'
            }
          }
        ],
        inscription: {
          text: 'Rest in peace'
        }
      };

      // Mock GraveCardPrompt
      mockGraveCardPrompt = {
        getProviderPrompt: jest.fn().mockReturnValue({
          systemPrompt: 'Grave card system prompt',
          userPrompt: 'Grave card user prompt'
        }),
        validateAndConvert: jest.fn().mockReturnValue({
          data: mockGraveCardData,
          confidenceScores: {},
          validationWarnings: []
        }),
        version: '1.0.0'
      };

      // Reset the mocks for grave card processor and storage
      graveCardProcessor.processPdf.mockClear();
      graveCardProcessor.processPdf.mockResolvedValue(Buffer.from('stitched-image-data'));

      graveCardStorage.storeGraveCard.mockClear();
      graveCardStorage.storeGraveCard.mockResolvedValue(1);

      // Override getPrompt to return GraveCardPrompt for graveCard template
      const { getPrompt } = require('../prompts/templates/providerTemplates');
      getPrompt.mockImplementation((provider, template) => {
        if (template === 'graveCard') {
          return mockGraveCardPrompt;
        }
        return mockPrompt; // Return default mock for other templates
      });
    });

    it('should process grave record card through complete pipeline', async () => {
      const pdfPath = 'test-grave-card.pdf';
      const graveCardProcessor = require('../imageProcessing/graveCardProcessor');
      const graveCardStorage = require('../graveCardStorage');

      const result = await processFile(pdfPath, {
        sourceType: 'grave_record_card',
        provider: 'openai'
      });

      // Verify GraveCardProcessor was called
      expect(graveCardProcessor.processPdf).toHaveBeenCalledWith(pdfPath);

      // Verify provider received stitched buffer (converted to base64)
      expect(mockProvider.processImage).toHaveBeenCalledWith(
        expect.any(String), // base64 encoded stitched buffer
        expect.any(String), // user prompt
        expect.objectContaining({
          systemPrompt: expect.any(String),
          promptTemplate: mockGraveCardPrompt
        })
      );

      // Verify GraveCardPrompt was used (processImage returns { content, usage }, content is what validateAndConvert receives)
      expect(mockGraveCardPrompt.validateAndConvert).toHaveBeenCalledWith(mockProviderResponse);

      // Verify storage was called with validated data
      expect(graveCardStorage.storeGraveCard).toHaveBeenCalledWith(
        expect.objectContaining({
          ...mockGraveCardData,
          fileName: 'test-grave-card.pdf',
          ai_provider: 'openai',
          model_version: 'mock-model-1.0'
        })
      );

      // Note: GraveCardProcessor handles file cleanup, so fs.unlink should NOT be called

      // Verify return value
      expect(result).toEqual(
        expect.objectContaining({
          location: mockGraveCardData.location,
          grave: mockGraveCardData.grave,
          fileName: 'test-grave-card.pdf'
        })
      );
    });

    it('should handle processor failure and rethrow error', async () => {
      const pdfPath = 'test-grave-card-invalid.pdf';
      const processorError = new Error('Invalid page count: Expected 2 pages, found 3');
      const graveCardProcessor = require('../imageProcessing/graveCardProcessor');
      const graveCardStorage = require('../graveCardStorage');

      graveCardProcessor.processPdf.mockRejectedValue(processorError);

      await expect(processFile(pdfPath, {
        sourceType: 'grave_record_card'
      })).rejects.toThrow('Invalid page count: Expected 2 pages, found 3');

      // Verify processor was called
      expect(graveCardProcessor.processPdf).toHaveBeenCalledWith(pdfPath);

      // Verify storage was NOT called
      expect(graveCardStorage.storeGraveCard).not.toHaveBeenCalled();

      // Verify provider was NOT called (processor failed before this step)
      expect(mockProvider.processImage).not.toHaveBeenCalled();
    });
  });
}); 