const httpMocks = require('node-mocks-http');
const { getGraveCards, exportGraveCardsCsv } = require('../graveCardController');
const GraveCardStorage = require('../../utils/graveCardStorage');

jest.mock('../../utils/graveCardStorage');
jest.mock('../../utils/logger', () => ({
  error: jest.fn(),
  info: jest.fn(),
}));

describe('GraveCardController', () => {
  let req, res;

  beforeEach(() => {
    req = httpMocks.createRequest();
    res = httpMocks.createResponse();
    jest.clearAllMocks();
  });

  describe('getGraveCards', () => {
    it('should return all grave cards from storage', async () => {
      const mockCards = [
        { id: 1, file_name: 'card1.pdf', data_json: '{}' },
        { id: 2, file_name: 'card2.pdf', data_json: '{}' }
      ];

      // Mock db.all behavior via the storage utility
      // Note: we need to mock the implementation of getAllCards if it existed, 
      // but based on design we might need to add a getAll method to storage first 
      // or use a direct db query. The plan implies the controller calls storage.
      // Let's assume we'll add getAllGraveCards to storage.
      GraveCardStorage.getAllGraveCards = jest.fn().mockResolvedValue(mockCards);

      await getGraveCards(req, res);

      expect(res.statusCode).toBe(200);
      const data = res._getJSONData();
      expect(data).toEqual(mockCards);
    });

    it('should handle errors gracefully', async () => {
      GraveCardStorage.getAllGraveCards = jest.fn().mockRejectedValue(new Error('DB Error'));

      await getGraveCards(req, res);

      expect(res.statusCode).toBe(500);
      const data = res._getJSONData();
      expect(data).toEqual({ error: 'Failed to retrieve grave cards' });
    });
  });

  describe('exportGraveCardsCsv', () => {
    it('should stream CSV download', async () => {
      const mockCsv = 'id,name\n1,Test';
      GraveCardStorage.exportCardsToCsv.mockResolvedValue(mockCsv);

      await exportGraveCardsCsv(req, res);

      expect(res.statusCode).toBe(200);
      expect(res.getHeader('Content-Type')).toBe('text/csv');
      expect(res.getHeader('Content-Disposition')).toMatch(/attachment; filename="grave_cards_.*\.csv"/);
      expect(res._getData()).toBe(mockCsv);
    });

    it('should handle export errors', async () => {
      GraveCardStorage.exportCardsToCsv.mockRejectedValue(new Error('Export Failed'));

      await exportGraveCardsCsv(req, res);

      expect(res.statusCode).toBe(500);
      const data = res._getJSONData(); // node-mocks-http handles json response even if 500
      expect(data).toEqual({ error: 'Failed to export CSV' });
    });
  });
});
