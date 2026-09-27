const express = require('express');
const request = require('supertest');
const graveCardRoutes = require('../graveCardRoutes');
const graveCardController = require('../../controllers/graveCardController');

// Mock the controller methods
jest.mock('../../controllers/graveCardController', () => ({
  getGraveCards: jest.fn((req, res) => res.status(200).json([])),
  exportGraveCardsCsv: jest.fn((req, res) => res.status(200).send('csv')),
}));

const app = express();
app.use('/api/grave-cards', graveCardRoutes);

describe('Grave Card Routes', () => {
  it('GET /api/grave-cards should call getGraveCards controller', async () => {
    await request(app).get('/api/grave-cards');
    expect(graveCardController.getGraveCards).toHaveBeenCalled();
  });

  it('GET /api/grave-cards/csv should call exportGraveCardsCsv controller', async () => {
    await request(app).get('/api/grave-cards/csv');
    expect(graveCardController.exportGraveCardsCsv).toHaveBeenCalled();
  });
});
