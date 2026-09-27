/**
 * @jest-environment node
 */

// Mock sqlite3 BEFORE importing modules
const mockRun = jest.fn();
const mockGet = jest.fn();
const mockAll = jest.fn();

const MockDatabase = jest.fn(() => ({
  run: mockRun,
  get: mockGet,
  all: mockAll,
  serialize: jest.fn(cb => cb()),
  close: jest.fn()
}));

const mockVerbose = jest.fn(() => ({
  Database: MockDatabase
}));

jest.mock('sqlite3', () => ({
  verbose: mockVerbose,
  Database: MockDatabase
}));

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

describe('Grave Card Storage: updateGraveCard()', () => {
  let updateGraveCard, getGraveCardById;

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    const storage = require('../../src/utils/graveCardStorage');
    updateGraveCard = storage.updateGraveCard;
    getGraveCardById = storage.getGraveCardById;
  });

  it('should merge fields into existing data_json', async () => {
    const currentCard = {
      id: 1,
      file_name: 'test.jpg',
      section: 'A',
      grave_number: '1',
      data_json: JSON.stringify({
        location: { section: 'A', grave_number: '1' },
        grave: { status: 'occupied', dimensions: { length_ft: 6 } },
        inscription: { text: 'RIP' }
      })
    };

    const updates = {
      grave: { status: 'unknown' }
    };

    mockGet.mockImplementationOnce((sql, params, cb) => {
      const data = JSON.parse(currentCard.data_json);
      cb(null, { ...currentCard, data });
    });

    mockRun.mockImplementationOnce((sql, params, cb) => {
      expect(sql).toContain('UPDATE grave_cards');
      expect(sql).toContain('data_json');
      expect(sql).toContain('edited_at');
      cb(null);
    });

    mockGet.mockImplementationOnce((sql, params, cb) => {
      const data = JSON.parse(currentCard.data_json);
      cb(null, { ...currentCard, data });
    });

    const result = await updateGraveCard(1, updates);
    expect(result).toBeDefined();
  });

  it('should preserve non-edited JSON fields', async () => {
    const originalData = {
      location: { section: 'A', grave_number: '1' },
      grave: { status: 'occupied', type: 'single' },
      inscription: { text: 'RIP', notes: 'Original notes' }
    };

    const currentCard = {
      id: 1,
      file_name: 'test.jpg',
      data_json: JSON.stringify(originalData)
    };

    const updates = {
      grave: { status: 'unknown' }
    };

    let capturedParams;
    mockGet.mockImplementationOnce((sql, params, cb) => {
      cb(null, { ...currentCard, data: originalData });
    });

    mockRun.mockImplementationOnce((sql, params, cb) => {
      capturedParams = params;
      cb(null);
    });

    mockGet.mockImplementationOnce((sql, params, cb) => {
      cb(null, { ...currentCard, data: originalData });
    });

    await updateGraveCard(1, updates);

    // data_json param should preserve original inscription and location
    const dataJsonParam = capturedParams.find(p => typeof p === 'string' && p.includes('location'));
    expect(dataJsonParam).toBeTruthy();
    const parsed = JSON.parse(dataJsonParam);
    expect(parsed.inscription.text).toBe('RIP');
    expect(parsed.grave.type).toBe('single');
  });

  it('should update top-level section and grave_number if changed in nested data', async () => {
    const currentCard = {
      id: 1,
      file_name: 'test.jpg',
      section: 'A',
      grave_number: '1',
      data_json: JSON.stringify({})
    };

    const updates = {
      section: 'B',
      grave_number: '2'
    };

    let capturedSql = '';
    mockGet.mockImplementationOnce((sql, params, cb) => {
      cb(null, { ...currentCard, data: {} });
    });

    mockRun.mockImplementationOnce((sql, params, cb) => {
      capturedSql = sql;
      cb(null);
    });

    mockGet.mockImplementationOnce((sql, params, cb) => {
      cb(null, { ...currentCard, data: {} });
    });

    await updateGraveCard(1, updates);

    expect(capturedSql).toContain('section');
    expect(capturedSql).toContain('grave_number');
  });

  it('should set edited_at timestamp', async () => {
    const currentCard = {
      id: 1,
      file_name: 'test.jpg',
      data_json: '{}'
    };

    let capturedSql = '';
    mockGet.mockImplementationOnce((sql, params, cb) => {
      cb(null, { ...currentCard, data: {} });
    });

    mockRun.mockImplementationOnce((sql, params, cb) => {
      capturedSql = sql;
      cb(null);
    });

    mockGet.mockImplementationOnce((sql, params, cb) => {
      cb(null, currentCard);
    });

    await updateGraveCard(1, { grave: { status: 'unknown' } });

    expect(capturedSql).toContain('edited_at');
    expect(capturedSql).toContain('CURRENT_TIMESTAMP');
  });

  it('should store edited_fields as JSON array', async () => {
    const currentCard = {
      id: 1,
      file_name: 'test.jpg',
      data_json: '{}'
    };

    let capturedParams;
    mockGet.mockImplementationOnce((sql, params, cb) => {
      cb(null, { ...currentCard, data: {} });
    });

    mockRun.mockImplementationOnce((sql, params, cb) => {
      capturedParams = params;
      cb(null);
    });

    mockGet.mockImplementationOnce((sql, params, cb) => {
      cb(null, currentCard);
    });

    await updateGraveCard(1, { grave: { status: 'unknown' } });

    const editedFieldsJson = capturedParams.find(p => typeof p === 'string' && p.includes('grave'));
    expect(editedFieldsJson).toBeTruthy();
  });

  it('should return null for non-existent id', async () => {
    mockGet.mockImplementationOnce((sql, params, cb) => {
      cb(null, null);
    });

    const result = await updateGraveCard(999, { grave: { status: 'unknown' } });
    expect(result).toBeNull();
  });

  it('should throw error for invalid id', async () => {
    const error = await updateGraveCard(0, { grave: { status: 'unknown' } })
      .catch(e => e);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain('Invalid');
  });

  it('should throw error for empty fields', async () => {
    const error = await updateGraveCard(1, {})
      .catch(e => e);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).toContain('No fields');
  });

  it('should handle database errors gracefully', async () => {
    const currentCard = {
      id: 1,
      file_name: 'test.jpg',
      data_json: '{}'
    };

    const dbError = new Error('Database error');
    mockGet.mockImplementationOnce((sql, params, cb) => {
      cb(null, { ...currentCard, data: {} });
    });

    mockRun.mockImplementationOnce((sql, params, cb) => {
      cb(dbError);
    });

    const error = await updateGraveCard(1, { grave: { status: 'unknown' } })
      .catch(e => e);
    expect(error).toBe(dbError);
  });
});
