const request = require('supertest');
const express = require('express');
const graveCardRoutes = require('../../src/routes/graveCardRoutes');
const GraveCardStorage = require('../../src/utils/graveCardStorage');

// Mock dependencies
jest.mock('../../src/utils/graveCardStorage');
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
}));

describe('Grave Card API Integration', () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/api/grave-cards', graveCardRoutes);
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/grave-cards', () => {
    it('should return 200 and a list of cards', async () => {
      const mockCards = [
        {
          id: 1,
          file_name: 'card1.pdf',
          section: 'A',
          grave_number: '101',
          data_json: JSON.stringify({ interments: [] }),
          processed_date: '2025-01-01',
        },
        {
          id: 2,
          file_name: 'card2.pdf',
          section: 'B',
          grave_number: '102',
          data_json: JSON.stringify({ interments: [] }),
          processed_date: '2025-01-02',
        },
      ];

      GraveCardStorage.getAllGraveCards.mockResolvedValue(mockCards);

      const response = await request(app).get('/api/grave-cards');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(mockCards);
      expect(GraveCardStorage.getAllGraveCards).toHaveBeenCalledTimes(1);
    });

    it('should handle errors gracefully', async () => {
      GraveCardStorage.getAllGraveCards.mockRejectedValue(new Error('Database error'));

      const response = await request(app).get('/api/grave-cards');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to retrieve grave cards' });
    });
  });

  describe('GET /api/grave-cards/csv', () => {
    it('should return 200 and CSV content', async () => {
      const mockCsv = 'header1,header2\nval1,val2';
      GraveCardStorage.exportCardsToCsv.mockResolvedValue(mockCsv);

      const response = await request(app).get('/api/grave-cards/csv');

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/csv');
      expect(response.headers['content-disposition']).toContain('attachment; filename=');
      expect(response.text).toBe(mockCsv);
      expect(GraveCardStorage.exportCardsToCsv).toHaveBeenCalledTimes(1);
    });

    it('should handle errors gracefully', async () => {
      GraveCardStorage.exportCardsToCsv.mockRejectedValue(new Error('Export error'));

      const response = await request(app).get('/api/grave-cards/csv');

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ error: 'Failed to export CSV' });
    });
  });
});
