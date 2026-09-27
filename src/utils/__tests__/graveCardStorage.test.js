jest.unmock('fs');
jest.unmock('path');
jest.unmock('sqlite3');

const sqlite3 = require('sqlite3').verbose();

jest.mock('../logger', () => ({
  error: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
  warn: jest.fn(),
}));

describe('GraveCardStorage', () => {
  let db;
  let GraveCardStorage;

  beforeEach(async () => {
    jest.resetModules();
    db = new sqlite3.Database(':memory:');

    // Mock the database module to return our in-memory db
    jest.doMock('../database', () => ({ db, runColumnMigration: jest.fn() }));

    GraveCardStorage = require('../graveCardStorage');

    // Initialize the table
    await GraveCardStorage.initialize();
  });

  afterEach(async () => {
    await new Promise((resolve) => db.close(resolve));
  });

  describe('initialize', () => {
    test('creates grave_cards table with correct schema', async () => {
      const rows = await new Promise((resolve, reject) => {
        db.all('PRAGMA table_info(grave_cards)', (err, result) => {
          if (err) reject(err);
          else resolve(result);
        });
      });

      const columns = rows.reduce((acc, row) => {
        acc[row.name] = row.type;
        return acc;
      }, {});

      expect(columns).toHaveProperty('id', 'INTEGER');
      expect(columns).toHaveProperty('file_name', 'TEXT');
      expect(columns).toHaveProperty('section', 'TEXT');
      expect(columns).toHaveProperty('grave_number', 'TEXT');
      expect(columns).toHaveProperty('data_json', 'TEXT');
      expect(columns).toHaveProperty('processed_date', 'DATETIME');
      expect(columns).toHaveProperty('ai_provider', 'TEXT');
    });
  });

  describe('storeGraveCard', () => {
    const validCard = {
      fileName: 'card_001.pdf',
      ai_provider: 'claude',
      card_metadata: {
        processed_by: 'test-run',
        processing_date: '2025-01-01',
      },
      location: {
        section: 'A',
        grave_number: '123',
      },
      interments: [],
      inscription: { text: 'RIP' },
    };

    test('successfully stores a valid grave card', async () => {
      const id = await GraveCardStorage.storeGraveCard(validCard);
      expect(id).toBeDefined();

      const rows = await new Promise((resolve, reject) => {
        db.all('SELECT * FROM grave_cards', (err, result) => {
          if (err) reject(err);
          else resolve(result);
        });
      });

      expect(rows.length).toBe(1);
      expect(rows[0].file_name).toBe('card_001.pdf');
      expect(rows[0].section).toBe('A');
      expect(rows[0].grave_number).toBe('123');
      expect(rows[0].ai_provider).toBe('claude');

      const storedJson = JSON.parse(rows[0].data_json);
      expect(storedJson).toEqual(validCard);
    });

    test('throws error if required fields missing (fileName)', async () => {
      const invalidCard = { ...validCard };
      delete invalidCard.fileName;

      await expect(GraveCardStorage.storeGraveCard(invalidCard))
        .rejects.toThrow('Missing required metadata: fileName');
    });

    test('stores and retrieves processing_id', async () => {
      const processingId = '550e8400-e29b-41d4-a716-446655440000';
      const cardWithId = { ...validCard, processing_id: processingId };

      const id = await GraveCardStorage.storeGraveCard(cardWithId);

      const rows = await new Promise((resolve, reject) => {
        db.all('SELECT processing_id FROM grave_cards WHERE id = ?', [id], (err, result) => {
          if (err) reject(err);
          else resolve(result);
        });
      });

      expect(rows).toHaveLength(1);
      expect(rows[0].processing_id).toBe(processingId);
    });

    test('rejects duplicate grave cards (same file_name, ai_provider)', async () => {
      // Store first card
      await GraveCardStorage.storeGraveCard(validCard);

      // Try to store duplicate with same file_name and ai_provider
      const duplicate = { ...validCard };

      // Verify error is thrown and has isDuplicate flag
      const error = await GraveCardStorage.storeGraveCard(duplicate).catch(e => e);
      expect(error).toBeInstanceOf(Error);
      expect(error.isDuplicate).toBe(true);
    });

    test('allows same file_name with different ai_provider', async () => {
      // Store card with openai provider
      const card1 = { ...validCard, ai_provider: 'openai' };
      const id1 = await GraveCardStorage.storeGraveCard(card1);
      expect(id1).toBeDefined();

      // Store same file with different provider should succeed
      const card2 = { ...validCard, ai_provider: 'claude' };
      const id2 = await GraveCardStorage.storeGraveCard(card2);
      expect(id2).toBeDefined();
      expect(id1).not.toBe(id2);

      // Verify both records exist
      const rows = await new Promise((resolve, reject) => {
        db.all('SELECT * FROM grave_cards ORDER BY id', (err, result) => {
          if (err) reject(err);
          else resolve(result);
        });
      });

      expect(rows).toHaveLength(2);
      expect(rows[0].ai_provider).toBe('openai');
      expect(rows[1].ai_provider).toBe('claude');
    });
  });

  describe('exportCardsToCsv', () => {
    const card1 = {
      fileName: 'c1.pdf',
      ai_provider: 'gpt',
      location: { section: 'A', grave_number: '1' },
      interments: [
        { name: 'Alice', date_of_death: '1990', age: 80 },
        { name: 'Bob', date_of_death: '1995', age: 85 },
      ],
      inscription: { text: 'In Memory' },
      grave: { status: 'occupied' },
    };

    const card2 = {
      fileName: 'c2.pdf',
      ai_provider: 'gpt',
      location: { section: 'A', grave_number: '2' },
      interments: [
        { name: 'Charlie', date_of_death: '2000', age: 50 },
      ],
      inscription: { text: 'Rest in Peace' },
      grave: { status: 'occupied' },
    };

    beforeEach(async () => {
      await GraveCardStorage.storeGraveCard(card1);
      await GraveCardStorage.storeGraveCard(card2);
    });

    test('generates flattened CSV with dynamic interment columns', async () => {
      const csv = await GraveCardStorage.exportCardsToCsv();

      const lines = csv.split('\n');
      const header = lines[0].split(',');

      // Verify standard headers
      expect(header).toContain('file_name');
      expect(header).toContain('section');
      expect(header).toContain('grave_number');
      expect(header).toContain('inscription_text');

      // Verify flattened interment headers (up to max found, here 2)
      expect(header).toContain('interment_1_name');
      expect(header).toContain('interment_1_age');
      expect(header).toContain('interment_2_name');

      const row1 = lines.find((l) => l.includes('c1.pdf'));
      expect(row1).toBeDefined();
      expect(row1).toContain('Alice');
      expect(row1).toContain('Bob');

      const row2 = lines.find((l) => l.includes('c2.pdf'));
      expect(row2).toBeDefined();
      expect(row2).toContain('Charlie');
      // Should not contain data for interment 2
    });
  });
});
