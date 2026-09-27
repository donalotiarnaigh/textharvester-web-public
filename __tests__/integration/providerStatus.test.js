/**
 * @jest-environment node
 */

const request = require('supertest');
const express = require('express');
const { getProviderStatus } = require('../../src/utils/apiKeyValidator');

describe('GET /api/providers/status', () => {
  const originalEnv = process.env;
  let app;

  beforeAll(() => {
    app = express();
    app.get('/api/providers/status', (req, res) => {
      res.json({ providers: getProviderStatus() });
    });
  });

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.GEMINI_API_KEY;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should return 200 with provider availability', async () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    const response = await request(app).get('/api/providers/status');
    expect(response.status).toBe(200);
    expect(response.body.providers.openai.available).toBe(true);
    expect(response.body.providers.anthropic.available).toBe(false);
    expect(response.body.providers.gemini.available).toBe(false);
  });

  it('should return correct response shape with name and keyCreationUrl', async () => {
    const response = await request(app).get('/api/providers/status');
    expect(response.body).toHaveProperty('providers');
    for (const key of ['openai', 'anthropic', 'gemini']) {
      expect(response.body.providers[key]).toHaveProperty('available');
      expect(response.body.providers[key]).toHaveProperty('name');
      expect(response.body.providers[key]).toHaveProperty('keyCreationUrl');
    }
  });

  it('should not expose actual API key values in response', async () => {
    process.env.OPENAI_API_KEY = 'sk-super-secret-12345';
    process.env.ANTHROPIC_API_KEY = 'sk-ant-secret-67890';
    const response = await request(app).get('/api/providers/status');
    const body = JSON.stringify(response.body);
    expect(body).not.toContain('sk-super-secret-12345');
    expect(body).not.toContain('sk-ant-secret-67890');
  });
});
