/**
 * @jest-environment node
 */

const {
  updateMemorialHandler,
  updateBurialEntryHandler,
  updateGraveCardHandler,
  markReviewedHandler,
  sanitizeInput,
  validateId
} = require('../../src/controllers/resultEditController');

jest.mock('../../src/utils/logger', () => ({
  error: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn()
}));

jest.mock('../../src/utils/database', () => ({
  updateMemorial: jest.fn(),
  markAsReviewed: jest.fn()
}));

jest.mock('../../src/utils/burialRegisterStorage', () => ({
  updateBurialRegisterEntry: jest.fn()
}));

jest.mock('../../src/utils/graveCardStorage', () => ({
  updateGraveCard: jest.fn()
}));

describe('Result Edit Controller', () => {
  let mockReq, mockRes, database, burialRegisterStorage, graveCardStorage;

  beforeEach(() => {
    jest.clearAllMocks();

    database = require('../../src/utils/database');
    burialRegisterStorage = require('../../src/utils/burialRegisterStorage');
    graveCardStorage = require('../../src/utils/graveCardStorage');

    mockRes = {
      json: jest.fn().mockReturnThis(),
      status: jest.fn().mockReturnThis()
    };
  });

  describe('sanitizeInput()', () => {
    it('should trim string values', () => {
      const result = sanitizeInput({
        first_name: '  JANE  ',
        last_name: 'DOE'
      });

      expect(result.first_name).toBe('JANE');
      expect(result.last_name).toBe('DOE');
    });

    it('should cap string length at 10000 chars', () => {
      const longString = 'a'.repeat(15000);
      const result = sanitizeInput({ field: longString });

      expect(result.field.length).toBe(10000);
    });

    it('should allow null values', () => {
      const result = sanitizeInput({
        field1: null,
        field2: 'value'
      });

      expect(result.field1).toBeNull();
      expect(result.field2).toBe('value');
    });

    it('should preserve numeric values', () => {
      const result = sanitizeInput({
        year_of_death: 1857,
        tokens: 500
      });

      expect(result.year_of_death).toBe(1857);
      expect(result.tokens).toBe(500);
    });

    it('should allow nested objects (for grave card fields)', () => {
      const result = sanitizeInput({
        grave: { status: 'unknown', type: 'single' }
      });

      expect(result.grave.status).toBe('unknown');
      expect(result.grave.type).toBe('single');
    });
  });

  describe('validateId()', () => {
    it('should parse valid ID strings', () => {
      const id = validateId('123');
      expect(id).toBe(123);
    });

    it('should throw error for non-numeric IDs', () => {
      expect(() => validateId('abc')).toThrow('Invalid ID');
    });

    it('should throw error for zero or negative IDs', () => {
      expect(() => validateId('0')).toThrow('Invalid ID');
      expect(() => validateId('-1')).toThrow('Invalid ID');
    });

    it('should throw error for float IDs', () => {
      expect(() => validateId('3.14')).toThrow('Invalid ID');
    });
  });

  describe('updateMemorialHandler()', () => {
    it('should update memorial and return 200', async () => {
      const updatedMemorial = { id: 1, first_name: 'JANE' };
      database.updateMemorial.mockResolvedValue(updatedMemorial);

      mockReq = {
        params: { id: '1' },
        body: { first_name: 'JANE' }
      };

      await updateMemorialHandler(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        memorial: updatedMemorial
      });
    });

    it('should return 404 when memorial not found', async () => {
      database.updateMemorial.mockResolvedValue(null);

      mockReq = {
        params: { id: '999' },
        body: { first_name: 'JANE' }
      };

      await updateMemorialHandler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Memorial not found'
      });
    });

    it('should return 400 for empty request body', async () => {
      mockReq = {
        params: { id: '1' },
        body: {}
      };

      await updateMemorialHandler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'No fields to update'
      });
    });

    it('should return 400 for invalid ID', async () => {
      mockReq = {
        params: { id: 'invalid' },
        body: { first_name: 'JANE' }
      };

      await updateMemorialHandler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
    });

    it('should return 500 on database error', async () => {
      database.updateMemorial.mockRejectedValue(new Error('DB error'));

      mockReq = {
        params: { id: '1' },
        body: { first_name: 'JANE' }
      };

      await updateMemorialHandler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Failed to update memorial'
      });
    });
  });

  describe('updateBurialEntryHandler()', () => {
    it('should update burial entry and return 200', async () => {
      const updatedEntry = { id: 1, name_raw: 'JANE DOE' };
      burialRegisterStorage.updateBurialRegisterEntry.mockResolvedValue(updatedEntry);

      mockReq = {
        params: { id: '1' },
        body: { name_raw: 'JANE DOE' }
      };

      await updateBurialEntryHandler(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        entry: updatedEntry
      });
    });

    it('should return 404 when entry not found', async () => {
      burialRegisterStorage.updateBurialRegisterEntry.mockResolvedValue(null);

      mockReq = {
        params: { id: '999' },
        body: { name_raw: 'JANE' }
      };

      await updateBurialEntryHandler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Burial register entry not found'
      });
    });
  });

  describe('updateGraveCardHandler()', () => {
    it('should update grave card and return 200', async () => {
      const updatedCard = { id: 1, section: 'B', data: { grave: { status: 'unknown' } } };
      graveCardStorage.updateGraveCard.mockResolvedValue(updatedCard);

      mockReq = {
        params: { id: '1' },
        body: { grave: { status: 'unknown' } }
      };

      await updateGraveCardHandler(mockReq, mockRes);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        card: updatedCard
      });
    });

    it('should return 404 when card not found', async () => {
      graveCardStorage.updateGraveCard.mockResolvedValue(null);

      mockReq = {
        params: { id: '999' },
        body: { grave: { status: 'unknown' } }
      };

      await updateGraveCardHandler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Grave card not found'
      });
    });
  });

  describe('markReviewedHandler()', () => {
    it('should mark memorial as reviewed', async () => {
      const reviewed = { id: 1, needs_review: 0, reviewed_at: '2026-04-03' };
      database.markAsReviewed.mockResolvedValue(reviewed);

      mockReq = {
        params: { type: 'memorials', id: '1' }
      };

      await markReviewedHandler(mockReq, mockRes);

      expect(database.markAsReviewed).toHaveBeenCalledWith('memorials', 1);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        record: reviewed
      });
    });

    it('should mark burial register entry as reviewed', async () => {
      const reviewed = { id: 1, needs_review: 0, reviewed_at: '2026-04-03' };
      database.markAsReviewed.mockResolvedValue(reviewed);

      mockReq = {
        params: { type: 'burial-register', id: '1' }
      };

      await markReviewedHandler(mockReq, mockRes);

      expect(database.markAsReviewed).toHaveBeenCalledWith('burial_register_entries', 1);
    });

    it('should mark grave card as reviewed', async () => {
      const reviewed = { id: 1, needs_review: 0, reviewed_at: '2026-04-03' };
      database.markAsReviewed.mockResolvedValue(reviewed);

      mockReq = {
        params: { type: 'grave-cards', id: '1' }
      };

      await markReviewedHandler(mockReq, mockRes);

      expect(database.markAsReviewed).toHaveBeenCalledWith('grave_cards', 1);
    });

    it('should return 400 for invalid record type', async () => {
      mockReq = {
        params: { type: 'invalid-type', id: '1' }
      };

      await markReviewedHandler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: expect.stringContaining('Invalid record type')
      });
    });

    it('should return 404 when record not found', async () => {
      database.markAsReviewed.mockResolvedValue(null);

      mockReq = {
        params: { type: 'memorials', id: '999' }
      };

      await markReviewedHandler(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(404);
    });
  });
});
