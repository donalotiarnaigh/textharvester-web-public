const request = require('supertest');
const express = require('express');
const volumeIdRoutes = require('../../src/routes/volumeIdRoutes');

jest.mock('../../src/utils/burialRegisterStorage');

describe('Volume ID Routes', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/volume-ids', volumeIdRoutes);
    jest.clearAllMocks();
  });

  describe('GET /api/volume-ids', () => {
    it('returns 200 with array of volume IDs on success', async () => {
      const burialRegisterStorage = require('../../src/utils/burialRegisterStorage');
      burialRegisterStorage.getDistinctVolumeIds.mockResolvedValueOnce(['vol1', 'vol2', 'vol3']);

      const response = await request(app).get('/api/volume-ids');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        volumeIds: ['vol1', 'vol2', 'vol3']
      });
    });

    it('returns 200 with empty array when no volume IDs exist', async () => {
      const burialRegisterStorage = require('../../src/utils/burialRegisterStorage');
      burialRegisterStorage.getDistinctVolumeIds.mockResolvedValueOnce([]);

      const response = await request(app).get('/api/volume-ids');
      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        volumeIds: []
      });
    });

    it('returns 500 when database error occurs', async () => {
      const burialRegisterStorage = require('../../src/utils/burialRegisterStorage');
      const dbError = new Error('Database connection failed');
      burialRegisterStorage.getDistinctVolumeIds.mockRejectedValueOnce(dbError);

      const response = await request(app).get('/api/volume-ids');
      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        error: 'Failed to fetch volume IDs'
      });
    });

    it('calls burialRegisterStorage.getDistinctVolumeIds()', async () => {
      const burialRegisterStorage = require('../../src/utils/burialRegisterStorage');
      burialRegisterStorage.getDistinctVolumeIds.mockResolvedValueOnce(['vol1']);

      await request(app).get('/api/volume-ids');
      expect(burialRegisterStorage.getDistinctVolumeIds).toHaveBeenCalled();
    });
  });
});
