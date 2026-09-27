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

describe('MonumentClassificationStorage', () => {
  let db;
  let MonumentClassificationStorage;

  beforeEach(async () => {
    jest.resetModules();
    db = new sqlite3.Database(':memory:');

    jest.doMock('../database', () => ({ db, runColumnMigration: jest.fn() }));

    MonumentClassificationStorage = require('../monumentClassificationStorage');

    await MonumentClassificationStorage.initialize();
  });

  afterEach(async () => {
    await new Promise((resolve) => db.close(resolve));
  });

  describe('initialize', () => {
    test('creates monument_classifications table with correct schema', async () => {
      const rows = await new Promise((resolve, reject) => {
        db.all('PRAGMA table_info(monument_classifications)', (err, result) => {
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
      expect(columns).toHaveProperty('broad_type', 'TEXT');
      expect(columns).toHaveProperty('data_json', 'TEXT');
      expect(columns).toHaveProperty('processed_date', 'DATETIME');
      expect(columns).toHaveProperty('ai_provider', 'TEXT');
      expect(columns).toHaveProperty('confidence_scores', 'TEXT');
      expect(columns).toHaveProperty('needs_review', 'INTEGER');
      expect(columns).toHaveProperty('validation_warnings', 'TEXT');
      expect(columns).toHaveProperty('input_tokens', 'INTEGER');
      expect(columns).toHaveProperty('output_tokens', 'INTEGER');
      expect(columns).toHaveProperty('estimated_cost_usd', 'REAL');
      expect(columns).toHaveProperty('processing_id', 'TEXT');
    });
  });

  describe('storeClassification', () => {
    const validClassification = {
      fileName: 'monument_001.jpg',
      broad_type: 'Headstone',
      ai_provider: 'openai',
      memorial_number: '123',
      detailed_type: 'Headstone with round top',
      memorial_condition: 'Sound and in situ',
      inscription_condition: 'All legible',
      height_mm: 1200,
      width_mm: 600,
      depth_mm: 100,
      material_primary: 'Granite',
      material_base: null,
      orientation: 'N',
      additional_elements: 'Footstone present',
      text_panel_shape: 'Rectangle',
      text_panel_definition: 'Rectilinear',
      inscription_technique: 'Incised',
      letter_style: 'Roman',
      central_motifs: 'Cross',
      marginal_motifs: 'Floral border',
      date_of_monument: '1850-1870',
      confidence_level: 'High',
      comments: 'Well-preserved example'
    };

    test('successfully stores a valid classification', async () => {
      const id = await MonumentClassificationStorage.storeClassification(validClassification);
      expect(id).toBeDefined();
      expect(typeof id).toBe('number');

      const rows = await new Promise((resolve, reject) => {
        db.all('SELECT * FROM monument_classifications', (err, result) => {
          if (err) reject(err);
          else resolve(result);
        });
      });

      expect(rows.length).toBe(1);
      expect(rows[0].file_name).toBe('monument_001.jpg');
      expect(rows[0].broad_type).toBe('Headstone');
      expect(rows[0].ai_provider).toBe('openai');
    });

    test('returns inserted row ID', async () => {
      const id = await MonumentClassificationStorage.storeClassification(validClassification);
      expect(id).toBe(1);

      const id2 = await MonumentClassificationStorage.storeClassification(validClassification);
      expect(id2).toBe(2);
    });

    test('throws error if required fileName is missing', async () => {
      const invalid = { ...validClassification };
      delete invalid.fileName;

      await expect(MonumentClassificationStorage.storeClassification(invalid)).rejects.toThrow();
    });

    test('stores cost columns', async () => {
      const classified = {
        ...validClassification,
        input_tokens: 1500,
        output_tokens: 500,
        estimated_cost_usd: 0.0025
      };

      await MonumentClassificationStorage.storeClassification(classified);

      const rows = await new Promise((resolve, reject) => {
        db.all('SELECT * FROM monument_classifications', (err, result) => {
          if (err) reject(err);
          else resolve(result);
        });
      });

      expect(rows[0].input_tokens).toBe(1500);
      expect(rows[0].output_tokens).toBe(500);
      expect(rows[0].estimated_cost_usd).toBe(0.0025);
    });

    test('stores processing_id', async () => {
      const classified = {
        ...validClassification,
        processing_id: 'uuid-1234-5678'
      };

      await MonumentClassificationStorage.storeClassification(classified);

      const rows = await new Promise((resolve, reject) => {
        db.all('SELECT * FROM monument_classifications', (err, result) => {
          if (err) reject(err);
          else resolve(result);
        });
      });

      expect(rows[0].processing_id).toBe('uuid-1234-5678');
    });

    test('stores confidence_scores, needs_review, and validation_warnings', async () => {
      const classified = {
        ...validClassification,
        confidence_scores: JSON.stringify({ confidence_level: 0.9 }),
        needs_review: 0,
        validation_warnings: JSON.stringify([])
      };

      await MonumentClassificationStorage.storeClassification(classified);

      const rows = await new Promise((resolve, reject) => {
        db.all('SELECT * FROM monument_classifications', (err, result) => {
          if (err) reject(err);
          else resolve(result);
        });
      });

      expect(rows[0].confidence_scores).toBe(JSON.stringify({ confidence_level: 0.9 }));
      expect(rows[0].needs_review).toBe(0);
      expect(rows[0].validation_warnings).toBe(JSON.stringify([]));
    });
  });

  describe('getAllClassifications', () => {
    test('returns empty array when no records exist', async () => {
      const results = await MonumentClassificationStorage.getAllClassifications();
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(0);
    });

    test('returns all records ordered by processed_date', async () => {
      const class1 = {
        fileName: 'mon1.jpg',
        broad_type: 'Headstone'
      };
      const class2 = {
        fileName: 'mon2.jpg',
        broad_type: 'Cross'
      };

      await MonumentClassificationStorage.storeClassification(class1);
      await MonumentClassificationStorage.storeClassification(class2);

      const results = await MonumentClassificationStorage.getAllClassifications();
      expect(results.length).toBe(2);
      // Check that both records are returned
      const fileNames = results.map(r => r.file_name);
      expect(fileNames).toContain('mon1.jpg');
      expect(fileNames).toContain('mon2.jpg');
    });

    test('parses data_json field', async () => {
      const classification = {
        fileName: 'mon.jpg',
        broad_type: 'Headstone',
        memorial_number: '456',
        height_mm: 1500
      };

      await MonumentClassificationStorage.storeClassification(classification);

      const results = await MonumentClassificationStorage.getAllClassifications();
      expect(results[0].data).toBeDefined();
      expect(results[0].data.broad_type).toBe('Headstone');
      expect(results[0].data.memorial_number).toBe('456');
    });

    test('handles invalid JSON gracefully', async () => {
      // Manually insert corrupted JSON
      await new Promise((resolve, reject) => {
        db.run(
          'INSERT INTO monument_classifications (file_name, broad_type, data_json) VALUES (?, ?, ?)',
          ['bad.jpg', 'Headstone', '{invalid json'],
          (err) => {
            if (err) reject(err);
            else resolve();
          }
        );
      });

      const results = await MonumentClassificationStorage.getAllClassifications();
      expect(results.length).toBe(1);
      expect(results[0].data).toBeNull();
      expect(results[0].error).toBe('Invalid JSON data');
    });
  });

  describe('getClassificationById', () => {
    test('returns single record by ID', async () => {
      const classification = {
        fileName: 'mon.jpg',
        broad_type: 'Headstone',
        memorial_number: '789'
      };

      const id = await MonumentClassificationStorage.storeClassification(classification);

      const result = await MonumentClassificationStorage.getClassificationById(id);
      expect(result).toBeDefined();
      expect(result.file_name).toBe('mon.jpg');
      expect(result.data.broad_type).toBe('Headstone');
      expect(result.data.memorial_number).toBe('789');
    });

    test('returns null for non-existent ID', async () => {
      const result = await MonumentClassificationStorage.getClassificationById(999);
      expect(result).toBeNull();
    });

    test('parses data_json in retrieved record', async () => {
      const classification = {
        fileName: 'mon.jpg',
        broad_type: 'Tomb',
        height_mm: 2000,
        width_mm: 1000
      };

      const id = await MonumentClassificationStorage.storeClassification(classification);
      const result = await MonumentClassificationStorage.getClassificationById(id);

      expect(result.data.broad_type).toBe('Tomb');
      expect(result.data.height_mm).toBe(2000);
      expect(result.data.width_mm).toBe(1000);
    });
  });

  describe('clearAllClassifications', () => {
    test('deletes all records', async () => {
      const class1 = { fileName: 'mon1.jpg', broad_type: 'Headstone' };
      const class2 = { fileName: 'mon2.jpg', broad_type: 'Cross' };

      await MonumentClassificationStorage.storeClassification(class1);
      await MonumentClassificationStorage.storeClassification(class2);

      let results = await MonumentClassificationStorage.getAllClassifications();
      expect(results.length).toBe(2);

      await MonumentClassificationStorage.clearAllClassifications();

      results = await MonumentClassificationStorage.getAllClassifications();
      expect(results.length).toBe(0);
    });
  });
});
