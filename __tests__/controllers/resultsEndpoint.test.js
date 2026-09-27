const httpMocks = require('node-mocks-http');

// Auto-mock QueryService
jest.mock('../../src/services/QueryService');
jest.mock('../../src/utils/fileQueue.js');
jest.mock('../../src/utils/database'); // mocking database for detecting source type DB calls if any

const QueryService = require('../../src/services/QueryService');
const { getResults } = require('../../src/controllers/resultsManager'); // Require AFTER mocking
const { getProcessedResults } = require('../../src/utils/fileQueue.js');
const { db } = require('../../src/utils/database');

describe('Results Endpoint', () => {
  let req, res;
  // Capture the mock method from the instance created when resultsManager was required
  const mockList = QueryService.mock.instances[0].list;

  beforeEach(() => {
    req = httpMocks.createRequest();
    res = httpMocks.createResponse();
    jest.clearAllMocks();

    // Default QueryService mock behavior
    mockList.mockResolvedValue({ records: [], total: 0 });

    // Mock getProcessedResults to return no errors by default
    getProcessedResults.mockReturnValue([]);

    // Mock db.get for detectSourceType queries
    db.get = jest.fn((query, params, callback) => {
      if (query.includes('SELECT MAX(processed_date)')) {
        if (query.includes('FROM memorials')) {
          // Return a memorial date to ensure detectSourceType returns 'memorial'
          callback(null, { max_date: '2025-12-04 10:00:00' });
        } else if (query.includes('FROM burial_register_entries')) {
          // Return null to indicate no burial register entries
          callback(null, null);
        } else if (query.includes('FROM grave_cards')) {
          // Return null to indicate no grave cards
          callback(null, null);
        } else {
          callback(null, null);
        }
      } else {
        callback(null, null);
      }
    });

    // Mock db.all for SchemaManager.listSchemas() calls
    db.all = jest.fn((query, params, callback) => {
      // Return empty array for custom schemas
      callback(null, []);
    });
  });

  describe('getResults', () => {
    it('should return results with proper data types', async () => {
      const mockRecords = [
        {
          memorial_number: 123,
          first_name: 'John',
          last_name: 'Smith',
          year_of_death: 1900,
          inscription: 'In loving memory',
          file_name: 'test.jpg'
        }
      ];

      mockList.mockResolvedValue({ records: mockRecords, total: 1 });

      // Mock res methods to be chainable
      res.json = jest.fn().mockReturnValue(res);

      await getResults(req, res);

      expect(mockList).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalled();

      // Check the response structure
      const responseData = res.json.mock.calls[0][0];
      expect(responseData).toHaveProperty('memorials');
      expect(responseData).toHaveProperty('errors');
      expect(Array.isArray(responseData.memorials)).toBe(true);
    });

    it('should handle missing optional fields', async () => {
      const mockRecords = [
        {
          memorial_number: 123,
          first_name: null,
          last_name: 'Smith',
          year_of_death: null,
          inscription: null,
          file_name: 'test.jpg'
        }
      ];

      mockList.mockResolvedValue({ records: mockRecords, total: 1 });
      res.json = jest.fn().mockReturnValue(res);

      await getResults(req, res);

      const responseData = res.json.mock.calls[0][0];
      expect(responseData.memorials[0].first_name).toBeNull();
      expect(responseData.memorials[0].year_of_death).toBeNull();
      expect(responseData.memorials[0].inscription).toBeNull();
    });

    it('should include error information in response', async () => {
      const mockRecords = [
        {
          memorial_number: 123,
          first_name: 'John',
          last_name: 'Smith',
          year_of_death: 1900,
          inscription: 'In loving memory',
          file_name: 'test.jpg'
        }
      ];

      const mockErrors = [
        { error: 'File processing error', fileName: 'error_file.jpg' }
      ];

      mockList.mockResolvedValue({ records: mockRecords, total: 1 });
      getProcessedResults.mockReturnValue(mockErrors);
      res.json = jest.fn().mockReturnValue(res);

      await getResults(req, res);

      const responseData = res.json.mock.calls[0][0];
      expect(responseData.errors).toEqual(mockErrors);
    });

    it('should handle database errors gracefully', async () => {
      mockList.mockRejectedValue(new Error('Database error'));

      // Mock res.status and res.json to be chainable
      res.status = jest.fn().mockReturnValue(res);
      res.json = jest.fn().mockReturnValue(res);

      await getResults(req, res);

      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        error: 'Failed to retrieve results'
      });
    });

    it('should validate and convert data types before sending response', async () => {
      const mockRecords = [
        {
          memorial_number: '123', // String that should be converted to number
          first_name: 'John',
          last_name: 'Smith',
          year_of_death: '1900', // String that should be converted to number
          inscription: 'In loving memory',
          file_name: 'test.jpg'
        }
      ];

      mockList.mockResolvedValue({ records: mockRecords, total: 1 });
      res.json = jest.fn().mockReturnValue(res);

      await getResults(req, res);

      expect(mockList).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalled();

      // Get the actual response data
      const responseData = res.json.mock.calls[0][0];

      // Verify data types are converted properly in the memorials array
      expect(responseData.memorials).toBeDefined();
      expect(Array.isArray(responseData.memorials)).toBe(true);
      expect(responseData.memorials.length).toBeGreaterThan(0);

      const result = responseData.memorials[0];
      expect(typeof result.memorial_number).toBe('string'); // Changed to string to preserve leading zeros
      expect(typeof result.year_of_death).toBe('number');
    });
  });
}); 