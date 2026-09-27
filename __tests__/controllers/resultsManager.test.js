const { getResults, downloadResultsCSV } = require('../../src/controllers/resultsManager');
const QueryService = require('../../src/services/QueryService');
const { validateAndConvertRecords } = require('../../src/utils/dataValidation');

// Mock dependencies
jest.mock('../../src/services/QueryService');
jest.mock('../../src/utils/dataValidation');
jest.mock('../../src/utils/logger');
jest.mock('../../src/utils/fileQueue', () => ({
  getProcessedResults: jest.fn().mockReturnValue([]),
  getProcessingProgress: jest.fn().mockReturnValue({})
}));
jest.mock('../../../config.json', () => ({}), { virtual: true });

describe('Results Manager - Typographic Analysis', () => {
  let mockReq, mockRes;

  beforeEach(() => {
    mockReq = {
      query: {}
    };
    mockRes = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
      setHeader: jest.fn()
    };
    jest.clearAllMocks();
  });

  describe('CSV exports include review and confidence columns', () => {
    test('memorial CSV export includes needs_review, reviewed_at, confidence_scores, validation_warnings', async () => {
      const mockMemorials = [{
        id: 1,
        memorial_number: '123',
        first_name: 'John',
        last_name: 'Doe',
        year_of_death: '1857',
        inscription: 'RIP',
        confidence_scores: '{"first_name": 0.95, "last_name": 0.92}',
        needs_review: 0,
        reviewed_at: null,
        validation_warnings: null,
        processed_date: '2026-03-08T10:00:00',
        file_name: 'test.jpg',
        ai_provider: 'openai',
        prompt_version: '1.0',
        source_type: 'memorial'
      }];

      QueryService.prototype.list.mockResolvedValue({ records: mockMemorials });
      validateAndConvertRecords.mockReturnValue(mockMemorials);

      mockReq.query.sourceType = 'memorial';
      mockReq.query.format = 'compact';

      await downloadResultsCSV(mockReq, mockRes);

      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv');
      expect(mockRes.send).toHaveBeenCalled();

      const csvData = mockRes.send.mock.calls[0][0];
      const lines = csvData.split('\n');
      const headers = lines[0].split(',');

      expect(headers).toContain('confidence_scores');
      expect(headers).toContain('needs_review');
      expect(headers).toContain('reviewed_at');
      expect(headers).toContain('validation_warnings');
    });

    test('burial register CSV export includes needs_review, reviewed_at, confidence_scores, validation_warnings', async () => {
      const mockEntries = [{
        id: 1,
        entry_id: 'BR001',
        name_raw: 'John Doe',
        burial_date_raw: '1857-05-10',
        age_raw: '75',
        confidence_scores: '{"name_raw": 0.95, "age_raw": 0.88}',
        needs_review: 1,
        reviewed_at: null,
        validation_warnings: '["IMPLAUSIBLE_AGE"]',
        processed_date: '2026-03-08T10:00:00',
        file_name: 'register.jpg',
        ai_provider: 'anthropic',
        prompt_version: '1.0',
        volume_id: 'V1'
      }];

      QueryService.prototype.list.mockResolvedValue({ records: mockEntries });
      validateAndConvertRecords.mockReturnValue(mockEntries);

      mockReq.query.sourceType = 'burial_register';
      mockReq.query.format = 'compact';

      await downloadResultsCSV(mockReq, mockRes);

      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv');
      expect(mockRes.send).toHaveBeenCalled();

      const csvData = mockRes.send.mock.calls[0][0];
      const lines = csvData.split('\n');
      const headers = lines[0].split(',');

      expect(headers).toContain('confidence_scores');
      expect(headers).toContain('needs_review');
      expect(headers).toContain('reviewed_at');
      expect(headers).toContain('validation_warnings');
    });
  });

  test('includes typographic analysis fields in results', async () => {
    // Mock detected source type
    // Note: getResults detects source type internally. We need to mock that process or force it.
    // The current implementation of getResults uses a helper detectSourceType query DB directly.
    // We might need to mock db if we can't hijack detectSourceType easily.
    // However, since we are testing unit logic, we can mock QueryService.list to return our mock data
    // and assume detectSourceType returns 'memorial' (since it defaults to it).

    // Mock data with new fields as JSON strings (simulating DB retrieval)
    const mockRecords = [{
      id: 1,
      memorial_number: '123',
      transcription_raw: 'Here lies|John Doe',
      stone_condition: '{"weathered": true}',
      typography_analysis: '{"style": "gothic"}',
      iconography: '{"motifs": ["cross"]}',
      source_type: 'typographic_analysis'
    }];

    QueryService.prototype.list.mockResolvedValue({ records: mockRecords });

    // Mock validation to return deserialized data
    validateAndConvertRecords.mockReturnValue([{
      ...mockRecords[0],
      stone_condition: { weathered: true },
      typography_analysis: { style: 'gothic' },
      iconography: { motifs: ['cross'] }
    }]);

    // We can't easily mock inner helper detectSourceType without rewiring.
    // But failing to find tables (default) returns 'memorial'.

    await getResults(mockReq, mockRes);

    expect(mockRes.json).toHaveBeenCalled();
    const response = mockRes.json.mock.calls[0][0];
    const item = response.memorials[0];

    // Verify structure
    expect(item.stone_condition).toEqual({ weathered: true });
    expect(item.typography_analysis).toEqual({ style: 'gothic' });
    expect(item.iconography).toEqual({ motifs: ['cross'] });
  });
});
