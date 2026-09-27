const httpMocks = require('node-mocks-http');

// Auto-mock QueryService
jest.mock('../../src/services/QueryService');

// Mock database module only for detectSourceType if needed
jest.mock('../../src/utils/database', () => ({
  db: {
    get: jest.fn((query, params, cb) => cb(null, { max_date: '2024-01-01' })) // defaults to memorial
  }
}));

const QueryService = require('../../src/services/QueryService');
const { downloadResultsJSON, downloadResultsCSV } = require('../../src/controllers/resultsManager'); // Require AFTER mocking

describe('Download Functionality', () => {
  let req, res;
  // Capture the mock method from the instance created when resultsManager was required
  const mockList = QueryService.mock.instances[0].list;

  beforeEach(() => {
    req = httpMocks.createRequest();
    res = httpMocks.createResponse();
    jest.clearAllMocks();
    mockList.mockResolvedValue({ records: [], total: 0 });
  });

  describe('JSON Downloads', () => {
    it('should include prompt metadata in JSON export', async () => {
      const mockRecords = [{
        id: 1,
        memorial_number: 123,
        first_name: 'John',
        last_name: 'Doe',
        year_of_death: 1900,
        inscription: 'Test inscription',
        file_name: 'test.jpg',
        ai_provider: 'openai',
        model_version: 'gpt-5.1',
        prompt_version: '1.0.0',
        processed_date: '2024-03-20T10:00:00.000Z'
      }];

      mockList.mockResolvedValue({ records: mockRecords, total: 1 });
      await downloadResultsJSON(req, res);

      const data = JSON.parse(res._getData());
      expect(data[0]).toHaveProperty('ai_provider', 'openai');
      expect(data[0]).toHaveProperty('model_version', 'gpt-5.1');
      expect(data[0]).toHaveProperty('prompt_version', '1.0.0');
    });

    it('should handle format option for JSON export', async () => {
      const mockRecords = [{
        id: 1,
        memorial_number: '123', // Changed to string to preserve leading zeros
        first_name: 'John',
        last_name: 'Doe'
      }];

      mockList.mockResolvedValue({ records: mockRecords, total: 1 });

      // Test pretty print format
      req.query.format = 'pretty';
      await downloadResultsJSON(req, res);
      expect(res._getData()).toBe(JSON.stringify(mockRecords, null, 2));

      // Test compact format
      res = httpMocks.createResponse();
      req.query.format = 'compact';
      await downloadResultsJSON(req, res);
      expect(res._getData()).toBe(JSON.stringify(mockRecords));
    });

    it('should validate data types in JSON export', async () => {
      const mockRecords = [{
        memorial_number: '123', // String to preserve leading zeros
        year_of_death: '1900', // String that should be number
        first_name: 'John'
      }];

      mockList.mockResolvedValue({ records: mockRecords, total: 1 });
      await downloadResultsJSON(req, res);

      const data = JSON.parse(res._getData());
      expect(typeof data[0].memorial_number).toBe('string'); // Changed to string to preserve leading zeros
      expect(typeof data[0].year_of_death).toBe('number');
    });
  });

  describe('CSV Downloads', () => {
    it('should include all fields in CSV export', async () => {
      const mockRecords = [{
        id: 1,
        memorial_number: 123,
        first_name: 'John',
        last_name: 'Doe',
        year_of_death: 1900,
        inscription: 'Test inscription',
        file_name: 'test.jpg',
        ai_provider: 'openai',
        model_version: 'gpt-5.1',
        prompt_version: '1.0.0',
        processed_date: '2024-03-20T10:00:00.000Z'
      }];

      mockList.mockResolvedValue({ records: mockRecords, total: 1 });
      await downloadResultsCSV(req, res);

      const csvData = res._getData();
      const headers = csvData.split('\n')[0];

      expect(headers).toContain('memorial_number');
      expect(headers).toContain('first_name');
      expect(headers).toContain('last_name');
      expect(headers).toContain('year_of_death');
      expect(headers).toContain('inscription');
      expect(headers).toContain('ai_provider');
      expect(headers).toContain('model_version');
      expect(headers).toContain('prompt_version');
    });

    it('should handle special characters in CSV export', async () => {
      const mockRecords = [{
        memorial_number: 123,
        first_name: 'John, Jr.', // Contains comma
        last_name: 'O"Brien', // Contains quote
        inscription: 'Line 1\nLine 2' // Contains newline
      }];

      mockList.mockResolvedValue({ records: mockRecords, total: 1 });
      await downloadResultsCSV(req, res);

      const csvData = res._getData();
      const dataRow = csvData.split('\n')[1];

      expect(dataRow).toContain('"John, Jr."'); // Quoted due to comma
      expect(dataRow).toContain('"O""Brien"'); // Escaped quote
      expect(dataRow).toContain('"Line 1\\nLine 2"'); // Escaped newline
    });

    it('should validate data types in CSV export', async () => {
      const mockRecords = [{
        memorial_number: '123', // String that should be number
        year_of_death: '1900', // String that should be number
        first_name: 'John'
      }];

      mockList.mockResolvedValue({ records: mockRecords, total: 1 });
      await downloadResultsCSV(req, res);

      const csvData = res._getData();
      const dataRow = csvData.split('\n')[1].split(',');

      expect(dataRow[0]).toBe('123'); // Should be converted to number before CSV conversion
      expect(dataRow[3]).toBe('1900'); // Should be converted to number before CSV conversion
    });

    it('should handle missing fields in CSV export', async () => {
      const mockRecords = [{
        memorial_number: 123,
        // first_name missing
        last_name: 'Doe'
      }];

      mockList.mockResolvedValue({ records: mockRecords, total: 1 });
      await downloadResultsCSV(req, res);

      const csvData = res._getData();
      const dataRow = csvData.split('\n')[1].split(',');

      // Should have empty string for missing fields
      // NOTE: Because of CSV implementation (json2csv or similar), order matters.
      // If we are strictly checking, the second column is first_name.
      expect(dataRow[1]).toBe('');
    });
  });

  describe('Error Handling', () => {
    it('should handle database errors gracefully', async () => {
      mockList.mockRejectedValue(new Error('Database error'));

      await downloadResultsJSON(req, res);
      expect(res._getStatusCode()).toBe(500);
      expect(res._getData()).toBe('Unable to download results');

      res = httpMocks.createResponse();
      await downloadResultsCSV(req, res);
      expect(res._getStatusCode()).toBe(500);
      expect(res._getData()).toBe('Unable to download results');
    });

    it('should handle invalid format options', async () => {
      const mockRecords = [{ id: 1 }];
      mockList.mockResolvedValue({ records: mockRecords, total: 1 });

      req.query.format = 'invalid';
      await downloadResultsJSON(req, res);

      // Should default to compact format
      expect(res._getData()).toBe(JSON.stringify(mockRecords));
    });
  });
}); 