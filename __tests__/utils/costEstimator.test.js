const CostEstimator = require('../../src/utils/costEstimator');

describe('CostEstimator', () => {
  let mockDb;
  let mockConfig;
  let estimator;

  beforeEach(() => {
    // Mock database
    mockDb = {
      get: jest.fn(),
      all: jest.fn(),
    };

    // Mock config with cost rates
    mockConfig = {
      openAI: { model: 'gpt-5.4' },
      anthropic: { model: 'claude-opus-4-6' },
      gemini: { model: 'gemini-3.1-pro-preview' },
      costs: {
        openai: {
          'gpt-5.4': { inputPerMToken: 2.5, outputPerMToken: 20.0 },
        },
        anthropic: {
          'claude-opus-4-6': { inputPerMToken: 5.0, outputPerMToken: 25.0 },
          'claude-sonnet-4-5': { inputPerMToken: 3.0, outputPerMToken: 15.0 },
          'claude-haiku-4-5': { inputPerMToken: 1.0, outputPerMToken: 5.0 },
        },
        gemini: {
          'gemini-3.1-pro-preview': { inputPerMToken: 1.25, outputPerMToken: 5.0 },
          'gemini-2.5-flash': { inputPerMToken: 0.075, outputPerMToken: 0.3 },
        },
        maxCostPerSession: 5.0,
      },
    };

    estimator = new CostEstimator(mockDb, mockConfig);
  });

  describe('constructor', () => {
    it('creates instance with db and config', () => {
      expect(estimator.db).toBe(mockDb);
      expect(estimator.config).toBe(mockConfig);
    });
  });

  describe('getHistoricalAverages', () => {
    it('returns averages for memorial source types from memorials table', async () => {
      mockDb.get.mockImplementation((sql, params, cb) => {
        if (sql.includes('FROM memorials')) {
          cb(null, {
            avg_input_tokens: 1200,
            avg_output_tokens: 850,
            sample_size: 42,
          });
        }
      });

      const result = await estimator.getHistoricalAverages('record_sheet', 'anthropic');

      expect(result.avgInputTokens).toBe(1200);
      expect(result.avgOutputTokens).toBe(850);
      expect(result.sampleSize).toBe(42);
    });

    it('returns averages for burial_register from burial_register_entries (grouped by file)', async () => {
      mockDb.get.mockImplementation((sql, params, cb) => {
        if (sql.includes('burial_register_entries')) {
          cb(null, {
            avg_input_tokens: 3100,
            avg_output_tokens: 2050,
            sample_size: 28,
          });
        }
      });

      const result = await estimator.getHistoricalAverages('burial_register', 'openai');

      expect(result.avgInputTokens).toBe(3100);
      expect(result.avgOutputTokens).toBe(2050);
      expect(result.sampleSize).toBe(28);
    });

    it('returns averages for grave_record_card from grave_cards table', async () => {
      mockDb.get.mockImplementation((sql, params, cb) => {
        if (sql.includes('FROM grave_cards')) {
          cb(null, {
            avg_input_tokens: 4200,
            avg_output_tokens: 2600,
            sample_size: 15,
          });
        }
      });

      const result = await estimator.getHistoricalAverages('grave_record_card', 'anthropic');

      expect(result.avgInputTokens).toBe(4200);
      expect(result.avgOutputTokens).toBe(2600);
      expect(result.sampleSize).toBe(15);
    });

    it('returns zero averages when no historical data exists', async () => {
      mockDb.get.mockImplementation((sql, params, cb) => {
        cb(null, null);
      });

      const result = await estimator.getHistoricalAverages('monument_classification', 'gemini');

      expect(result.avgInputTokens).toBe(0);
      expect(result.avgOutputTokens).toBe(0);
      expect(result.sampleSize).toBe(0);
    });

    it('filters by ai_provider correctly', async () => {
      mockDb.get.mockImplementation((sql, params, cb) => {
        cb(null, { avg_input_tokens: 1500, avg_output_tokens: 800, sample_size: 10 });
      });

      await estimator.getHistoricalAverages('record_sheet', 'openai');

      // Provider is bound as the first query parameter.
      expect(mockDb.get.mock.calls[0][1][0]).toBe('openai');
    });
  });

  describe('estimateBatchCost', () => {
    it('uses historical averages when available', async () => {
      mockDb.get.mockImplementation((sql, params, cb) => {
        cb(null, {
          avg_input_tokens: 2000,
          avg_output_tokens: 1000,
          sample_size: 50,
        });
      });

      const result = await estimator.estimateBatchCost({
        fileCount: 10,
        provider: 'anthropic',
        sourceType: 'record_sheet',
      });

      expect(result.isDefault).toBe(false);
      expect(result.sampleSize).toBe(50);
      // Cost: (2000/1M * 5.0) + (1000/1M * 25.0) = 0.01 + 0.025 = 0.035 per file
      // Total: 0.035 * 10 = $0.35
      expect(result.estimatedTotalCost).toBeCloseTo(0.35, 2);
    });

    it('falls back to defaults when no historical data exists', async () => {
      mockDb.get.mockImplementation((sql, params, cb) => {
        cb(null, null);
      });

      const result = await estimator.estimateBatchCost({
        fileCount: 10,
        provider: 'anthropic',
        sourceType: 'record_sheet',
      });

      expect(result.isDefault).toBe(true);
      expect(result.sampleSize).toBe(0);
      // Defaults: 1500 input, 800 output
      // Cost: (1500/1M * 5.0) + (800/1M * 25.0) = 0.0075 + 0.02 = 0.0275 per file
      // Total: 0.0275 * 10 = $0.275 (rounds to $0.28)
      expect(result.estimatedTotalCost).toBeCloseTo(0.28, 1);
    });

    it('applies PDF page multiplier (3x) to non-grave-card source types', async () => {
      mockDb.get.mockImplementation((sql, params, cb) => {
        cb(null, {
          avg_input_tokens: 1000,
          avg_output_tokens: 500,
          sample_size: 20,
        });
      });

      const result = await estimator.estimateBatchCost({
        fileCount: 10,
        provider: 'anthropic',
        sourceType: 'record_sheet',
        pdfCount: 5, // 5 PDFs * 3 pages = 15; 5 JPEGs = 5; total = 20
      });

      expect(result.effectiveFileCount).toBe(20);
      // Cost per file: (1000/1M * 5.0) + (500/1M * 25.0) = 0.005 + 0.0125 = 0.0175
      // Total: 0.0175 * 20 = $0.35
      expect(result.estimatedTotalCost).toBeCloseTo(0.35, 2);
    });

    it('does NOT apply PDF multiplier for grave_record_card source type', async () => {
      mockDb.get.mockImplementation((sql, params, cb) => {
        cb(null, {
          avg_input_tokens: 4000,
          avg_output_tokens: 2500,
          sample_size: 15,
        });
      });

      const result = await estimator.estimateBatchCost({
        fileCount: 10,
        provider: 'anthropic',
        sourceType: 'grave_record_card',
        pdfCount: 5, // No multiplier for grave cards
      });

      expect(result.effectiveFileCount).toBe(10); // No multiplier applied
      // Cost per file: (4000/1M * 5.0) + (2500/1M * 25.0) = 0.02 + 0.0625 = 0.0825
      // Total: 0.0825 * 10 = $0.825 (rounds to $0.83)
      expect(result.estimatedTotalCost).toBeCloseTo(0.83, 1);
    });

    it('calculates exceedsCap correctly', async () => {
      mockDb.get.mockImplementation((sql, params, cb) => {
        cb(null, null); // Use defaults
      });

      const result = await estimator.estimateBatchCost({
        fileCount: 250, // Large batch
        provider: 'anthropic',
        sourceType: 'burial_register',
      });

      expect(result.exceedsCap).toBe(true);
      expect(result.sessionCap).toBe(5.0);
    });

    it('calculates pctOfCap correctly', async () => {
      mockDb.get.mockImplementation((sql, params, cb) => {
        cb(null, null);
      });

      const result = await estimator.estimateBatchCost({
        fileCount: 50,
        provider: 'anthropic',
        sourceType: 'record_sheet',
      });

      // Defaults: 1500/800, cost = 0.0275 per file
      // Total: 1.375, pctOfCap: (1.375 / 5.0) * 100 = 27.5%
      expect(result.pctOfCap).toBeCloseTo(27.5, 1);
    });

    it('resolves correct model name for each provider', async () => {
      mockDb.get.mockImplementation((sql, params, cb) => {
        cb(null, null);
      });

      const result = await estimator.estimateBatchCost({
        fileCount: 5,
        provider: 'anthropic',
        sourceType: 'record_sheet',
      });

      expect(result.model).toBe('claude-opus-4-6');
    });

    it('returns isDefault: false when using historical data', async () => {
      mockDb.get.mockImplementation((sql, params, cb) => {
        cb(null, {
          avg_input_tokens: 2000,
          avg_output_tokens: 1000,
          sample_size: 100,
        });
      });

      const result = await estimator.estimateBatchCost({
        fileCount: 10,
        provider: 'openai',
        sourceType: 'monument_photo',
      });

      expect(result.isDefault).toBe(false);
    });

    it('handles fileCount of 0 gracefully', async () => {
      mockDb.get.mockImplementation((sql, params, cb) => {
        cb(null, null);
      });

      const result = await estimator.estimateBatchCost({
        fileCount: 0,
        provider: 'anthropic',
        sourceType: 'record_sheet',
      });

      expect(result.estimatedTotalCost).toBe(0);
      expect(result.effectiveFileCount).toBe(0);
    });

    it('returns complete estimate object with disclaimer and metadata', async () => {
      mockDb.get.mockImplementation((sql, params, cb) => {
        cb(null, {
          avg_input_tokens: 1500,
          avg_output_tokens: 800,
          sample_size: 30,
        });
      });

      const result = await estimator.estimateBatchCost({
        fileCount: 20,
        provider: 'gemini',
        sourceType: 'record_sheet',
      });

      expect(result).toHaveProperty('estimatedTotalCost');
      expect(result).toHaveProperty('estimatedPerFileCost');
      expect(result).toHaveProperty('effectiveFileCount');
      expect(result).toHaveProperty('sessionCap');
      expect(result).toHaveProperty('exceedsCap');
      expect(result).toHaveProperty('pctOfCap');
      expect(result).toHaveProperty('provider');
      expect(result).toHaveProperty('model');
      expect(result).toHaveProperty('sampleSize');
      expect(result).toHaveProperty('isDefault');
      expect(result).toHaveProperty('disclaimer');
      expect(result.disclaimer).toContain('approximate');
    });

    it('maps custom schema source types to record_sheet defaults', async () => {
      mockDb.get.mockImplementation((sql, params, cb) => {
        cb(null, null); // No historical data
      });

      const result = await estimator.estimateBatchCost({
        fileCount: 5,
        provider: 'anthropic',
        sourceType: 'custom:abc123',
      });

      expect(result.isDefault).toBe(true);
      // Should use record_sheet defaults: 1500/800
      expect(result.estimatedPerFileCost).toBeCloseTo(0.0275, 4);
    });

    it('uses correct default tokens for burial_register', async () => {
      mockDb.get.mockImplementation((sql, params, cb) => {
        cb(null, null);
      });

      const result = await estimator.estimateBatchCost({
        fileCount: 5,
        provider: 'anthropic',
        sourceType: 'burial_register',
      });

      expect(result.isDefault).toBe(true);
      // Defaults: 3000 input, 2000 output
      // Cost: (3000/1M * 5.0) + (2000/1M * 25.0) = 0.015 + 0.05 = 0.065 per file
      // Total: 0.065 * 5 = $0.325
      expect(result.estimatedTotalCost).toBeCloseTo(0.325, 1);
    });

    it('uses correct default tokens for grave_record_card', async () => {
      mockDb.get.mockImplementation((sql, params, cb) => {
        cb(null, null);
      });

      const result = await estimator.estimateBatchCost({
        fileCount: 3,
        provider: 'anthropic',
        sourceType: 'grave_record_card',
      });

      expect(result.isDefault).toBe(true);
      // Defaults: 4000 input, 2500 output
      // Cost: (4000/1M * 5.0) + (2500/1M * 25.0) = 0.02 + 0.0625 = 0.0825 per file
      // Total: 0.0825 * 3 = $0.2475, rounds to $0.25
      expect(result.estimatedTotalCost).toBeCloseTo(0.25, 2);
    });
  });
});
