// Mock dependencies
const mockFs = {
  promises: {
    readFile: jest.fn(),
    unlink: jest.fn()
  },
  existsSync: jest.fn().mockReturnValue(true),
  mkdirSync: jest.fn()
};

// Mock functions
const mockGetProviderPrompt = jest.fn().mockReturnValue('test prompt');
const mockValidateAndConvert = jest.fn();
const mockProcessImage = jest.fn();
const mockGetModelVersion = jest.fn().mockReturnValue('test-model-v1');

// Store original env
const originalEnv = process.env;

jest.mock('fs', () => mockFs);
jest.mock('../../src/utils/modelProviders', () => ({
  createProvider: jest.fn().mockReturnValue({
    processImage: mockProcessImage,
    getModelVersion: mockGetModelVersion
  })
}));
jest.mock('../../src/utils/database', () => ({
  storeMemorial: jest.fn()
}));
jest.mock('../../src/utils/prompts/templates/providerTemplates', () => ({
  getPrompt: jest.fn().mockReturnValue({
    getProviderPrompt: mockGetProviderPrompt,
    validateAndConvert: mockValidateAndConvert,
    version: '1.0'
  })
}));
jest.mock('../../src/utils/logger');
jest.mock('../../src/utils/imageProcessor', () => ({
  analyzeImageForProvider: jest.fn().mockResolvedValue({
    needsOptimization: false,
    reasons: []
  }),
  optimizeImageForProvider: jest.fn().mockResolvedValue('optimized-base64-data')
}));
jest.mock('../../src/utils/graveCardStorage', () => ({
  initialize: jest.fn().mockResolvedValue(undefined),
  storeGraveCard: jest.fn().mockResolvedValue(1),
  exportCardsToCsv: jest.fn().mockResolvedValue('')
}));
jest.mock('../../src/utils/imageProcessing/graveCardProcessor', () => ({
  processPdf: jest.fn().mockResolvedValue(Buffer.from('stitched-image-data'))
}));
jest.mock('../../src/utils/monumentClassificationStorage', () => ({
  initialize: jest.fn().mockResolvedValue(undefined),
  storeClassification: jest.fn().mockResolvedValue(1)
}));
jest.mock('../../config.json', () => ({
  dbPath: 'test/db',
  uploadPath: 'test/uploads',
  degenerateDetection: {
    enabled: true,
    ccrThreshold: 0.4,
    minEntropy: 1.5,
    lengthRatioMin: 0.2,
    minLengthForEntropy: 20,
    minLengthForLengthRatio: 20,
    minExpectedBySourceType: {
      memorial: 40
    }
  }
}), { virtual: true });

const { processFile } = require('../../src/utils/fileProcessing.js');
const { createProvider } = require('../../src/utils/modelProviders');
const { storeMemorial } = require('../../src/utils/database');
const { getPrompt } = require('../../src/utils/prompts/templates/providerTemplates');

describe('File Processing Module', () => {
  const mockBase64Image = 'base64encodedimage';
  const mockFilePath = 'test/image.jpg';
  const mockExtractedData = {
    memorial_number: '123',
    first_name: 'John',
    last_name: 'Doe',
    year_of_death: '1900',
    inscription: 'Test inscription'
  };

  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();

    // Reset env
    process.env = { ...originalEnv };
    delete process.env.AI_PROVIDER;

    // Setup default mock implementations
    mockFs.promises.readFile.mockResolvedValue(mockBase64Image);
    mockFs.promises.unlink.mockResolvedValue();
    mockProcessImage.mockResolvedValue({ content: mockExtractedData, usage: { input_tokens: 0, output_tokens: 0 } });
    mockValidateAndConvert.mockReturnValue({
      data: mockExtractedData,
      confidenceScores: {},
      validationWarnings: []
    });
    storeMemorial.mockResolvedValue();
  });

  afterAll(() => {
    // Restore env
    process.env = originalEnv;
  });

  describe('Basic Functionality', () => {
    test('processes a file with default options', async () => {
      const result = await processFile(mockFilePath);

      expect(result).toEqual(expect.objectContaining({
        memorial_number: '123',
        first_name: 'John',
        last_name: 'Doe',
        year_of_death: '1900',
        inscription: 'Test inscription',
        fileName: 'image.jpg',
        ai_provider: 'openai',
        model_version: 'test-model-v1',
        prompt_version: '1.0'
      }));

      expect(mockFs.promises.readFile).toHaveBeenCalledWith(mockFilePath, { encoding: 'base64' });
      expect(createProvider).toHaveBeenCalled();
      expect(storeMemorial).toHaveBeenCalled();
      expect(mockFs.promises.unlink).toHaveBeenCalledWith(mockFilePath);
    });

    test('uses specified provider from options', async () => {
      await processFile(mockFilePath, { provider: 'anthropic' });

      expect(createProvider).toHaveBeenCalledWith(expect.objectContaining({
        AI_PROVIDER: 'anthropic'
      }));
    });

    test('uses provider from environment variable', async () => {
      process.env.AI_PROVIDER = 'anthropic';
      const result = await processFile(mockFilePath);

      expect(result.ai_provider).toBe('anthropic');
      expect(createProvider).toHaveBeenCalledWith(expect.objectContaining({
        AI_PROVIDER: 'anthropic'
      }));
    });

    test('routes to typographic analysis prompt when source type matches', async () => {
      await processFile(mockFilePath, { sourceType: 'typographic_analysis' });

      expect(getPrompt).toHaveBeenCalledWith('openai', 'typographicAnalysis', 'latest');
    });
  });

  describe('Error Handling', () => {
    test('handles file read errors', async () => {
      mockFs.promises.readFile.mockRejectedValue(new Error('File not found'));

      await expect(processFile(mockFilePath))
        .rejects
        .toThrow('File not found');
    });

    test('handles provider processing errors', async () => {
      mockProcessImage.mockRejectedValue(new Error('API error'));

      await expect(processFile(mockFilePath))
        .rejects
        .toThrow('API error');
    });

    test('handles database storage errors', async () => {
      storeMemorial.mockRejectedValue(new Error('Database error'));

      await expect(processFile(mockFilePath))
        .rejects
        .toThrow('Database error');
    });

    test('marks validation errors as fatal after retries exhausted', async () => {
      const { FatalError } = require('../../src/utils/errorTypes');
      const validationError = new Error('Invalid JSON response');
      mockValidateAndConvert.mockImplementation(() => {
        throw validationError;
      });
      mockProcessImage.mockResolvedValue({ content: 'invalid', usage: { input_tokens: 0, output_tokens: 0 } });

      const error = await processFile(mockFilePath).catch((e) => e);
      expect(error).toBeInstanceOf(FatalError);
      expect(error.type).toBe('validation_exhausted');
      expect(error.fatal).toBe(true);
    });

    test('empty sheet errors are returned as error result, not fatal', async () => {
      const { ProcessingError } = require('../../src/utils/errorTypes');
      const emptySheetError = new ProcessingError('Sheet is empty', 'empty_sheet');
      mockValidateAndConvert.mockImplementation(() => {
        throw emptySheetError;
      });
      mockProcessImage.mockResolvedValue({ content: '', usage: { input_tokens: 0, output_tokens: 0 } });

      const result = await processFile(mockFilePath);
      expect(result.error).toBe(true);
      expect(result.errorType).toBe('empty_sheet');
      expect(result.fatal).not.toBe(true);
    });
  });

  describe('Data Validation', () => {
    test('validates and converts extracted data', async () => {
      const mockRawData = {
        memorial_number: '123',
        first_name: 'JOHN',
        last_name: 'DOE',
        year_of_death: '1900',
        inscription: 'RAW INSCRIPTION'
      };

      mockProcessImage.mockResolvedValue({ content: mockRawData, usage: { input_tokens: 0, output_tokens: 0 } });

      await processFile(mockFilePath);

      expect(getPrompt).toHaveBeenCalled();
      expect(mockValidateAndConvert).toHaveBeenCalledWith(mockRawData);
    });

    test('adds degenerate output warning when raw response is hallucination-like', async () => {
      mockProcessImage.mockResolvedValue({
        content: '@@@@ #### $$$$ %%%%',
        usage: { input_tokens: 0, output_tokens: 0 }
      });
      mockValidateAndConvert.mockReturnValue({
        data: { ...mockExtractedData },
        confidenceScores: {},
        validationWarnings: []
      });

      const result = await processFile(mockFilePath);

      expect(result.validation_warnings).toEqual(
        expect.arrayContaining([expect.stringContaining('DEGENERATE_OUTPUT')])
      );
      expect(result.needs_review).toBe(1);
    });
  });

  describe('Monument photo: memorial number injection', () => {
    // filename 'stja-0006_1757350406869.jpg' → getMemorialNumberForMonument extracts '0006'
    const monumentFilePath = 'test/stja-0006_1757350406869.jpg';
    const expectedInjectedNumber = '0006';
    const baseValidatedResult = { first_name: 'JOHN', last_name: 'DOE' };

    beforeEach(() => {
      mockFs.promises.readFile.mockResolvedValue(mockBase64Image);
      mockFs.promises.unlink.mockResolvedValue();
      mockValidateAndConvert.mockReturnValue({
        data: baseValidatedResult,
        confidenceScores: {},
        validationWarnings: []
      });
      storeMemorial.mockResolvedValue();
    });

    test('injects filename number when OCR returns null', async () => {
      mockProcessImage.mockResolvedValue({ content: { memorial_number: null, first_name: 'JOHN' }, usage: { input_tokens: 0, output_tokens: 0 } });
      await processFile(monumentFilePath, { sourceType: 'monument_photo' });
      const data = mockValidateAndConvert.mock.calls[0][0];
      expect(data.memorial_number).toBe(expectedInjectedNumber);
    });

    test('injects filename number when OCR returns "N/A" placeholder', async () => {
      mockProcessImage.mockResolvedValue({ content: { memorial_number: 'N/A', first_name: 'JOHN' }, usage: { input_tokens: 0, output_tokens: 0 } });
      await processFile(monumentFilePath, { sourceType: 'monument_photo' });
      const data = mockValidateAndConvert.mock.calls[0][0];
      expect(data.memorial_number).toBe(expectedInjectedNumber);
    });

    test('injects filename number when OCR returns lowercase "n/a"', async () => {
      mockProcessImage.mockResolvedValue({ content: { memorial_number: 'n/a', first_name: 'JOHN' }, usage: { input_tokens: 0, output_tokens: 0 } });
      await processFile(monumentFilePath, { sourceType: 'monument_photo' });
      const data = mockValidateAndConvert.mock.calls[0][0];
      expect(data.memorial_number).toBe(expectedInjectedNumber);
    });

    test('injects filename number when OCR returns confidence wrapper with null value', async () => {
      mockProcessImage.mockResolvedValue({
        content: { memorial_number: { value: null, confidence: 0.3 }, first_name: 'JOHN' },
        usage: { input_tokens: 0, output_tokens: 0 }
      });
      await processFile(monumentFilePath, { sourceType: 'monument_photo' });
      const data = mockValidateAndConvert.mock.calls[0][0];
      expect(data.memorial_number).toBe(expectedInjectedNumber);
    });

    test('injects filename number when OCR returns confidence wrapper with "N/A" value', async () => {
      mockProcessImage.mockResolvedValue({
        content: { memorial_number: { value: 'N/A', confidence: 0.2 }, first_name: 'JOHN' },
        usage: { input_tokens: 0, output_tokens: 0 }
      });
      await processFile(monumentFilePath, { sourceType: 'monument_photo' });
      const data = mockValidateAndConvert.mock.calls[0][0];
      expect(data.memorial_number).toBe(expectedInjectedNumber);
    });

    test('preserves valid OCR memorial number (plain string)', async () => {
      mockProcessImage.mockResolvedValue({ content: { memorial_number: '42', first_name: 'JOHN' }, usage: { input_tokens: 0, output_tokens: 0 } });
      await processFile(monumentFilePath, { sourceType: 'monument_photo' });
      const data = mockValidateAndConvert.mock.calls[0][0];
      expect(data.memorial_number).toBe('42');
    });

    test('preserves valid OCR memorial number from confidence wrapper', async () => {
      mockProcessImage.mockResolvedValue({
        content: { memorial_number: { value: '42', confidence: 0.85 }, first_name: 'JOHN' },
        usage: { input_tokens: 0, output_tokens: 0 }
      });
      await processFile(monumentFilePath, { sourceType: 'monument_photo' });
      const data = mockValidateAndConvert.mock.calls[0][0];
      expect(data.memorial_number).toEqual({ value: '42', confidence: 0.85 });
    });
  });

  describe('Validation failure retry', () => {
    const testFilePath = 'test/image.jpg';

    beforeEach(() => {
      mockFs.promises.readFile.mockResolvedValue(mockBase64Image);
      mockFs.promises.unlink.mockResolvedValue();
      storeMemorial.mockResolvedValue();
    });

    test('retries on validation failure and succeeds on second attempt', async () => {
      const validationError = new Error('Invalid JSON');
      mockValidateAndConvert
        .mockImplementationOnce(() => {
          throw validationError;
        })
        .mockImplementationOnce(() => ({
          data: mockExtractedData,
          confidenceScores: {},
          validationWarnings: []
        }));

      mockProcessImage.mockResolvedValue({ content: mockExtractedData, usage: { input_tokens: 0, output_tokens: 0 } });

      const result = await processFile(testFilePath);

      expect(result).toEqual(expect.objectContaining(mockExtractedData));
      expect(mockProcessImage).toHaveBeenCalledTimes(2);
      expect(mockValidateAndConvert).toHaveBeenCalledTimes(2);
    });

    test('retry prompt includes format-enforcement preamble', async () => {
      const validationError = new Error('Parse error');
      mockValidateAndConvert
        .mockImplementationOnce(() => {
          throw validationError;
        })
        .mockImplementationOnce(() => ({
          data: mockExtractedData,
          confidenceScores: {},
          validationWarnings: []
        }));

      mockProcessImage.mockResolvedValue({ content: mockExtractedData, usage: { input_tokens: 0, output_tokens: 0 } });

      await processFile(testFilePath);

      // Check that the second call to processImage includes the preamble
      const secondCall = mockProcessImage.mock.calls[1];
      expect(secondCall[1]).toContain('IMPORTANT: Your previous response could not be parsed');
      expect(secondCall[1]).toContain('Return ONLY valid JSON');
    });

    test('both attempts fail — error is thrown', async () => {
      const validationError = new Error('Persistent validation failure');
      mockValidateAndConvert.mockImplementation(() => {
        throw validationError;
      });

      mockProcessImage.mockResolvedValue({ content: mockExtractedData, usage: { input_tokens: 0, output_tokens: 0 } });

      await expect(processFile(testFilePath)).rejects.toThrow('Persistent validation failure');
      expect(mockProcessImage).toHaveBeenCalledTimes(2);
      expect(mockValidateAndConvert).toHaveBeenCalledTimes(2);
    });

    test('empty sheet error is NOT retried', async () => {
      const emptySheetError = new Error('No readable text found');
      emptySheetError.type = 'empty_sheet';
      mockValidateAndConvert.mockImplementation(() => {
        throw emptySheetError;
      });

      mockProcessImage.mockResolvedValue({ content: mockExtractedData, usage: { input_tokens: 0, output_tokens: 0 } });

      const result = await processFile(testFilePath);

      expect(result).toEqual(expect.objectContaining({
        error: true,
        errorType: 'empty_sheet'
      }));
      expect(mockProcessImage).toHaveBeenCalledTimes(1);
      expect(mockValidateAndConvert).toHaveBeenCalledTimes(1);
    });

    test('grave card retries on validation failure', async () => {
      const graveCardProcessor = require('../../src/utils/imageProcessing/graveCardProcessor');
      const graveCardStorage = require('../../src/utils/graveCardStorage');
      const gravCardData = { burial_date: '2020-01-01', first_name: 'John' };

      const validationError = new Error('Invalid grave card format');
      mockValidateAndConvert
        .mockImplementationOnce(() => {
          throw validationError;
        })
        .mockImplementationOnce(() => ({
          data: gravCardData,
          confidenceScores: {},
          validationWarnings: []
        }));

      mockProcessImage.mockResolvedValue({ content: gravCardData, usage: { input_tokens: 100, output_tokens: 50 } });

      const result = await processFile('test/grave.pdf', { sourceType: 'grave_record_card' });

      expect(result).toEqual(expect.objectContaining(gravCardData));
      expect(mockProcessImage).toHaveBeenCalledTimes(2);
      expect(mockValidateAndConvert).toHaveBeenCalledTimes(2);
      expect(graveCardStorage.storeGraveCard).toHaveBeenCalled();
    });
  });

  describe('Confidence coverage and needs_review logic', () => {
    const testFilePath = 'test/image.jpg';

    beforeEach(() => {
      mockFs.promises.readFile.mockResolvedValue(mockBase64Image);
      mockFs.promises.unlink.mockResolvedValue();
      storeMemorial.mockResolvedValue();
    });

    test('does NOT flag needs_review when all confidence scores are null (scalar responses)', async () => {
      const dataWithNullConfidence = {
        data: {
          ...mockExtractedData
        },
        confidenceScores: {
          memorial_number: null,
          first_name: null,
          last_name: null,
          year_of_death: null,
          inscription: null
        },
        validationWarnings: []
      };
      mockValidateAndConvert.mockReturnValue(dataWithNullConfidence);
      mockProcessImage.mockResolvedValue({ content: dataWithNullConfidence, usage: { input_tokens: 0, output_tokens: 0 } });

      const result = await processFile(testFilePath);

      expect(result.needs_review).toBe(0);
      expect(result.confidence_coverage).toBe(0);
    });

    test('sets confidence_coverage to 0 when all scores are null', async () => {
      const dataWithNullConfidence = {
        data: {
          ...mockExtractedData
        },
        confidenceScores: {
          memorial_number: null,
          first_name: null
        },
        validationWarnings: []
      };
      mockValidateAndConvert.mockReturnValue(dataWithNullConfidence);
      mockProcessImage.mockResolvedValue({ content: mockExtractedData, usage: { input_tokens: 0, output_tokens: 0 } });

      const result = await processFile(testFilePath);

      expect(result.confidence_coverage).toBe(0);
    });

    test('flags needs_review when any score is explicitly below threshold', async () => {
      const dataWithLowConfidence = {
        data: {
          ...mockExtractedData
        },
        confidenceScores: {
          memorial_number: 0.95,
          first_name: 0.5,
          last_name: 0.85,
          year_of_death: 0.80,
          inscription: 0.92
        },
        validationWarnings: []
      };
      mockValidateAndConvert.mockReturnValue(dataWithLowConfidence);
      mockProcessImage.mockResolvedValue({ content: dataWithLowConfidence, usage: { input_tokens: 0, output_tokens: 0 } });

      const result = await processFile(testFilePath);

      expect(result.needs_review).toBe(1);
      expect(result.confidence_coverage).toBe(1.0);
    });

    test('does NOT flag needs_review when all scores are above threshold', async () => {
      const dataWithHighConfidence = {
        data: {
          ...mockExtractedData
        },
        confidenceScores: {
          memorial_number: 0.95,
          first_name: 0.92,
          last_name: 0.88,
          year_of_death: 0.90,
          inscription: 0.89
        },
        validationWarnings: []
      };
      mockValidateAndConvert.mockReturnValue(dataWithHighConfidence);
      mockProcessImage.mockResolvedValue({ content: dataWithHighConfidence, usage: { input_tokens: 0, output_tokens: 0 } });

      const result = await processFile(testFilePath);

      expect(result.needs_review).toBe(0);
      expect(result.confidence_coverage).toBe(1.0);
    });

    test('handles mixed null and low confidence — flags review for low, coverage is partial', async () => {
      const dataMixedNull = {
        data: {
          ...mockExtractedData
        },
        confidenceScores: {
          memorial_number: null,
          first_name: 0.5,
          last_name: null,
          year_of_death: 0.85,
          inscription: null
        },
        validationWarnings: []
      };
      mockValidateAndConvert.mockReturnValue(dataMixedNull);
      mockProcessImage.mockResolvedValue({ content: dataMixedNull, usage: { input_tokens: 0, output_tokens: 0 } });

      const result = await processFile(testFilePath);

      expect(result.needs_review).toBe(1);
      expect(result.confidence_coverage).toBe(0.4);
    });

    test('handles mixed null and high confidence — no review flag, partial coverage', async () => {
      const dataMixedNull = {
        data: {
          ...mockExtractedData
        },
        confidenceScores: {
          memorial_number: null,
          first_name: 0.92,
          last_name: null,
          year_of_death: 0.95,
          inscription: null
        },
        validationWarnings: []
      };
      mockValidateAndConvert.mockReturnValue(dataMixedNull);
      mockProcessImage.mockResolvedValue({ content: dataMixedNull, usage: { input_tokens: 0, output_tokens: 0 } });

      const result = await processFile(testFilePath);

      expect(result.needs_review).toBe(0);
      expect(result.confidence_coverage).toBe(0.4);
    });

    test('validation_warnings still force needs_review = 1 regardless of confidence', async () => {
      const dataWithWarnings = {
        data: {
          ...mockExtractedData
        },
        confidenceScores: {
          memorial_number: 0.95,
          first_name: 0.92,
          last_name: 0.88,
          year_of_death: 0.90,
          inscription: 0.89
        },
        validationWarnings: ['IDENTICAL_NAMES: first_name and last_name are the same value']
      };
      mockValidateAndConvert.mockReturnValue(dataWithWarnings);
      mockProcessImage.mockResolvedValue({ content: dataWithWarnings, usage: { input_tokens: 0, output_tokens: 0 } });

      const result = await processFile(testFilePath);

      expect(result.needs_review).toBe(1);
      expect(result.validation_warnings).toBeDefined();
    });
  });

  describe('Duplicate handling', () => {
    const testFilePath = 'test/duplicate.jpg';

    beforeEach(() => {
      mockFs.promises.readFile.mockResolvedValue(mockBase64Image);
      mockFs.promises.unlink.mockResolvedValue();
    });

    test('handles duplicate memorial gracefully', async () => {
      // Mock storeMemorial to reject with isDuplicate error
      const duplicateError = new Error('Duplicate entry: memorial already exists for file test/duplicate.jpg');
      duplicateError.isDuplicate = true;
      storeMemorial.mockRejectedValue(duplicateError);

      mockValidateAndConvert.mockReturnValue({
        data: mockExtractedData,
        confidenceScores: {},
        validationWarnings: []
      });
      mockProcessImage.mockResolvedValue({ content: mockExtractedData, usage: { input_tokens: 100, output_tokens: 50 } });

      const result = await processFile(testFilePath);

      expect(result).toEqual(expect.objectContaining({
        error: true,
        errorType: 'duplicate'
      }));
      expect(result.errorMessage).toContain('Duplicate');
      expect(mockFs.promises.unlink).toHaveBeenCalledWith(testFilePath);
    });

    test('handles duplicate grave card gracefully', async () => {
      // Mock graveCardStorage.storeGraveCard to reject with isDuplicate error
      const graveCardStorage = require('../../src/utils/graveCardStorage');
      const duplicateError = new Error('Duplicate entry: grave card already exists for file test/grave.pdf');
      duplicateError.isDuplicate = true;
      graveCardStorage.storeGraveCard.mockRejectedValue(duplicateError);

      mockValidateAndConvert.mockReturnValue({
        data: { burial_date: '2020-01-01', first_name: 'John' },
        confidenceScores: {},
        validationWarnings: []
      });
      mockProcessImage.mockResolvedValue({ content: { burial_date: '2020-01-01' }, usage: { input_tokens: 100, output_tokens: 50 } });

      const result = await processFile('test/grave.pdf', { sourceType: 'grave_record_card' });

      expect(result).toEqual(expect.objectContaining({
        error: true,
        errorType: 'duplicate'
      }));
      expect(result.errorMessage).toContain('Duplicate');
    });
  });

  describe('Monument classification', () => {
    const monumentClassificationStorage = require('../../src/utils/monumentClassificationStorage');
    const testFilePath = 'test/image.jpg';
    const mockMonumentData = {
      broad_type: 'Headstone',
      memorial_number: '123',
      material_primary: 'Granite',
      height_mm: 1200,
      confidence_level: 'High'
    };

    beforeEach(() => {
      mockFs.promises.readFile.mockResolvedValue(mockBase64Image);
      mockFs.promises.unlink.mockResolvedValue();
      monumentClassificationStorage.storeClassification.mockResolvedValue(1);
      mockValidateAndConvert.mockReturnValue({
        data: mockMonumentData,
        confidenceScores: { confidence_level: 1.0 },
        validationWarnings: []
      });
      mockProcessImage.mockResolvedValue({ content: mockMonumentData, usage: { input_tokens: 1500, output_tokens: 500 } });
    });

    test('selects monumentClassification template when sourceType is monument_classification', async () => {
      await processFile(testFilePath, { sourceType: 'monument_classification' });

      expect(getPrompt).toHaveBeenCalledWith('openai', 'monumentClassification', 'latest');
    });

    test('stores result via monumentClassificationStorage.storeClassification', async () => {
      const result = await processFile(testFilePath, { sourceType: 'monument_classification' });

      expect(monumentClassificationStorage.storeClassification).toHaveBeenCalled();
      expect(result.broad_type).toBe('Headstone');
    });

    test('attaches cost tracking metadata', async () => {
      const result = await processFile(testFilePath, { sourceType: 'monument_classification' });

      expect(result.input_tokens).toBe(1500);
      expect(result.output_tokens).toBe(500);
      expect(result.estimated_cost_usd).toBeDefined();
    });

    test('attaches processing_id to classification', async () => {
      const result = await processFile(testFilePath, { sourceType: 'monument_classification' });

      expect(result.processing_id).toBeDefined();
      expect(typeof result.processing_id).toBe('string');
      expect(result.processing_id.length).toBeGreaterThan(0);
    });

    test('maps confidence_level Low to needs_review = 1', async () => {
      mockValidateAndConvert.mockReturnValue({
        data: { ...mockMonumentData, confidence_level: 'Low' },
        confidenceScores: { confidence_level: 0.3 },
        validationWarnings: []
      });
      mockProcessImage.mockResolvedValue({
        content: { ...mockMonumentData, confidence_level: 'Low' },
        usage: { input_tokens: 1500, output_tokens: 500 }
      });

      const result = await processFile(testFilePath, { sourceType: 'monument_classification' });

      expect(result.needs_review).toBe(1);
    });

    test('reads image file directly (no PDF processing)', async () => {
      await processFile(testFilePath, { sourceType: 'monument_classification' });

      expect(mockFs.promises.readFile).toHaveBeenCalledWith(testFilePath, { encoding: 'base64' });
    });

    test('cleans up file after processing', async () => {
      await processFile(testFilePath, { sourceType: 'monument_classification' });

      expect(mockFs.promises.unlink).toHaveBeenCalledWith(testFilePath);
    });
  });
}); 
