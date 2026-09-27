
const path = require('path');
const fs = require('fs');


// Force real FS because glob needs it, but we mock it to control it if needed (here just pass through)
jest.mock('fs', () => jest.requireActual('fs'));
// Force real sqlite3 to use in-memory DB and support all methods (.all, .run, etc.)
jest.unmock('sqlite3');


// --- 1. Mocks Setup BEFORE imports ---

// --- 1. Mocks Setup BEFORE imports ---

// A. Mock Database (In-Memory)
// We instantiate inside the mock to avoid hoisting issues
jest.mock('../../src/utils/database', () => {
  const sqlite3 = require('sqlite3').verbose();
  const db = new sqlite3.Database(':memory:');

  return {
    db,
    initializeDatabase: jest.fn(),
    initializeBurialRegisterTable: jest.fn(),
    initializeCustomSchemasTable: jest.fn(),
    storeMemorial: jest.fn(),
    getAllMemorials: jest.fn(),
    getMemorialById: jest.fn(),
    clearAllMemorials: jest.fn(),
    backupDatabase: jest.fn(),
  };
});

// Helper to run DDLs synchronously for setup
const setupDb = (db) => new Promise((resolve, _) => {
  db.serialize(() => {
    db.run('CREATE TABLE IF NOT EXISTS custom_schemas (id TEXT PRIMARY KEY, version INTEGER DEFAULT 1, name TEXT UNIQUE NOT NULL, table_name TEXT UNIQUE NOT NULL, json_schema TEXT NOT NULL, system_prompt TEXT, user_prompt_template TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)');
    resolve();
  });
});


// B. Mock Config
jest.mock('../../src/cli/config', () => ({
  loadConfig: jest.fn().mockImplementation(async (input) => ({
    ...input,
    AI_PROVIDER: 'mock_provider',
    BATCH_SIZE: 1
  }))
}));

// C. Mock Logger (Capture logs)
const logs = [];
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn((...args) => {
    const msg = args.map(a => (a instanceof Error ? a.message + '\n' + a.stack : String(a))).join(' ');
    logs.push(msg);
    console.error(...args);
  }),
  debug: jest.fn()
};
jest.mock('../../src/utils/logger', () => mockLogger);
jest.mock('../../src/cli/logger', () => ({
  configureLogger: jest.fn()
}));

// Mock formatError to spy on it
jest.mock('../../src/cli/output', () => ({
  formatOutput: jest.fn(),
  formatError: jest.fn((err) => {
    const errorMsg = `[MOCK FORMAT ERROR] ${err.message}`;
    logs.push(errorMsg);
    if (err.stack) logs.push(err.stack);
    console.error(errorMsg);
  })
}));

// D. Mock Readline (Auto-confirm "y")
jest.mock('readline', () => ({
  createInterface: jest.fn(() => ({
    question: (q, cb) => cb('y'), // Always say yes
    close: jest.fn()
  }))
}));

// E. Mock SchemaGenerator (Deterministic Analysis)
const mockAnalysis = {
  recommendedName: 'Census Record',
  tableName: 'custom_census_schema',
  fields: [
    { name: 'full_name', type: 'string', description: 'Name of person', required: true },
    { name: 'age', type: 'number', description: 'Age in years', required: false },
    { name: 'occupation', type: 'string', description: 'Job title', required: false }
  ],
  jsonSchema: {
    type: 'object',
    properties: {
      full_name: { type: 'string' },
      age: { type: 'number' },
      occupation: { type: 'string' }
    },
    required: ['full_name']
  },
  systemPrompt: 'Extract census data',
  userPromptTemplate: 'Extract from this image'
};

const mockGenerateSchema = jest.fn().mockResolvedValue(mockAnalysis);
jest.mock('../../src/services/SchemaGenerator', () => {
  return jest.fn().mockImplementation(() => ({
    generateSchema: mockGenerateSchema
  }));
});

// F. Mock Model Provider (Deterministic Extraction)
const mockExtractionResult = {
  full_name: 'John Doe',
  age: 42,
  occupation: 'Farmer'
};
const mockProcessImage = jest.fn().mockResolvedValue({
  content: JSON.stringify(mockExtractionResult),
  usage: { input_tokens: 0, output_tokens: 0 },
});

jest.mock('../../src/utils/modelProviders', () => ({
  createProvider: jest.fn(() => ({
    processImage: mockProcessImage,
    getModelVersion: () => 'mock-v1'
  }))
}));

// Mock pdfConverter
jest.mock('../../src/utils/pdfConverter', () => ({
  convertPdfToJpegs: jest.fn().mockImplementation((filePath) => Promise.resolve([filePath]))
}));

// --- 2. Imports ---
// Import commands AFTER mocks
const schemaCommand = require('../../src/cli/commands/schema');
const ingestCommand = require('../../src/cli/commands/ingest');
const SchemaManager = require('../../src/services/SchemaManager');

// --- 3. Test Suite ---

describe('E2E: User-Extensible Schema Flow', () => {
  const sampleFile = path.join(__dirname, 'e2e_census_mock.pdf');
  // Access the shared db instance
  const { db } = require('../../src/utils/database');

  beforeAll(async () => {
    fs.writeFileSync(sampleFile, 'dummy pdf content');
    await setupDb(db);
    // Spy on process.exit
    jest.spyOn(process, 'exit').mockImplementation((code) => {
      if (code !== 0) throw new Error(`Process exited with code ${code}`);
    });
  });

  afterAll(() => {
    jest.restoreAllMocks();
    if (fs.existsSync(sampleFile)) fs.unlinkSync(sampleFile);
    return new Promise((resolve, reject) => {
      db.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });

  test('Full Flow: Propose Schema -> Save -> Ingest -> Verify', async () => {
    // Clear logs
    logs.length = 0;

    // --- Step 1: Run "schema propose" ---
    const { Command } = require('commander');
    const program = new Command();
    program.exitOverride();
    // Do NOT suppress output so we can see errors in Jest logs if they escape
    // program.configureOutput({ writeOut: () => { }, writeErr: () => { } });

    program.addCommand(schemaCommand);

    const absolutePath = path.resolve(sampleFile);

    const proposeArgs = ['schema', 'propose', absolutePath];

    try {
      await program.parseAsync(proposeArgs, { from: 'user' });
    } catch (e) {
      if (e.message.includes('Process exited')) {
        throw new Error(`Schema Propose Command Exited. Logs:\n${logs.join('\n')}`);
      }
      throw e;
    }

    // Verify Generator
    expect(mockGenerateSchema).toHaveBeenCalledWith([expect.stringContaining('e2e_census_mock.pdf')]);

    // Verify Schema
    const schemas = await SchemaManager.listSchemas();
    expect(schemas).toHaveLength(1);
    const savedSchema = schemas[0];
    expect(savedSchema.name).toBe('Census Record');
    expect(savedSchema.table_name).toBe('custom_census_schema');

    // Verify Dynamic Table
    const tables = await new Promise((resolve, reject) => {
      db.all('SELECT name FROM sqlite_master WHERE type=\'table\' AND name=\'custom_census_schema\'', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    expect(tables).toHaveLength(1);

    // --- Step 2: Run "ingest --schema" ---
    const ingestProgram = new Command();
    ingestProgram.exitOverride();
    ingestProgram.addCommand(ingestCommand);

    const schemaId = savedSchema.id;
    const ingestArgs = ['ingest', absolutePath, '--schema', schemaId];

    try {
      await ingestProgram.parseAsync(ingestArgs, { from: 'user' });
    } catch (e) {
      if (e.message.includes('Process exited')) {
        throw new Error(`Ingest Command Exited. Logs:\n${logs.join('\n')}`);
      }
      throw e;
    }

    // Verify Provider
    expect(mockProcessImage).toHaveBeenCalled();

    // Verify Data
    const rows = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM custom_census_schema', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].full_name).toBe('John Doe');
    expect(rows[0].file_name).toBe(path.basename(sampleFile));
  });
});
