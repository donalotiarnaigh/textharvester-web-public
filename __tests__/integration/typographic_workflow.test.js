
const path = require('path');
const fs = require('fs');
// Mock modules before imports
jest.mock('fs', () => jest.requireActual('fs'));
jest.unmock('sqlite3');

// --- 1. Mocks Setup ---

// A. Mock Config
jest.mock('../../src/cli/config', () => ({
  loadConfig: jest.fn().mockImplementation(async (input) => ({
    ...input,
    AI_PROVIDER: 'mock_provider',
    BATCH_SIZE: 1
  }))
}));

// B. Mock Database (In-Memory)
jest.mock('../../src/utils/database', () => {
  const sqlite3 = jest.requireActual('sqlite3').verbose();
  const db = new sqlite3.Database(':memory:');

  return {
    db,
    initializeDatabase: jest.fn(), // We'll manually init tables
    initializeBurialRegisterTable: jest.fn(),
    initializeCustomSchemasTable: jest.fn(),
    // We want the real storeMemorial logic but bound to our mock DB if possible, 
    // OR we just mock successful storage and assume unit tests cover the SQL.
    // However, for an Integration Test, using the REAL functions on an in-memory DB is better.
    // But since `database.js` exports a singleton `db`, we are mocking the module.
    // The "Right Way" for this integration test given the module structure is to mock the EXPORTS 
    // but implement them using the local `db` instance.

    storeMemorial: jest.fn().mockImplementation((data) => {
      return new Promise((resolve, reject) => {
        // Simplified insert for testing logic flow
        const stmt = db.prepare(`
                INSERT INTO memorials (
                    file_name, transcription_raw, stone_condition, typography_analysis, iconography,
                    source_type, status
                ) VALUES (?, ?, ?, ?, ?, ?, 'processed')
            `);
        const typographyStr = data.typography_analysis ? JSON.stringify(data.typography_analysis) : null;
        const iconographyStr = data.iconography ? JSON.stringify(data.iconography) : null;

        stmt.run(
          data.fileName,
          data.transcription_raw,
          data.stone_condition,
          typographyStr,
          iconographyStr,
          data.source_type,
          function (err) {
            if (err) reject(err);
            else resolve(this.lastID);
          }
        );
        stmt.finalize();
      });
    }),
    getAllMemorials: jest.fn(),
    getMemorialById: jest.fn(),
    clearAllMemorials: jest.fn(),
    backupDatabase: jest.fn(),
  };
});

// C. Mock Logger
const logs = [];
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn((...args) => {
    logs.push(args.join(' '));
  }),
  debug: jest.fn()
};
jest.mock('../../src/utils/logger', () => mockLogger);
jest.mock('../../src/cli/logger', () => ({
  configureLogger: jest.fn()
}));

// D. Mock Output
jest.mock('../../src/cli/output', () => ({
  formatOutput: jest.fn(),
  formatError: jest.fn((err) => {
    console.error(err);
  })
}));

// E. Mock Model Provider
jest.mock('../../src/utils/modelProviders', () => {
  const mockResult = {
    transcription_raw: 'HERE LIES\\nJOHN DOE',
    stone_condition: 'Good',
    typography_analysis: {
      method: 'incised',
      style: 'serif',
      features: ['ligature']
    },
    iconography: {
      symbol_type: 'religious',
      description: 'Cross'
    }
  };

  return {
    createProvider: jest.fn(() => ({
      processImage: jest.fn().mockResolvedValue({ content: mockResult, usage: { input_tokens: 0, output_tokens: 0 } }),
      getModelVersion: () => 'mock-v1'
    }))
  };
});


// --- 2. Imports ---
const ingestCommand = require('../../src/cli/commands/ingest');
const { db } = require('../../src/utils/database'); // The mocked one

const mockAnalysisResult = {
  transcription_raw: 'HERE LIES\\nJOHN DOE',
  stone_condition: 'Good',
  typography_analysis: {
    method: 'incised',
    style: 'serif',
    features: ['ligature']
  },
  iconography: {
    symbol_type: 'religious',
    description: 'Cross'
  }
};

describe('Integration: Typographic Analysis Workflow', () => {
  const sampleFile = path.join(__dirname, 'typo_test_image.png');

  beforeAll(() => {
    // Create valid 1x1 PNG image
    const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    fs.writeFileSync(sampleFile, Buffer.from(pngBase64, 'base64'));

    // Initialize In-Memory DB Table
    return new Promise((resolve, reject) => {
      db.serialize(() => {
        db.run(`
                CREATE TABLE memorials (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    file_name TEXT,
                    transcription_raw TEXT,
                    stone_condition TEXT,
                    typography_analysis TEXT,
                    iconography TEXT,
                    source_type TEXT,
                    status TEXT,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            `, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
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

  test('Ingest with source_type=typographic_analysis stores correct data', async () => {
    const { Command } = require('commander');
    const program = new Command();
    program.exitOverride();
    program.addCommand(ingestCommand);

    const args = ['ingest', sampleFile, '--source-type', 'typographic_analysis'];

    // Run command
    await program.parseAsync(args, { from: 'user' });

    // Verify DB contents
    const rows = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM memorials', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    expect(rows).toHaveLength(1);
    const record = rows[0];

    expect(record.file_name).toContain('typo_test_image.png');
    expect(record.source_type).toBe('typographic_analysis');
    expect(record.transcription_raw).toBe(mockAnalysisResult.transcription_raw);
    expect(record.stone_condition).toBe(mockAnalysisResult.stone_condition);

    // Verify JSON fields
    const typo = JSON.parse(record.typography_analysis);
    expect(typo.method).toBe('incised');

    const icon = JSON.parse(record.iconography);
    expect(icon.symbol_type).toBe('religious');
  });
});
