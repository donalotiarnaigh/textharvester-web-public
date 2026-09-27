// Mock dependencies - MUST BE DEFINED BEFORE IMPORTS
jest.mock('../../src/services/SchemaManager');
jest.mock('../../src/utils/database', () => ({
  db: {
    run: jest.fn(),
    all: jest.fn(),
  },
}));
jest.mock('../../src/utils/modelProviders');
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  debugPayload: jest.fn(),
}));
jest.mock('../../src/utils/imageProcessor');
jest.mock('fs', () => {
  const originalModule = jest.requireActual('fs');
  return {
    ...originalModule,
    promises: {
      ...originalModule.promises,
      readFile: jest.fn(),
      unlink: jest.fn(),
    },
  };
});
jest.mock('../../src/utils/pdfConverter', () => ({
  convertPdfToJpegs: jest.fn(),
}));
jest.mock('../../src/utils/llmAuditLog', () => ({
  logEntry: jest.fn().mockResolvedValue(undefined),
}));

const DynamicProcessor = require('../../src/utils/dynamicProcessing');
const SchemaManager = require('../../src/services/SchemaManager');
const { db } = require('../../src/utils/database');
const { createProvider } = require('../../src/utils/modelProviders');
const logger = require('../../src/utils/logger');
const { analyzeImageForProvider, optimizeImageForProvider } = require('../../src/utils/imageProcessor');
const fs = require('fs').promises;
const { convertPdfToJpegs } = require('../../src/utils/pdfConverter');
const llmAuditLog = require('../../src/utils/llmAuditLog');

// Helper to build the provider response format used by all providers
const makeProviderResponse = (content, usage = { input_tokens: 10, output_tokens: 20 }) => ({
  content,
  usage,
});

describe('DynamicProcessor', () => {
  let processor;
  let mockProvider;

  const mockSchema = {
    id: 'test-schema-id',
    name: 'Test Schema',
    table_name: 'custom_test_table',
    json_schema: {
      type: 'object',
      properties: {
        field1: { type: 'string' },
        field2: { type: 'number' },
      },
      required: ['field1'],
    },
    system_prompt: 'System Prompt',
    user_prompt_template: 'User Prompt Template',
  };

  const mockFile = {
    path: '/tmp/test.jpg',
    filename: 'test.jpg',
  };

  // Standard table columns returned by PRAGMA table_info
  const mockTableColumns = [
    { name: 'id' },
    { name: 'file_name' },
    { name: 'processed_date' },
    { name: 'ai_provider' },
    { name: 'model_version' },
    { name: 'batch_id' },
    { name: 'processing_id' },
    { name: 'input_tokens' },
    { name: 'output_tokens' },
    { name: 'estimated_cost_usd' },
    { name: 'needs_review' },
    { name: 'field1' },
    { name: 'field2' },
  ];

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock provider
    mockProvider = {
      processImage: jest.fn(),
      getModelVersion: jest.fn().mockReturnValue('gpt-4-test'),
    };
    createProvider.mockReturnValue(mockProvider);

    // Setup FS and Image Processor mocks
    fs.readFile.mockResolvedValue('mock-base64-content');
    analyzeImageForProvider.mockResolvedValue({ needsOptimization: false });
    optimizeImageForProvider.mockResolvedValue('optimized-base64-content');

    // Setup PDF mock
    convertPdfToJpegs.mockResolvedValue(['/tmp/page1.jpg']);

    // Setup PRAGMA table_info mock (returns columns so insert filtering works)
    db.all.mockImplementation((sql, params, callback) => {
      callback(null, mockTableColumns);
    });

    const logger = require('../../src/utils/logger');
    processor = new DynamicProcessor(logger);
  });

  /*
   * Happy Path: Valid schema ID, LLM returns valid JSON, DB insert succeeds.
   */
  test('processFileWithSchema successfully extracts and stores data', async () => {
    // 1. Mock SchemaManager to return a schema
    SchemaManager.getSchema.mockResolvedValue(mockSchema);

    // 2. Mock LLM response — providers return { content, usage }
    mockProvider.processImage.mockResolvedValue(
      makeProviderResponse({ field1: 'value1', field2: 123 })
    );

    // 3. Mock DB insert success
    db.run.mockImplementation((sql, params, callback) => {
      callback.call({ lastID: 1 }, null);
    });

    // Execute
    const result = await processor.processFileWithSchema(mockFile, 'test-schema-id');

    // Verify Schema Fetch
    expect(SchemaManager.getSchema).toHaveBeenCalledWith('test-schema-id');

    // Verify File Read (since needsOptimization=false)
    expect(fs.readFile).toHaveBeenCalledWith('/tmp/test.jpg', { encoding: 'base64' });

    // Verify LLM Call
    expect(createProvider).toHaveBeenCalled();
    expect(mockProvider.processImage).toHaveBeenCalledWith(
      'mock-base64-content',
      expect.any(String),
      expect.any(Object)
    );

    // Verify DB Insert
    expect(db.run).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO custom_test_table'),
      expect.any(Array),
      expect.any(Function)
    );

    // Verify Result
    expect(result.success).toBe(true);
    expect(result.recordCount).toBe(1);
    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toMatchObject({ field1: 'value1', field2: 123 });
  });

  /*
   * Cost tracking: token usage and estimated cost should be included in insert
   */
  test('processFileWithSchema includes cost metadata in DB insert', async () => {
    SchemaManager.getSchema.mockResolvedValue(mockSchema);

    mockProvider.processImage.mockResolvedValue(
      makeProviderResponse({ field1: 'value1', field2: 123 }, { input_tokens: 500, output_tokens: 200 })
    );

    db.run.mockImplementation((sql, params, callback) => {
      callback.call({ lastID: 1 }, null);
    });

    await processor.processFileWithSchema(mockFile, 'test-schema-id');

    const [, insertValues] = db.run.mock.calls[0];
    const [sql] = db.run.mock.calls[0];

    expect(sql).toContain('input_tokens');
    expect(sql).toContain('output_tokens');
    expect(sql).toContain('processing_id');
    expect(sql).toContain('needs_review');
    expect(insertValues).toContain(500);
    expect(insertValues).toContain(200);
  });

  /*
   * Audit logging: successful processing should log to LLM audit log
   */
  test('processFileWithSchema logs to LLM audit log on success', async () => {
    SchemaManager.getSchema.mockResolvedValue(mockSchema);
    mockProvider.processImage.mockResolvedValue(
      makeProviderResponse({ field1: 'value1', field2: 123 }, { input_tokens: 50, output_tokens: 30 })
    );
    db.run.mockImplementation((sql, params, callback) => {
      callback.call({ lastID: 1 }, null);
    });

    await processor.processFileWithSchema(mockFile, 'test-schema-id');

    expect(llmAuditLog.logEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: expect.any(String),
        model: 'gpt-4-test',
        input_tokens: 50,
        output_tokens: 30,
        status: 'success',
        processing_id: expect.any(String),
      })
    );
  });

  /*
   * Observability: LLM returns JSON missing required field -> Validation Error after retries
   */
  test('processFileWithSchema throws on validation failure after retries', async () => {
    SchemaManager.getSchema.mockResolvedValue(mockSchema);

    // Invalid: missing 'field1' which is required
    mockProvider.processImage.mockResolvedValue(
      makeProviderResponse({ field2: 123 })
    );

    await expect(processor.processFileWithSchema(mockFile, 'test-schema-id'))
      .rejects.toThrow(/Validation failed/);
  });

  /*
   * Audit logging: failed processing should log error to LLM audit log
   */
  test('processFileWithSchema logs error to LLM audit log on failure', async () => {
    SchemaManager.getSchema.mockResolvedValue(mockSchema);
    mockProvider.processImage.mockResolvedValue(
      makeProviderResponse({ field2: 123 })
    );

    await expect(processor.processFileWithSchema(mockFile, 'test-schema-id'))
      .rejects.toThrow();

    // Should have logged at least one audit entry with error status
    const auditCalls = llmAuditLog.logEntry.mock.calls;
    const errorCall = auditCalls.find(([entry]) => entry.status === 'error');
    expect(errorCall).toBeDefined();
    expect(errorCall[0]).toMatchObject({
      status: 'error',
      error_message: expect.any(String),
    });
  });

  /*
   * Unhappy Path: Schema ID not found
   */
  test('processFileWithSchema throws error if schema not found', async () => {
    SchemaManager.getSchema.mockResolvedValue(null);

    await expect(processor.processFileWithSchema(mockFile, 'non-existent-id'))
      .rejects.toThrow('Invalid Schema ID');

    expect(mockProvider.processImage).not.toHaveBeenCalled();
  });

  /*
   * Unhappy Path: SQL Error during insertion
   */
  test('processFileWithSchema throws and logs if DB insert fails', async () => {
    SchemaManager.getSchema.mockResolvedValue(mockSchema);
    mockProvider.processImage.mockResolvedValue(
      makeProviderResponse({ field1: 'val', field2: 1 })
    );

    // Mock DB failure
    const dbError = new Error('SQL Constraint Violation');
    db.run.mockImplementation((sql, params, callback) => {
      callback(dbError);
    });

    await expect(processor.processFileWithSchema(mockFile, 'test-schema-id'))
      .rejects.toThrow('SQL Constraint Violation');

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('Database insertion failed'),
      expect.any(Object)
    );
  });

  /*
   * Feature: Handle multi-record extraction (Array)
   * Schema expects single object, but LLM returns { entries: [obj1, obj2] } or [obj1, obj2]
   */
  test('processFileWithSchema handles nested array output (multi-record)', async () => {
    SchemaManager.getSchema.mockResolvedValue(mockSchema);

    // LLM returns nested array instead of single object
    mockProvider.processImage.mockResolvedValue(
      makeProviderResponse({
        entries: [
          { field1: 'Record A', field2: 10 },
          { field1: 'Record B', field2: 20 }
        ]
      })
    );

    // Mock DB insert success for multiple calls
    db.run.mockImplementation((sql, params, callback) => {
      callback.call({ lastID: 123 }, null);
    });

    const result = await processor.processFileWithSchema(mockFile, 'test-schema-id');

    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(2);
    expect(result.data[0]).toMatchObject({ field1: 'Record A' });
    expect(result.data[1]).toMatchObject({ field1: 'Record B' });

    // DB should have been called twice
    expect(db.run).toHaveBeenCalledTimes(2);
  });

  /*
   * Feature: Handle multi-record extraction with deeply nested context
   */
  test('processFileWithSchema merges context from parent objects into nested array records', async () => {
    SchemaManager.getSchema.mockResolvedValue({
      ...mockSchema,
      json_schema: {
        type: 'object',
        properties: {
          topField: { type: 'string' },
          midField: { type: 'string' },
          itemField: { type: 'string' }
        },
        required: ['topField', 'midField', 'itemField']
      }
    });

    // Also update PRAGMA mock for the extended schema columns
    db.all.mockImplementation((sql, params, callback) => {
      callback(null, [
        ...mockTableColumns,
        { name: 'topField' },
        { name: 'midField' },
        { name: 'itemField' },
      ]);
    });

    mockProvider.processImage.mockResolvedValue(
      makeProviderResponse({
        topField: 'TOP',
        middle: {
          midField: 'MID',
          entries: [
            { itemField: 'ITEM1' },
            { itemField: 'ITEM2' }
          ]
        }
      })
    );

    // Mock DB insert
    db.run.mockImplementation((sql, params, callback) => callback.call({ lastID: 999 }, null));

    const result = await processor.processFileWithSchema(mockFile, 'test-schema-id');

    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(2);
    expect(result.data[0]).toMatchObject({
      topField: 'TOP',
      midField: 'MID',
      itemField: 'ITEM1'
    });
    expect(result.data[1]).toMatchObject({
      itemField: 'ITEM2'
    });
  });

  /*
   * Backward compat: old tables without new metadata columns should still work
   * (PRAGMA returns only old columns, new metadata is silently dropped)
   */
  test('processFileWithSchema gracefully handles old tables without metadata columns', async () => {
    SchemaManager.getSchema.mockResolvedValue(mockSchema);

    // Old table has only original columns, no processing_id/input_tokens/etc.
    db.all.mockImplementation((sql, params, callback) => {
      callback(null, [
        { name: 'id' },
        { name: 'file_name' },
        { name: 'processed_date' },
        { name: 'ai_provider' },
        { name: 'model_version' },
        { name: 'batch_id' },
        { name: 'field1' },
        { name: 'field2' },
      ]);
    });

    mockProvider.processImage.mockResolvedValue(
      makeProviderResponse({ field1: 'value1', field2: 42 })
    );

    db.run.mockImplementation((sql, params, callback) => {
      callback.call({ lastID: 1 }, null);
    });

    const result = await processor.processFileWithSchema(mockFile, 'test-schema-id');

    expect(result.success).toBe(true);
    // Insert should only include columns that exist in old table
    const [sql] = db.run.mock.calls[0];
    expect(sql).not.toContain('processing_id');
    expect(sql).not.toContain('input_tokens');
  });
});
