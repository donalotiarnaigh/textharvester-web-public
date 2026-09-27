const request = require('supertest');
const express = require('express');
const apiRouter = require('../../src/routes/api');

// Mock dependent services
jest.mock('../../src/services/SchemaGenerator');
jest.mock('../../src/services/SchemaManager');
jest.mock('../../src/utils/modelProviders');
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn()
}));

const SchemaGenerator = require('../../src/services/SchemaGenerator');
const SchemaManager = require('../../src/services/SchemaManager');
const { createProvider } = require('../../src/utils/modelProviders');

describe('API Routes', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/schemas', apiRouter);
    jest.clearAllMocks();

    // Setup default successful provider mock
    createProvider.mockReturnValue({
      // Mock provider methods if needed (e.g. for SchemaGenerator internal usage if not mocked)
      // But SchemaGenerator is mocked, so we just need createProvider to return truthy
      analyzeImages: jest.fn(),
      processImage: jest.fn()
    });
  });

  describe('POST /api/schemas/propose', () => {
    it('should return 200 and schema proposal on valid input', async () => {
      // Mock happy path - generateSchema is an instance method
      SchemaGenerator.prototype.generateSchema.mockResolvedValue({
        recommendedName: 'Test Schema',
        fields: []
      });

      const res = await request(app)
        .post('/api/schemas/propose')
        .send({ files: ['test.jpg'] });

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('recommendedName', 'Test Schema');
    });

    it('should return 400 if no files provided', async () => {
      const res = await request(app)
        .post('/api/schemas/propose')
        .send({});

      expect(res.statusCode).toBe(400);
    });
  });

  describe('POST /api/schemas', () => {
    it('should create a schema and return 201', async () => {
      // createSchema returns an object with ID
      SchemaManager.createSchema.mockResolvedValue({ id: 'uuid-123', name: 'My Schema' });

      const res = await request(app)
        .post('/api/schemas')
        .send({
          name: 'My Schema',
          jsonSchema: {}
        });

      expect(res.statusCode).toBe(201);
      expect(res.body).toHaveProperty('id', 'uuid-123');
    });

    it('should return 400 if name is missing', async () => {
      const res = await request(app)
        .post('/api/schemas')
        .send({ jsonSchema: {} });

      expect(res.statusCode).toBe(400);
    });
  });

  describe('GET /api/schemas', () => {
    it('should list schemas', async () => {
      // listSchemas is static
      SchemaManager.listSchemas.mockResolvedValue([
        { id: '1', name: 'Schema 1' }
      ]);

      const res = await request(app).get('/api/schemas');

      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(1);
    });
  });

  describe('GET /api/schemas/:id', () => {
    it('should return a schema by ID', async () => {
      // getSchema is static
      SchemaManager.getSchema.mockResolvedValue({ id: '1', name: 'Schema 1' });

      const res = await request(app).get('/api/schemas/1');

      expect(res.statusCode).toBe(200);
      expect(res.body.id).toBe('1');
    });

    it('should return 404 if schema not found', async () => {
      // getSchema is static
      SchemaManager.getSchema.mockResolvedValue(null);

      const res = await request(app).get('/api/schemas/999');

      expect(res.statusCode).toBe(404);
    });
  });
});
