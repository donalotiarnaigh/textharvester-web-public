// Mock dependencies
jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debugPayload: jest.fn()
}));

jest.mock('../../utils/fileQueue', () => ({
  getProcessedResults: jest.fn()
}));

// Auto-mock QueryService
jest.mock('../../services/QueryService');

// We only need database.get for detectSourceType
jest.mock('../../utils/database', () => ({
  db: {
    get: jest.fn((query, params, callback) => {
      // Mock detectSourceType queries
      if (query.includes('SELECT MAX(processed_date)')) {
        if (query.includes('FROM memorials')) {
          callback(null, { max_date: '2025-12-04 10:00:00' });
        } else if (query.includes('FROM burial_register_entries')) {
          callback(null, null); // No burial register entries
        } else if (query.includes('FROM grave_cards')) {
          callback(null, null); // No grave cards by default
        } else {
          callback(null, null);
        }
      } else {
        callback(null, null);
      }
    })
  }
}));

jest.mock('../../utils/dataValidation', () => ({
  validateAndConvertRecords: jest.fn(data => data) // Return the same data
}));

jest.mock('../../utils/dataConversion', () => ({
  jsonToCsv: jest.fn(() => 'csv-data'),
  formatJsonForExport: jest.fn(() => 'json-data')
}));

jest.mock('moment', () => () => ({
  format: () => '20250522_103213'
}));

const {
  getResults,
  downloadResultsJSON
} = require('../resultsManager'); // Require AFTER mocking

const { getProcessedResults } = require('../../utils/fileQueue');
const QueryService = require('../../services/QueryService');
// Capture the mock method from the instance created when resultsManager was required
const mockList = QueryService.mock.instances[0].list;

describe('Enhanced Results Manager with Error Handling', () => {
  let mockResponse;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Reset mockList behavior
    mockList.mockResolvedValue({ records: [], total: 0 });

    // Mock response object
    mockResponse = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
      setHeader: jest.fn(),
      attachment: jest.fn().mockReturnThis(),
      end: jest.fn()
    };
  });

  // Helper function to create mock request object
  const createMockRequest = (query = {}) => ({
    query
  });

  describe('getResults', () => {
    it('should return both memorials and errors', async () => {
      // Mock processed results with both successful and error records
      const mockRecords = [
        {
          memorial_number: 'HG-123',
          first_name: 'JOHN',
          last_name: 'DOE',
          file_name: 'file1.jpg'
        }
      ];

      const mockResultErrors = [
        {
          fileName: 'file2.jpg',
          error: true,
          errorType: 'empty_sheet',
          errorMessage: 'No readable text found on the sheet'
        }
      ];

      mockList.mockResolvedValue({ records: mockRecords, total: 1 });
      getProcessedResults.mockReturnValue(mockResultErrors);

      await getResults(createMockRequest(), mockResponse);

      expect(mockResponse.json).toHaveBeenCalledWith({
        memorials: [{
          memorial_number: 'HG-123',
          first_name: 'JOHN',
          last_name: 'DOE',
          file_name: 'file1.jpg',
          fileName: 'file1.jpg'
        }],
        sourceType: 'memorial',
        errors: mockResultErrors
      });
    });

    it('should handle case with no errors', async () => {
      // Mock processed results with only successful records
      const mockRecords = [
        {
          memorial_number: 'HG-123',
          first_name: 'JOHN',
          last_name: 'DOE',
          file_name: 'file1.jpg'
        },
        {
          memorial_number: 'HG-124',
          first_name: 'JANE',
          last_name: 'DOE',
          file_name: 'file2.jpg'
        }
      ];

      mockList.mockResolvedValue({ records: mockRecords, total: 2 });
      getProcessedResults.mockReturnValue([]);

      await getResults(createMockRequest(), mockResponse);

      expect(mockResponse.json).toHaveBeenCalledWith({
        memorials: [
          {
            memorial_number: 'HG-123',
            first_name: 'JOHN',
            last_name: 'DOE',
            file_name: 'file1.jpg',
            fileName: 'file1.jpg'
          },
          {
            memorial_number: 'HG-124',
            first_name: 'JANE',
            last_name: 'DOE',
            file_name: 'file2.jpg',
            fileName: 'file2.jpg'
          }
        ],
        sourceType: 'memorial',
        errors: undefined
      });
    });

    it('should handle case with only errors', async () => {
      // Mock processed results with only error records
      const mockResultErrors = [
        {
          fileName: 'file1.jpg',
          error: true,
          errorType: 'empty_sheet',
          errorMessage: 'No readable text found on the sheet'
        },
        {
          fileName: 'file2.jpg',
          error: true,
          errorType: 'empty_sheet',
          errorMessage: 'Empty data received from OCR processing'
        }
      ];

      mockList.mockResolvedValue({ records: [], total: 0 });
      getProcessedResults.mockReturnValue(mockResultErrors);

      await getResults(createMockRequest(), mockResponse);

      expect(mockResponse.json).toHaveBeenCalledWith({
        memorials: [],
        sourceType: 'memorial',
        errors: mockResultErrors
      });
    });
  });

  describe('downloadResultsJSON', () => {
    it('should include only memorials in JSON download', async () => {
      // Mock processed results with both successful and error records
      const mockRecords = [
        {
          memorial_number: 'HG-123',
          first_name: 'JOHN',
          last_name: 'DOE',
          file_name: 'file1.jpg'
        }
      ];

      mockList.mockResolvedValue({ records: mockRecords, total: 1 });

      await downloadResultsJSON({ query: {} }, mockResponse);

      expect(mockResponse.setHeader).toHaveBeenCalledWith('Content-Type', 'application/json');
      expect(mockResponse.send).toHaveBeenCalledWith('json-data');
    });
  });
}); 