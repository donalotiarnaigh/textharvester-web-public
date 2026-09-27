/**
 * @jest-environment node
 */

/**
 * Test suite for llmAuditLog.js audit logging storage layer
 * Tests persistence of full LLM prompts, responses, and metadata
 */

jest.mock('../../src/utils/logger', () => ({
  error: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn()
}));

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn(() => true),
  mkdirSync: jest.fn()
}));

describe('LLM Audit Log Storage', () => {
  let llmAuditLog;
  let logger;

  // Create a simple mock database
  const mockDb = {
    run: jest.fn((sql, params, callback) => {
      // Simulate successful insert
      setImmediate(() => {
        callback.call({ lastID: Math.floor(Math.random() * 1000) + 1 }, null);
      });
    }),
    all: jest.fn((sql, params, callback) => {
      // Simulate query result
      setImmediate(() => {
        callback(null, []);
      });
    }),
    get: jest.fn((sql, params, callback) => {
      setImmediate(() => {
        callback(null, null);
      });
    }),
    close: jest.fn((callback) => {
      if (callback) callback();
    })
  };

  jest.mock('../../src/utils/database', () => ({
    db: mockDb
  }));

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.run.mockClear();
    mockDb.all.mockClear();
    mockDb.get.mockClear();

    llmAuditLog = require('../../src/utils/llmAuditLog');
    logger = require('../../src/utils/logger');
  });

  test('should export initialize function', () => {
    expect(typeof llmAuditLog.initialize).toBe('function');
  });

  test('should export logEntry function', () => {
    expect(typeof llmAuditLog.logEntry).toBe('function');
  });

  test('should export getEntriesByProcessingId function', () => {
    expect(typeof llmAuditLog.getEntriesByProcessingId).toBe('function');
  });

  test('should call db.run when initializing', async () => {
    // First call: CREATE TABLE (1-arg callback). Subsequent calls: migrations (1-arg callback).
    mockDb.run.mockImplementation((sql, callback) => {
      setImmediate(() => callback(null));
    });

    await llmAuditLog.initialize();

    expect(mockDb.run).toHaveBeenCalled();
    const firstCall = mockDb.run.mock.calls[0][0];
    expect(firstCall).toContain('CREATE TABLE IF NOT EXISTS llm_audit_log');
  });

  test('should run cache column migrations on initialize', async () => {
    mockDb.run.mockImplementation((sql, callback) => {
      setImmediate(() => callback(null));
    });

    await llmAuditLog.initialize();

    const sqlCalls = mockDb.run.mock.calls.map(c => c[0]);
    expect(sqlCalls.some(sql => sql.includes('cache_creation_tokens'))).toBe(true);
    expect(sqlCalls.some(sql => sql.includes('cache_read_tokens'))).toBe(true);
  });

  test('should call db.run with INSERT when logging an entry', async () => {
    mockDb.run.mockImplementation((sql, params, callback) => {
      expect(sql).toContain('INSERT INTO llm_audit_log');
      expect(params).toHaveLength(14);
      expect(params[0]).toBe('test-proc-001');
      expect(params[1]).toBe('openai');
      setImmediate(() => {
        callback.call({ lastID: 1 }, null);
      });
    });

    const id = await llmAuditLog.logEntry({
      processing_id: 'test-proc-001',
      provider: 'openai',
      model: 'gpt-5.4',
      system_prompt: 'Extract text.',
      user_prompt: 'Analyze.',
      image_size_bytes: 5000,
      raw_response: '{"text": "test"}',
      input_tokens: 100,
      output_tokens: 50,
      response_time_ms: 1500,
      status: 'success'
    });

    expect(mockDb.run).toHaveBeenCalled();
    expect(id).toBe(1);
  });

  test('should call db.all when querying entries', async () => {
    const mockEntries = [
      { id: 1, processing_id: 'test-001', provider: 'openai', status: 'success' }
    ];

    mockDb.all.mockImplementation((sql, params, callback) => {
      expect(sql).toContain('SELECT * FROM llm_audit_log WHERE processing_id');
      expect(params[0]).toBe('test-001');
      setImmediate(() => {
        callback(null, mockEntries);
      });
    });

    const entries = await llmAuditLog.getEntriesByProcessingId('test-001');

    expect(mockDb.all).toHaveBeenCalled();
    expect(entries).toEqual(mockEntries);
  });

  test('should handle database errors in logEntry gracefully', async () => {
    mockDb.run.mockImplementation((sql, params, callback) => {
      setImmediate(() => {
        callback(new Error('Database error'));
      });
    });

    const id = await llmAuditLog.logEntry({
      processing_id: 'error-test',
      provider: 'test',
      model: 'test-model'
    });

    // Should return undefined and not throw
    expect(id).toBeUndefined();
  });

  test('should handle database errors in getEntriesByProcessingId gracefully', async () => {
    mockDb.all.mockImplementation((sql, params, callback) => {
      setImmediate(() => {
        callback(new Error('Query error'));
      });
    });

    const entries = await llmAuditLog.getEntriesByProcessingId('error-test');

    // Should return empty array instead of throwing
    expect(entries).toEqual([]);
  });

  test('should return empty array when db.all returns null', async () => {
    mockDb.all.mockImplementation((sql, params, callback) => {
      setImmediate(() => {
        callback(null, null);
      });
    });

    const entries = await llmAuditLog.getEntriesByProcessingId('unknown');

    expect(entries).toEqual([]);
  });

  test('should store all required fields in audit log entry', async () => {
    let capturedParams;
    mockDb.run.mockImplementation((sql, params, callback) => {
      capturedParams = params;
      setImmediate(() => {
        callback.call({ lastID: 1 }, null);
      });
    });

    await llmAuditLog.logEntry({
      processing_id: 'test-complete',
      provider: 'anthropic',
      model: 'claude-opus-4-6',
      system_prompt: 'System prompt text',
      user_prompt: 'User prompt text',
      image_size_bytes: 10000,
      raw_response: 'Raw response text',
      input_tokens: 250,
      output_tokens: 150,
      response_time_ms: 2500,
      status: 'success',
      error_message: null
    });

    expect(capturedParams).toEqual([
      'test-complete',
      'anthropic',
      'claude-opus-4-6',
      'System prompt text',
      'User prompt text',
      10000,
      'Raw response text',
      250,
      150,
      0,   // cache_creation_tokens default
      0,   // cache_read_tokens default
      2500,
      'success',
      null
    ]);
  });

  test('should store cache_creation_tokens and cache_read_tokens when provided', async () => {
    let capturedParams;
    mockDb.run.mockImplementation((sql, params, callback) => {
      capturedParams = params;
      setImmediate(() => {
        callback.call({ lastID: 1 }, null);
      });
    });

    await llmAuditLog.logEntry({
      processing_id: 'cache-test',
      provider: 'anthropic',
      model: 'claude-opus-4-6',
      input_tokens: 100,
      output_tokens: 50,
      cache_creation_tokens: 300,
      cache_read_tokens: 200,
      response_time_ms: 1000,
      status: 'success'
    });

    const cacheCreationIdx = capturedParams.indexOf(300);
    const cacheReadIdx = capturedParams.indexOf(200);
    expect(cacheCreationIdx).toBeGreaterThan(-1);
    expect(cacheReadIdx).toBeGreaterThan(-1);
    expect(cacheReadIdx).toBe(cacheCreationIdx + 1);
  });
});
