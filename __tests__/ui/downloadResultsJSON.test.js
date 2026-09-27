const httpMocks = require('node-mocks-http');
const { downloadResultsJSON } = require('../../src/controllers/resultsManager');

jest.mock('../../src/utils/database', () => ({
  getAllMemorials: jest.fn().mockResolvedValue([
    {
      memorial_number: '001',
      first_name: 'John',
      last_name: 'Doe'
    }
  ]),
  db: {
    get: jest.fn((sql, params, callback) => callback(null, {})),
    all: jest.fn((sql, params, callback) => callback(null, []))
  }
}));

describe('downloadResultsJSON', () => {
  it('should set the correct Content-Disposition header based on the filename parameter', async () => {
    const req = httpMocks.createRequest({
      query: { filename: 'test_filename' }
    });
    const res = httpMocks.createResponse();

    await downloadResultsJSON(req, res);

    expect(res._getHeaders()['content-disposition']).toEqual(
      'attachment; filename="test_filename.json"'
    );
  });
});
