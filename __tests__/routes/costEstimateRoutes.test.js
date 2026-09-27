const request = require('supertest');
const express = require('express');
const costEstimateRoutes = require('../../src/routes/costEstimateRoutes');
const CostEstimator = require('../../src/utils/costEstimator');

jest.mock('../../src/utils/costEstimator');

describe('Cost Estimate Routes', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/cost-estimate', costEstimateRoutes);
    jest.clearAllMocks();
  });

  describe('GET /api/cost-estimate', () => {
    it('returns 400 if fileCount is missing', async () => {
      const response = await request(app).get('/api/cost-estimate?provider=anthropic&sourceType=record_sheet');
      expect(response.status).toBe(400);
      expect(response.body.error).toContain('fileCount');
    });

    it('returns 400 if provider is missing', async () => {
      const response = await request(app).get('/api/cost-estimate?fileCount=10&sourceType=record_sheet');
      expect(response.status).toBe(400);
      expect(response.body.error).toContain('provider');
    });

    it('returns 400 if sourceType is missing', async () => {
      const response = await request(app).get('/api/cost-estimate?fileCount=10&provider=anthropic');
      expect(response.status).toBe(400);
      expect(response.body.error).toContain('sourceType');
    });

    it('returns 400 if fileCount is not a positive integer', async () => {
      const response = await request(app).get('/api/cost-estimate?fileCount=-5&provider=anthropic&sourceType=record_sheet');
      expect(response.status).toBe(400);
    });

    it('returns 400 if provider is invalid', async () => {
      const response = await request(app).get('/api/cost-estimate?fileCount=10&provider=invalid_provider&sourceType=record_sheet');
      expect(response.status).toBe(400);
      expect(response.body.error).toContain('provider');
    });

    it('returns 200 with valid parameters', async () => {
      const mockEstimate = {
        estimatedTotalCost: 0.35,
        estimatedPerFileCost: 0.035,
        effectiveFileCount: 10,
        sessionCap: 5.0,
        exceedsCap: false,
        pctOfCap: 7,
        provider: 'anthropic',
        model: 'claude-opus-4-6',
        sampleSize: 50,
        isDefault: false,
        disclaimer: 'Estimates are approximate.',
      };

      CostEstimator.mockImplementation(() => ({
        estimateBatchCost: jest.fn().mockResolvedValue(mockEstimate),
      }));

      const response = await request(app).get('/api/cost-estimate?fileCount=10&provider=anthropic&sourceType=record_sheet');
      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockEstimate);
    });

    it('handles pdfCount parameter correctly', async () => {
      const mockEstimate = {
        estimatedTotalCost: 0.35,
        estimatedPerFileCost: 0.035,
        effectiveFileCount: 25,
        sessionCap: 5.0,
        exceedsCap: false,
        pctOfCap: 7,
        provider: 'anthropic',
        model: 'claude-opus-4-6',
        sampleSize: 50,
        isDefault: false,
        disclaimer: 'Estimates are approximate.',
      };

      const mockEstimator = {
        estimateBatchCost: jest.fn().mockResolvedValue(mockEstimate),
      };
      CostEstimator.mockImplementation(() => mockEstimator);

      const response = await request(app).get('/api/cost-estimate?fileCount=10&provider=anthropic&sourceType=record_sheet&pdfCount=5');
      expect(response.status).toBe(200);
      expect(mockEstimator.estimateBatchCost).toHaveBeenCalledWith({
        fileCount: 10,
        provider: 'anthropic',
        sourceType: 'record_sheet',
        pdfCount: 5,
      });
      expect(response.body.effectiveFileCount).toBe(25);
    });

    it('returns 200 with defaults when no historical data', async () => {
      const mockEstimate = {
        estimatedTotalCost: 0.28,
        estimatedPerFileCost: 0.0275,
        effectiveFileCount: 10,
        sessionCap: 5.0,
        exceedsCap: false,
        pctOfCap: 5.6,
        provider: 'anthropic',
        model: 'claude-opus-4-6',
        sampleSize: 0,
        isDefault: true,
        disclaimer: 'Estimates are approximate based on default values.',
      };

      CostEstimator.mockImplementation(() => ({
        estimateBatchCost: jest.fn().mockResolvedValue(mockEstimate),
      }));

      const response = await request(app).get('/api/cost-estimate?fileCount=10&provider=anthropic&sourceType=record_sheet');
      expect(response.status).toBe(200);
      expect(response.body.isDefault).toBe(true);
      expect(response.body.sampleSize).toBe(0);
    });

    it('returns exceedsCap: true when estimate exceeds session cap', async () => {
      const mockEstimate = {
        estimatedTotalCost: 6.0,
        estimatedPerFileCost: 0.065,
        effectiveFileCount: 100,
        sessionCap: 5.0,
        exceedsCap: true,
        pctOfCap: 120,
        provider: 'anthropic',
        model: 'claude-opus-4-6',
        sampleSize: 30,
        isDefault: false,
        disclaimer: 'Estimates are approximate.',
      };

      CostEstimator.mockImplementation(() => ({
        estimateBatchCost: jest.fn().mockResolvedValue(mockEstimate),
      }));

      const response = await request(app).get('/api/cost-estimate?fileCount=100&provider=anthropic&sourceType=record_sheet');
      expect(response.status).toBe(200);
      expect(response.body.exceedsCap).toBe(true);
      expect(response.body.pctOfCap).toBeGreaterThan(100);
    });

    it('returns 500 if CostEstimator throws error', async () => {
      CostEstimator.mockImplementation(() => ({
        estimateBatchCost: jest.fn().mockRejectedValue(new Error('DB error')),
      }));

      const response = await request(app).get('/api/cost-estimate?fileCount=10&provider=anthropic&sourceType=record_sheet');
      expect(response.status).toBe(500);
      expect(response.body.error).toBeDefined();
    });

    it('validates that pdfCount is a non-negative integer', async () => {
      const response = await request(app).get('/api/cost-estimate?fileCount=10&provider=anthropic&sourceType=record_sheet&pdfCount=-1');
      expect(response.status).toBe(400);
    });

    it('allows pdfCount of 0 by default', async () => {
      const mockEstimate = {
        estimatedTotalCost: 0.28,
        estimatedPerFileCost: 0.0275,
        effectiveFileCount: 10,
        sessionCap: 5.0,
        exceedsCap: false,
        pctOfCap: 5.6,
        provider: 'anthropic',
        model: 'claude-opus-4-6',
        sampleSize: 0,
        isDefault: true,
        disclaimer: 'Estimates are approximate.',
      };

      CostEstimator.mockImplementation(() => ({
        estimateBatchCost: jest.fn().mockResolvedValue(mockEstimate),
      }));

      const response = await request(app).get('/api/cost-estimate?fileCount=10&provider=anthropic&sourceType=record_sheet');
      expect(response.status).toBe(200);
    });
  });
});
