// Mock logger BEFORE requiring processingHelpers
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  debugPayload: jest.fn(),
}));

const mockLogger = require('../../src/utils/logger');

const {
  applyConfidenceMetadata,
  applyDegenerateDetection,
  applyDisagreementScore,
  applyValidationWarnings,
  injectCostData,
  attachCommonMetadata,
  buildErrorResult,
  processWithValidationRetry,
  calculateCost,
  scopedLogger,
} = require('../../src/utils/processingHelpers');

const { FatalError, ProcessingError } = require('../../src/utils/errorTypes');

describe('processingHelpers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('applyConfidenceMetadata', () => {
    it('should apply confidence metadata when enabled', () => {
      const data = {};
      const confidenceScores = { field1: 0.95, field2: 0.65 };
      const config = { confidence: { enabled: true, reviewThreshold: 0.70 } };

      applyConfidenceMetadata(data, confidenceScores, config);

      expect(data.confidence_scores).toEqual(confidenceScores);
      expect(data.confidence_coverage).toBe(1.0); // 2/2 numeric scores
      expect(data.needs_review).toBe(1); // field2 < 0.70
    });

    it('should not apply confidence when disabled', () => {
      const data = {};
      const confidenceScores = { field1: 0.95 };
      const config = { confidence: { enabled: false } };

      applyConfidenceMetadata(data, confidenceScores, config);

      expect(data.confidence_scores).toBeUndefined();
      expect(data.confidence_coverage).toBeUndefined();
      expect(data.needs_review).toBeUndefined();
    });

    it('should handle null/undefined confidence scores', () => {
      const data = {};
      const config = { confidence: { enabled: true, reviewThreshold: 0.70 } };

      applyConfidenceMetadata(data, null, config);
      expect(data.confidence_scores).toBeUndefined();

      applyConfidenceMetadata(data, undefined, config);
      expect(data.confidence_scores).toBeUndefined();
    });

    it('should calculate coverage correctly with mixed scores', () => {
      const data = {};
      const confidenceScores = { field1: 0.95, field2: 'N/A', field3: 0.50 };
      const config = { confidence: { enabled: true, reviewThreshold: 0.70 } };

      applyConfidenceMetadata(data, confidenceScores, config);

      expect(data.confidence_coverage).toBe(2 / 3); // 2 numeric out of 3 total
      expect(data.needs_review).toBe(1); // field3 < 0.70
    });

    it('should set needs_review=0 when all scores >= threshold', () => {
      const data = {};
      const confidenceScores = { field1: 0.95, field2: 0.80 };
      const config = { confidence: { enabled: true, reviewThreshold: 0.70 } };

      applyConfidenceMetadata(data, confidenceScores, config);

      expect(data.needs_review).toBe(0);
    });
  });

  describe('applyValidationWarnings', () => {
    it('should apply validation warnings and force needs_review', () => {
      const data = { needs_review: 0 };
      const warnings = ['Field X has identical values', 'Age is implausible'];

      applyValidationWarnings(data, warnings);

      expect(data.validation_warnings).toEqual(warnings);
      expect(data.needs_review).toBe(1);
    });

    it('should not apply empty warnings array', () => {
      const data = { needs_review: 0 };

      applyValidationWarnings(data, []);

      expect(data.validation_warnings).toBeUndefined();
      expect(data.needs_review).toBe(0);
    });

    it('should handle null/undefined warnings', () => {
      const data = {};

      applyValidationWarnings(data, null);
      expect(data.validation_warnings).toBeUndefined();

      applyValidationWarnings(data, undefined);
      expect(data.validation_warnings).toBeUndefined();
    });
  });

  describe('injectCostData', () => {
    it('should inject cost data correctly', () => {
      const data = {};
      const usage = { input_tokens: 1000, output_tokens: 500 };
      const config = {
        costs: {
          openai: {
            'gpt-5.4': { inputPerMToken: 2.50, outputPerMToken: 20.00 },
          },
        },
      };

      injectCostData(data, usage, 'openai', 'gpt-5.4', config);

      expect(data.input_tokens).toBe(1000);
      expect(data.output_tokens).toBe(500);
      expect(data.estimated_cost_usd).toBeCloseTo(
        (1000 / 1_000_000) * 2.50 + (500 / 1_000_000) * 20.00
      );
    });

    it('should handle missing cost config gracefully', () => {
      const data = {};
      const usage = { input_tokens: 1000, output_tokens: 500 };
      const config = { costs: {} };

      injectCostData(data, usage, 'openai', 'unknown-model', config);

      expect(data.input_tokens).toBe(1000);
      expect(data.output_tokens).toBe(500);
      expect(data.estimated_cost_usd).toBe(0);
    });
  });

  describe('attachCommonMetadata', () => {
    it('should attach all metadata fields', () => {
      const data = {};
      const metadata = {
        fileName: 'test.jpg',
        providerName: 'openai',
        modelVersion: 'gpt-5.4',
        promptTemplate: 'memorialOCR',
        promptVersion: 'v1.0',
        sourceType: 'memorial',
        processingId: 'uuid-123',
      };

      attachCommonMetadata(data, metadata);

      expect(data.fileName).toBe('test.jpg');
      expect(data.ai_provider).toBe('openai');
      expect(data.model_version).toBe('gpt-5.4');
      expect(data.prompt_template).toBe('memorialOCR');
      expect(data.prompt_version).toBe('v1.0');
      expect(data.source_type).toBe('memorial');
      expect(data.processing_id).toBe('uuid-123');
    });
  });

  describe('buildErrorResult', () => {
    it('should build duplicate error result', () => {
      const result = buildErrorResult('file.jpg', {
        errorType: 'duplicate',
        errorMessage: 'Duplicate entry',
        providerName: 'openai',
        modelVersion: 'gpt-5.4',
        sourceType: 'memorial',
        processingId: 'uuid-123',
      });

      expect(result.fileName).toBe('file.jpg');
      expect(result.error).toBe(true);
      expect(result.errorType).toBe('duplicate');
      expect(result.errorMessage).toBe('Duplicate entry');
      expect(result.ai_provider).toBe('openai');
      expect(result.model_version).toBe('gpt-5.4');
      expect(result.source_type).toBe('memorial');
      expect(result.processing_id).toBe('uuid-123');
    });

    it('should build empty_sheet error result', () => {
      const result = buildErrorResult('file.jpg', {
        errorType: 'empty_sheet',
        errorMessage: 'Sheet is empty',
        providerName: 'anthropic',
        modelVersion: 'claude-opus-4-6',
        sourceType: 'burial_register',
        processingId: 'uuid-456',
      });

      expect(result.errorType).toBe('empty_sheet');
      expect(result.errorMessage).toBe('Sheet is empty');
    });
  });

  describe('calculateCost', () => {
    it('should calculate cost correctly', () => {
      const usage = { input_tokens: 1000, output_tokens: 500 };
      const costConfig = { inputPerMToken: 2.50, outputPerMToken: 20.00 };

      const cost = calculateCost(usage, costConfig);

      expect(cost).toBeCloseTo(
        (1000 / 1_000_000) * 2.50 + (500 / 1_000_000) * 20.00
      );
    });

    it('should handle zero tokens', () => {
      const usage = { input_tokens: 0, output_tokens: 0 };
      const costConfig = { inputPerMToken: 2.50, outputPerMToken: 20.00 };

      const cost = calculateCost(usage, costConfig);

      expect(cost).toBe(0);
    });

    it('should handle missing cost config values', () => {
      const usage = { input_tokens: 1000, output_tokens: 500 };
      const costConfig = {};

      const cost = calculateCost(usage, costConfig);

      expect(cost).toBe(0);
    });

    it('should apply cache write and cache read rates for Anthropic cache tokens', () => {
      const usage = {
        input_tokens: 500,
        output_tokens: 200,
        cache_creation_input_tokens: 300,
        cache_read_input_tokens: 400,
      };
      const costConfig = {
        inputPerMToken: 5.00,
        outputPerMToken: 25.00,
        cacheWritePerMToken: 6.25,
        cacheReadPerMToken: 0.50,
      };

      const cost = calculateCost(usage, costConfig);

      const expected =
        (500 / 1_000_000) * 5.00 +
        (300 / 1_000_000) * 6.25 +
        (400 / 1_000_000) * 0.50 +
        (200 / 1_000_000) * 25.00;
      expect(cost).toBeCloseTo(expected);
    });

    it('should apply cachedInputPerMToken for OpenAI cached tokens', () => {
      const usage = {
        input_tokens: 800,
        output_tokens: 100,
        cache_read_input_tokens: 600,
      };
      const costConfig = {
        inputPerMToken: 2.50,
        outputPerMToken: 20.00,
        cachedInputPerMToken: 1.25,
      };

      const cost = calculateCost(usage, costConfig);

      const expected =
        (800 / 1_000_000) * 2.50 +
        (600 / 1_000_000) * 1.25 +
        (100 / 1_000_000) * 20.00;
      expect(cost).toBeCloseTo(expected);
    });

    it('should fall back to inputPerMToken when no cache-specific rates are set', () => {
      const usage = {
        input_tokens: 1000,
        output_tokens: 500,
        cache_creation_input_tokens: 200,
        cache_read_input_tokens: 300,
      };
      const costConfig = { inputPerMToken: 2.50, outputPerMToken: 20.00 };

      const cost = calculateCost(usage, costConfig);

      const expected =
        (1000 / 1_000_000) * 2.50 +
        (200 / 1_000_000) * 2.50 +
        (300 / 1_000_000) * 2.50 +
        (500 / 1_000_000) * 20.00;
      expect(cost).toBeCloseTo(expected);
    });
  });

  describe('scopedLogger', () => {
    it('should return a logger-like object with all required methods', () => {
      const log = scopedLogger('abcdef123456');

      expect(log).toHaveProperty('info');
      expect(log).toHaveProperty('warn');
      expect(log).toHaveProperty('error');
      expect(log).toHaveProperty('debug');
      expect(log).toHaveProperty('debugPayload');
      expect(typeof log.info).toBe('function');
      expect(typeof log.warn).toBe('function');
      expect(typeof log.error).toBe('function');
      expect(typeof log.debug).toBe('function');
      expect(typeof log.debugPayload).toBe('function');
    });

    it('should create proper tag from processing ID', () => {
      const log1 = scopedLogger('abcdef123456');
      const log2 = scopedLogger('xyz789abcd');

      // Both should successfully call without throwing
      expect(() => log1.info('test')).not.toThrow();
      expect(() => log2.warn('test')).not.toThrow();
    });
  });

  describe('processWithValidationRetry', () => {
    it('should return result on first attempt success', async () => {
      const mockProvider = {
        processImage: jest.fn().mockResolvedValue({
          content: JSON.stringify({ field: 'value' }),
          usage: { input_tokens: 100, output_tokens: 50 },
        }),
      };

      const validateFn = jest.fn().mockReturnValue({
        data: { field: 'value' },
        confidenceScores: {},
      });

      const result = await processWithValidationRetry(
        mockProvider,
        'base64data',
        'user prompt',
        { log: mockLogger },
        validateFn
      );

      expect(result.validationResult.data.field).toBe('value');
      expect(result.rawResponse).toBe(JSON.stringify({ field: 'value' }));
      expect(mockProvider.processImage).toHaveBeenCalledTimes(1);
      expect(validateFn).toHaveBeenCalledTimes(1);
    });

    it('should retry on validation failure and inject preamble', async () => {
      const mockProvider = {
        processImage: jest
          .fn()
          .mockResolvedValueOnce({
            content: 'invalid json',
            usage: { input_tokens: 100, output_tokens: 50 },
          })
          .mockResolvedValueOnce({
            content: JSON.stringify({ field: 'value' }),
            usage: { input_tokens: 100, output_tokens: 50 },
          }),
      };

      const validateFn = jest
        .fn()
        .mockImplementationOnce(() => {
          throw new Error('Invalid JSON');
        })
        .mockReturnValueOnce({
          data: { field: 'value' },
          confidenceScores: {},
        });

      const result = await processWithValidationRetry(
        mockProvider,
        'base64data',
        'original prompt',
        { log: mockLogger },
        validateFn,
        { maxRetries: 1 }
      );

      expect(result.validationResult.data.field).toBe('value');
      expect(mockProvider.processImage).toHaveBeenCalledTimes(2);
      // Check that second call includes preamble
      expect(mockProvider.processImage.mock.calls[1][1]).toContain(
        'IMPORTANT: Your previous response could not be parsed'
      );
    });

    it('should never retry empty-sheet errors', async () => {
      const emptySheetError = new ProcessingError('Sheet is empty', 'empty_sheet');

      const mockProvider = {
        processImage: jest.fn().mockResolvedValue({
          content: '',
          usage: { input_tokens: 100, output_tokens: 50 },
        }),
      };

      const validateFn = jest.fn().mockImplementation(() => {
        throw emptySheetError;
      });

      await expect(
        processWithValidationRetry(
          mockProvider,
          'base64data',
          'user prompt',
          { log: mockLogger },
          validateFn,
          { maxRetries: 2 }
        )
      ).rejects.toThrow('Sheet is empty');

      expect(mockProvider.processImage).toHaveBeenCalledTimes(1);
    });

    it('should wrap final validation errors as fatal', async () => {
      const validationError = new Error('Parse failed');

      const mockProvider = {
        processImage: jest.fn().mockResolvedValue({
          content: 'invalid',
          usage: { input_tokens: 100, output_tokens: 50 },
        }),
      };

      const validateFn = jest
        .fn()
        .mockImplementation(() => {
          throw validationError;
        });

      await expect(
        processWithValidationRetry(
          mockProvider,
          'base64data',
          'user prompt',
          { log: mockLogger },
          validateFn,
          { maxRetries: 0 }
        )
      ).rejects.toThrow(FatalError);
    });
  });

  describe('applyDegenerateDetection', () => {
    const detectorConfig = {
      degenerateDetection: {
        enabled: true,
        ccrThreshold: 0.4,
        minEntropy: 1.5,
        lengthRatioMin: 0.2,
        minLengthForEntropy: 20,
        minLengthForLengthRatio: 20,
        minExpectedBySourceType: {
          memorial: 40,
        },
      },
    };

    it('adds warning strings when degenerate output is detected', () => {
      const data = {};

      applyDegenerateDetection(data, '@@@@ #### $$$$ %%%%', 'memorial', detectorConfig);

      expect(data._validation_warnings).toHaveLength(1);
      expect(data._validation_warnings[0]).toContain('DEGENERATE_OUTPUT');
      expect(data._validation_warnings[0]).toContain('HIGH_CCR');
      expect(data.degenerate_output_metrics.ccr).toBeGreaterThan(0.4);
    });

    it('does not add warnings for normal text', () => {
      const data = {};

      applyDegenerateDetection(
        data,
        'In loving memory of John Smith who died 12 March 1901 aged 76 years.',
        'memorial',
        detectorConfig
      );

      expect(data._validation_warnings).toBeUndefined();
      expect(data.degenerate_output_metrics).toBeDefined();
    });
  });

  describe('applyDisagreementScore', () => {
    const enabledConfig = { activeLearning: { enabled: true } };
    const disabledConfig = { activeLearning: { enabled: false } };

    it('sets disagreement_score based on confidence scores and warnings', () => {
      const data = {
        confidence_scores: { a: 0.9, b: 0.6 },
        validation_warnings: ['WARN1'],
      };
      applyDisagreementScore(data, enabledConfig);
      // minConf = 0.6, 1 warning → 0.6 * 0.8 = 0.48
      expect(data.disagreement_score).toBeCloseTo(0.48, 5);
    });

    it('sets disagreement_score to null when no scores and no warnings', () => {
      const data = {};
      applyDisagreementScore(data, enabledConfig);
      expect(data.disagreement_score).toBeNull();
    });

    it('does not set disagreement_score when activeLearning is disabled', () => {
      const data = { confidence_scores: { a: 0.5 }, validation_warnings: [] };
      applyDisagreementScore(data, disabledConfig);
      expect(data.disagreement_score).toBeUndefined();
    });

    it('sets disagreement_score when no warnings, only scores', () => {
      const data = { confidence_scores: { a: 0.75, b: 0.95 } };
      applyDisagreementScore(data, enabledConfig);
      expect(data.disagreement_score).toBe(0.75);
    });
  });
});
