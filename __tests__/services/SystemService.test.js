const SystemService = require('../../src/services/SystemService');
const { CLIError } = require('../../src/cli/errors');
const database = require('../../src/utils/database');
const fileQueue = require('../../src/utils/fileQueue');
const burialRegisterStorage = require('../../src/utils/burialRegisterStorage');
const graveCardStorage = require('../../src/utils/graveCardStorage');
const llmAuditLog = require('../../src/utils/llmAuditLog');

// Mock dependencies
jest.mock('../../src/utils/database');
jest.mock('../../src/utils/fileQueue');
jest.mock('../../src/utils/logger');
jest.mock('../../src/utils/burialRegisterStorage');
jest.mock('../../src/utils/graveCardStorage');
jest.mock('../../src/utils/llmAuditLog');

describe('SystemService', () => {
  let service;
  let mockConfig;

  beforeEach(() => {
    jest.clearAllMocks();
    mockConfig = {
      dbPath: './data/test.db'
    };
    // Setup llmAuditLog mock
    llmAuditLog.initialize = jest.fn().mockResolvedValue();
    service = new SystemService(mockConfig);
  });

  describe('initDb', () => {
    it('should initialize database successfully', async () => {
      // Setup successful mock responses
      // Note: in the real implementation, these are void functions that log errors if they fail
      // but we assume they might throw or we check if they were called

      const result = await service.initDb();

      expect(result).toEqual({ success: true, message: 'Database initialized successfully' });
      // Depending on implementation, it might call specific init functions from database.js
      // We'll verify generalized behavior here or specific calls if we know them
      // Based on design, it should call init helpers
    });

    it('should handle initialization errors', async () => {
      // Mock an error in initialization
      // We assume SystemService calls existing init functions that might throw or we'd wrap them
      // For this test, let's assume we mock a database module method that throws
      database.initializeDatabase = jest.fn().mockImplementation(() => { throw new Error('Permission denied'); });

      await expect(service.initDb())
        .rejects
        .toThrow(); // Expecting it to propagate or wrap error

      // Or if we expect specific CLIError:
      // await expect(service.initDb()).rejects.toThrow(CLIError);
    });
  });


  describe('getStatus', () => {
    it('should return system status with queue and db counts', async () => {
      // Mock queue status
      fileQueue.getProcessingProgress.mockReturnValue({
        queue: { size: 5, pending: 2, processing: 3 }
      });

      // Mock db counts
      database.getAllMemorials.mockResolvedValue([1, 2, 3]); // length 3
      burialRegisterStorage.getAllBurialRegisterEntries.mockResolvedValue([1]); // length 1
      graveCardStorage.getAllGraveCards.mockResolvedValue([1, 2]); // length 2

      const status = await service.getStatus();

      expect(status).toHaveProperty('queue');
      expect(status).toHaveProperty('database');
      expect(status.queue.pending).toBe(5);
      expect(status.database.records.memorial).toBe(3);
      expect(status.database.records.burial_register).toBe(1);
      expect(status.database.records.grave_record_card).toBe(2);
    });
  });

  describe('clearQueue', () => {
    it('should clear queue when confirmed', async () => {
      fileQueue.cancelProcessing.mockImplementation(() => { });
      fileQueue.getTotalFiles.mockReturnValue(0);

      const result = await service.clearQueue(true);

      expect(fileQueue.cancelProcessing).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.message).toContain('Queue cleared');
    });

    it('should throw error when confirmation missing', async () => {
      const clearQueuePromise = service.clearQueue(false);
      await expect(clearQueuePromise)
        .rejects
        .toThrow('Destructive operation requires --confirm flag');

      await expect(clearQueuePromise)
        .rejects
        .toBeInstanceOf(CLIError);
      await expect(clearQueuePromise)
        .rejects
        .toHaveProperty('code', 'CONFIRMATION_REQUIRED');

      expect(fileQueue.cancelProcessing).not.toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    it('should close database connection', async () => {
      const mockClose = jest.fn((cb) => cb());
      database.db = { close: mockClose };

      await service.cleanup();

      expect(mockClose).toHaveBeenCalled();
    });

    it('should handle errors during cleanup', async () => {
      const mockClose = jest.fn((cb) => cb(new Error('Close failed')));
      database.db = { close: mockClose };

      // Should not throw
      await service.cleanup();

      expect(mockClose).toHaveBeenCalled();
    });
  });

  describe('getCostSummary', () => {
    beforeEach(() => {
      database.getAllMemorials.mockResolvedValue([
        { ai_provider: 'openai',    input_tokens: 100, output_tokens: 50,  estimated_cost_usd: 0.0005, processed_date: '2026-01-15T10:00:00Z' },
        { ai_provider: 'anthropic', input_tokens: 200, output_tokens: 100, estimated_cost_usd: 0.0015, processed_date: '2026-01-16T10:00:00Z' }
      ]);
      burialRegisterStorage.getAllBurialRegisterEntries.mockResolvedValue([
        { ai_provider: 'openai', input_tokens: 300, output_tokens: 150, estimated_cost_usd: 0.0008, processed_date: '2026-01-15T12:00:00Z' }
      ]);
      graveCardStorage.getAllGraveCards.mockResolvedValue([]);
    });

    it('should return aggregated cost summary grouped by provider', async () => {
      const summary = await service.getCostSummary();

      expect(summary).toHaveProperty('rows');
      expect(summary).toHaveProperty('total');

      const openaiRow = summary.rows.find(r => r.provider === 'openai');
      expect(openaiRow).toBeDefined();
      expect(openaiRow.records).toBe(2); // 1 memorial + 1 burial
      expect(openaiRow.input_tokens).toBe(400);

      const anthropicRow = summary.rows.find(r => r.provider === 'anthropic');
      expect(anthropicRow).toBeDefined();
      expect(anthropicRow.records).toBe(1);

      expect(summary.total.records).toBe(3);
      expect(summary.total.estimated_cost_usd).toBeCloseTo(0.0028, 6);
    });

    it('should filter by provider when option is set', async () => {
      const summary = await service.getCostSummary({ provider: 'openai' });
      expect(summary.rows).toHaveLength(1);
      expect(summary.rows[0].provider).toBe('openai');
      expect(summary.total.records).toBe(2);
    });

    it('should filter by date range', async () => {
      const summary = await service.getCostSummary({ from: '2026-01-16T00:00:00Z' });
      // Only anthropic memorial (2026-01-16) qualifies; openai memorial (2026-01-15) and openai burial (2026-01-15) are excluded
      expect(summary.total.records).toBe(1);
    });
  });

  describe('clearData', () => {
    beforeEach(() => {
      database.clearAllMemorials = jest.fn().mockResolvedValue();
      burialRegisterStorage.clearAllBurialRegisterEntries = jest.fn().mockResolvedValue();
      graveCardStorage.clearAllGraveCards = jest.fn().mockResolvedValue();
    });

    it('should throw error when confirmation missing', async () => {
      await expect(service.clearData('all', false))
        .rejects
        .toThrow('Destructive operation requires --confirm flag');

      await expect(service.clearData('all', false))
        .rejects
        .toBeInstanceOf(CLIError);

      expect(database.clearAllMemorials).not.toHaveBeenCalled();
    });

    it('should clear all data types when type is "all"', async () => {
      const result = await service.clearData('all', true);

      expect(database.clearAllMemorials).toHaveBeenCalled();
      expect(burialRegisterStorage.clearAllBurialRegisterEntries).toHaveBeenCalled();
      expect(graveCardStorage.clearAllGraveCards).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.details.memorials).toBe('Cleared');
      expect(result.details.burial_registers).toBe('Cleared');
      expect(result.details.grave_cards).toBe('Cleared');
    });

    it('should clear only memorials when type is "memorial"', async () => {
      const result = await service.clearData('memorial', true);

      expect(database.clearAllMemorials).toHaveBeenCalled();
      expect(burialRegisterStorage.clearAllBurialRegisterEntries).not.toHaveBeenCalled();
      expect(graveCardStorage.clearAllGraveCards).not.toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.details.memorials).toBe('Cleared');
    });

    it('should clear only burial registers when type is "burial_register"', async () => {
      const result = await service.clearData('burial_register', true);

      expect(database.clearAllMemorials).not.toHaveBeenCalled();
      expect(burialRegisterStorage.clearAllBurialRegisterEntries).toHaveBeenCalled();
      expect(graveCardStorage.clearAllGraveCards).not.toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.details.burial_registers).toBe('Cleared');
    });

    it('should clear only grave cards when type is "grave_record_card"', async () => {
      const result = await service.clearData('grave_record_card', true);

      expect(database.clearAllMemorials).not.toHaveBeenCalled();
      expect(burialRegisterStorage.clearAllBurialRegisterEntries).not.toHaveBeenCalled();
      expect(graveCardStorage.clearAllGraveCards).toHaveBeenCalled();
      expect(result.success).toBe(true);
      expect(result.details.grave_cards).toBe('Cleared');
    });

    it('should handle partial failures gracefully', async () => {
      database.clearAllMemorials = jest.fn().mockRejectedValue(new Error('DB locked'));
      burialRegisterStorage.clearAllBurialRegisterEntries = jest.fn().mockResolvedValue();
      graveCardStorage.clearAllGraveCards = jest.fn().mockResolvedValue();

      const result = await service.clearData('all', true);

      expect(result.success).toBe(true);
      expect(result.details.memorials).toContain('Failed');
      expect(result.details.burial_registers).toBe('Cleared');
      expect(result.details.grave_cards).toBe('Cleared');
    });
  });
});
