const QueryService = require('../../src/services/QueryService');


describe('QueryService', () => {
  let service;
  let mockStorage;
  let mockConfig;

  beforeEach(() => {
    mockConfig = {};
    mockStorage = {
      memorials: {
        getAll: jest.fn(),
        getById: jest.fn(),
      },
      burialRegister: {
        getAll: jest.fn(),
        getById: jest.fn(),
      },
      graveCards: {
        getAll: jest.fn(),
        getById: jest.fn(),
      }
    };
    service = new QueryService(mockConfig, mockStorage);
  });

  describe('list', () => {
    it('should return records from the specified source type', async () => {
      mockStorage.memorials.getAll.mockResolvedValue([{ id: 1, name: 'Test' }]);

      const result = await service.list({ sourceType: 'memorial' });

      expect(mockStorage.memorials.getAll).toHaveBeenCalled();
      expect(result.records).toHaveLength(1);
      expect(result.count).toBe(1);
    });

    it('should default to specified limit and offset', async () => {
      mockStorage.memorials.getAll.mockResolvedValue([]);

      await service.list({ sourceType: 'memorial' });

      expect(mockStorage.memorials.getAll).toHaveBeenCalled();
    });

    it('should throw INVALID_SOURCE_TYPE for unknown source', async () => {
      await expect(service.list({ sourceType: 'unknown' }))
        .rejects.toThrow('Unknown source type');
    });

    it('should resolve monument_photo to memorials storage', async () => {
      mockStorage.memorials.getAll.mockResolvedValue([]);
      await service.list({ sourceType: 'monument_photo' });
      expect(mockStorage.memorials.getAll).toHaveBeenCalled();
    });

    it('should resolve record_sheet to memorials storage', async () => {
      mockStorage.memorials.getAll.mockResolvedValue([]);
      await service.list({ sourceType: 'record_sheet' });
      expect(mockStorage.memorials.getAll).toHaveBeenCalled();
    });
  });

  describe('get', () => {
    it('should return a single record by ID', async () => {
      const mockRecord = { id: 123, text: 'Sample' };
      mockStorage.memorials.getById.mockResolvedValue(mockRecord);

      const result = await service.get(123, 'memorial');

      expect(mockStorage.memorials.getById).toHaveBeenCalledWith(123);
      expect(result).toEqual(mockRecord);
    });

    it('should throw RECORD_NOT_FOUND if record does not exist', async () => {
      mockStorage.memorials.getById.mockResolvedValue(null);

      await expect(service.get(999, 'memorial'))
        .rejects.toThrow('Record not found');
    });

    it('should throw INVALID_SOURCE_TYPE for unknown source', async () => {
      await expect(service.get(123, 'unknown'))
        .rejects.toThrow('Unknown source type');
    });
  });

  describe('search', () => {
    it('should filter records by query string (case-insensitive)', async () => {
      const mockRecords = [
        { id: 1, first_name: 'John', last_name: 'Doe', inscription: 'Beloved father' },
        { id: 2, first_name: 'Jane', last_name: 'Smith', inscription: 'Rest in peace' },
        { id: 3, first_name: 'Bob', last_name: 'Doer', inscription: 'Always remembered' }
      ];
      mockStorage.memorials.getAll.mockResolvedValue(mockRecords);

      // Search 'doe' should match John Doe and Bob Doer
      const result = await service.search('doe', { sourceType: 'memorial' });

      expect(mockStorage.memorials.getAll).toHaveBeenCalled();
      expect(result.records).toHaveLength(2);
      expect(result.records.map(r => r.id).sort()).toEqual([1, 3]);
      expect(result.count).toBe(2);
    });

    it('should search across multiple fields', async () => {
      const mockRecords = [
        { id: 1, first_name: 'Alpha', last_name: 'Bravo' },
        { id: 2, first_name: 'Charlie', last_name: 'Delta' }
      ];
      mockStorage.memorials.getAll.mockResolvedValue(mockRecords);

      // Search 'alpha' (first_name)
      const res1 = await service.search('Alpha', { sourceType: 'memorial' });
      expect(res1.records).toHaveLength(1);
      expect(res1.records[0].id).toBe(1);

      // Search 'delta' (last_name)
      const res2 = await service.search('Delta', { sourceType: 'memorial' });
      expect(res2.records).toHaveLength(1);
      expect(res2.records[0].id).toBe(2);
    });

    it('should respect pagination in search results', async () => {
      const mockRecords = Array.from({ length: 15 }, (_, i) => ({
        id: i,
        first_name: 'Test',
        val: i
      }));
      mockStorage.memorials.getAll.mockResolvedValue(mockRecords);

      // Search 'Test' matches all 15, get page 2 (limit 5, offset 5)
      const result = await service.search('Test', {
        sourceType: 'memorial',
        limit: 5,
        offset: 5
      });

      expect(result.records).toHaveLength(5);
      expect(result.records[0].id).toBe(5); // 0-4 are on page 1
      expect(result.count).toBe(5);
      // Total matching records should ideally be returned in metadata if we were doing full count, 
      // but for simple slice here, count is just page size. 
      // Current design spec says count is records returned.
    });

    it('should throw INVALID_SOURCE_TYPE for unknown source', async () => {
      await expect(service.search('query', { sourceType: 'unknown' }))
        .rejects.toThrow('Unknown source type');
    });
  });

  describe('caching', () => {
    beforeEach(() => {
      // Setup default responses
      mockStorage.memorials.getAll.mockResolvedValue([{ id: 1 }]);
      mockStorage.burialRegister.getAll.mockResolvedValue([{ id: 2 }]);
    });

    it('should cache results for subsequent list calls', async () => {
      await service.list({ sourceType: 'memorial' });
      await service.list({ sourceType: 'memorial' });

      // Should only be called once
      expect(mockStorage.memorials.getAll).toHaveBeenCalledTimes(1);
    });

    it('should cache results for subsequent search calls', async () => {
      await service.search('query', { sourceType: 'memorial' });
      await service.search('other', { sourceType: 'memorial' });

      // Should only be called once (memoizing the full dataset, not the search result)
      expect(mockStorage.memorials.getAll).toHaveBeenCalledTimes(1);
    });

    it('should maintain separate caches for different source types', async () => {
      await service.list({ sourceType: 'memorial' });
      await service.list({ sourceType: 'burial_register' });

      expect(mockStorage.memorials.getAll).toHaveBeenCalledTimes(1);
      expect(mockStorage.burialRegister.getAll).toHaveBeenCalledTimes(1);
    });

    it('should expire cache after TTL', async () => {
      // Configure service with short TTL
      service = new QueryService({ ...mockConfig, cacheTTL: 100 }, mockStorage);

      await service.list({ sourceType: 'memorial' });
      expect(mockStorage.memorials.getAll).toHaveBeenCalledTimes(1);

      // Wait for TTL to expire
      await new Promise(resolve => setTimeout(resolve, 150));

      await service.list({ sourceType: 'memorial' });
      expect(mockStorage.memorials.getAll).toHaveBeenCalledTimes(2);
    });

    it('should allow manual cache clearing', async () => {
      await service.list({ sourceType: 'memorial' });
      service.clearCache();
      await service.list({ sourceType: 'memorial' });

      expect(mockStorage.memorials.getAll).toHaveBeenCalledTimes(2);
    });
  });
});
