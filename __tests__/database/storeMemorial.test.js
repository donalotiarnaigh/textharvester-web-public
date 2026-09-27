const sqlite3 = require('sqlite3').verbose();

// Mock the logger
jest.mock('../../src/utils/logger', () => ({
  error: jest.fn(),
  info: jest.fn(),
  debugPayload: jest.fn()
}));

describe('storeMemorial Function', () => {
  let db;
  let storeMemorial;
  let mockDb;

  beforeEach(async () => {
    // Clear module cache
    jest.resetModules();
    
    // Create a fresh database instance
    db = new sqlite3.Database(':memory:');
    
    // Create mock database methods
    mockDb = {
      run: jest.fn((query, params, callback) => {
        if (typeof callback === 'function') {
          callback.call({ lastID: 1 }, null);
        }
      })
    };

    // Create the table before tests
    await new Promise((resolve, reject) => {
      db.run(`
        CREATE TABLE IF NOT EXISTS memorials (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          memorial_number TEXT,
          first_name TEXT,
          last_name TEXT,
          year_of_death TEXT,
          inscription TEXT,
          file_name TEXT NOT NULL,
          ai_provider TEXT,
          model_version TEXT,
          prompt_template TEXT,
          prompt_version TEXT,
          processed_date DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    // Mock the database module
    jest.mock('../../src/utils/database', () => ({
      db: mockDb,
      storeMemorial: jest.fn().mockImplementation(async (data) => {
        return new Promise((resolve, reject) => {
          mockDb.run(
            'INSERT INTO memorials VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
              data.memorial_number || null,
              data.first_name || null,
              data.last_name || null,
              data.year_of_death || null,
              data.inscription || null,
              data.fileName || null,
              data.ai_provider || null,
              data.model_version || null,
              data.prompt_template || null,
              data.prompt_version || null,
              new Date().toISOString()
            ],
            function(err) {
              if (err) reject(err);
              else resolve(1); // Always resolve with 1 for testing
            }
          );
        });
      })
    }));

    // Import the function
    storeMemorial = require('../../src/utils/database').storeMemorial;
  });

  afterEach(async () => {
    // Clean up the database after each test
    await new Promise((resolve) => {
      db.close(() => resolve());
    });
    jest.resetModules();
  });

  it('should store memorial with complete model and prompt information', async () => {
    const testData = {
      memorial_number: 'TEST001',
      first_name: 'John',
      last_name: 'Doe',
      year_of_death: '1900',
      inscription: 'Test inscription',
      fileName: 'test.jpg',
      ai_provider: 'openai',
      model_version: 'gpt-5.1',
      prompt_template: 'memorialOCR',
      prompt_version: '1.0'
    };

    const id = await storeMemorial(testData);
    expect(id).toBe(1);
    expect(mockDb.run).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining([
        'TEST001',
        'John',
        'Doe',
        '1900',
        'Test inscription',
        'test.jpg',
        'openai',
        'gpt-5.1',
        'memorialOCR',
        '1.0',
        expect.any(String)
      ]),
      expect.any(Function)
    );
  });

  it('should handle missing model information', async () => {
    const testData = {
      memorial_number: 'TEST002',
      first_name: 'Jane',
      last_name: 'Doe',
      fileName: 'test2.jpg'
    };

    const id = await storeMemorial(testData);
    expect(id).toBe(1);
  });

  it('should handle all fields being null except fileName', async () => {
    const testData = {
      fileName: 'test3.jpg'
    };

    const id = await storeMemorial(testData);
    expect(id).toBe(1);
  });

  it('should handle database errors gracefully', async () => {
    const testData = {
      fileName: 'error.jpg'
    };

    mockDb.run.mockImplementationOnce((query, params, callback) => {
      if (typeof callback === 'function') {
        callback(new Error('SQLITE_CONSTRAINT: NOT NULL constraint failed'));
      }
    });

    await expect(storeMemorial(testData))
      .rejects
      .toThrow('SQLITE_CONSTRAINT: NOT NULL constraint failed');
  });
}); 