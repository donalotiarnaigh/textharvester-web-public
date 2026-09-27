const { downloadResultsJSON } = require('../../src/controllers/resultsManager'); // Adjust path as needed
const httpMocks = require('node-mocks-http'); // Mock HTTP request/response
const { downloadResultsCSV } = require('../../src/controllers/resultsManager');

jest.mock('../../src/utils/database', () => ({
  getAllMemorials: jest.fn().mockResolvedValue([{
    memorial_number: '001',
    first_name: 'John'
  }]),
  db: {
    get: jest.fn((sql, params, callback) => callback(null, {})),
    all: jest.fn((sql, params, callback) => callback(null, []))
  }
}));

describe('downloadResultsJSON', () => {
  it('should set the correct Content-Disposition header', async () => {
    const req = httpMocks.createRequest({
      query: { filename: 'test_filename' }
    });
    const res = httpMocks.createResponse({
      eventEmitter: require('events').EventEmitter
    });

    await downloadResultsJSON(req, res);

    expect(res._getHeaders()['content-disposition'])
      .toBe('attachment; filename="test_filename.json"');
  });
});

describe('downloadResultsCSV', () => {
  it('should set correct headers', async () => {
    const req = httpMocks.createRequest({
      query: { filename: 'test_filename' }
    });
    const res = httpMocks.createResponse({
      eventEmitter: require('events').EventEmitter
    });

    await downloadResultsCSV(req, res);

    expect(res._getHeaders()['content-disposition'])
      .toBe('attachment; filename="test_filename.csv"');
  });
});
