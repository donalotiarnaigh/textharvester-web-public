/**
 * @jest-environment node
 */

/**
 * Test suite for database.js storage layer updates
 * Tests storeMemorial() function with typographic analysis columns.
 * 
 * Requirements covered:
 * - 4.1: storeMemorial() with full typographic data stores all fields
 * - 4.4: JSON fields serialized correctly in database
 * - 5.1: Null analysis fields stored as NULL (not empty string)
 * - 5.2: Existing storeMemorial() calls work unchanged (backward compat)
 * 
 * @see docs/typographic-analysis/tasks.md Task 1.3/1.4
 */

// 1. Mock sqlite3 BEFORE importing the database module
const mockRun = jest.fn();
const mockAll = jest.fn();
const mockGet = jest.fn();

// Mock Database class structure
const MockDatabase = jest.fn(() => ({
  run: mockRun,
  all: mockAll,
  get: mockGet,
  serialize: jest.fn(cb => cb()), // execute callback immediately
  close: jest.fn()
}));

// Mock verbose() to return the same object containing Database
const mockVerbose = jest.fn(() => ({
  Database: MockDatabase
}));

jest.mock('sqlite3', () => ({
  verbose: mockVerbose,
  Database: MockDatabase // In case verbose() isn't called directly for the class
}));

// Mock logger to suppress output
jest.mock('../../src/utils/logger', () => ({
  error: jest.fn(),
  info: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn()
}));

// Mock fs and mkdirSync to prevent directory creation issues
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn(() => true), // pretend DB dir exists
  mkdirSync: jest.fn()
}));

describe('Database Storage Layer: Typographic Analysis Fields', () => {
  let storeMemorial;

  // Test fixtures from design.md
  const validCompleteData = {
    memorial_number: null,
    first_name: 'JOHN',
    last_name: 'SMITH',
    year_of_death: 1857,
    inscription: 'IN LOVING MEMORY OF JOHN SMITH',
    fileName: 'test_memorial.jpg',
    ai_provider: 'openai',
    model_version: 'gpt-5.1',
    prompt_template: 'TypographicAnalysisPrompt',
    prompt_version: '1.0.0',
    source_type: 'typographic_analysis',
    site_code: 'TEST01',
    transcription_raw: 'IN LOVING MEMORY|OF|JOHN SMITH|WHO DEPARTED THIS LIFE|APRIL 10TH 1857|AGED 72 YEARS|R.I.P.',
    stone_condition: 'Limestone, moderate weathering, moss on lower portion',
    typography_analysis: {
      serif_style: 'Roman serif with bracketed terminals',
      italic_usage: false,
      long_s_present: false,
      thorn_present: false,
      superscript_usage: ['TH'],
      case_style: 'All capitals',
      letter_consistency_notes: null
    },
    iconography: {
      visual_motifs: ['Celtic cross', 'IHS monogram'],
      geometric_elements: ['Concentric circles at cross center'],
      border_foliage: ['Cordate leaves', 'Undulating vine border'],
      daisy_wheels: false,
      style_technique: {
        period: 'Victorian Gothic Revival',
        carving_depth: 'High relief',
        regional_style: 'Irish rural'
      }
    },
    structural_observations: '7 rows, centered alignment, decreasing font size toward bottom'
  };

  const legacyData = {
    memorial_number: 123,
    first_name: 'MARY',
    last_name: 'DOE',
    year_of_death: 1920,
    inscription: 'MARY DOE RIP',
    fileName: 'legacy_memorial.jpg',
    ai_provider: 'anthropic',
    model_version: 'claude-3-sonnet',
    prompt_template: 'MemorialOCRPrompt',
    prompt_version: '1.0.0',
    source_type: 'memorial',
    site_code: 'LEGACY01'
    // No typographic analysis fields - backward compatibility test
  };

  beforeAll(() => {
    // Require the REAL database module
    // It will use the mocked sqlite3
    jest.isolateModules(() => {
      const dbModule = require('../../src/utils/database');
      storeMemorial = dbModule.storeMemorial;
    });
  });

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Default behavior for run: callback with success and lastID
    mockRun.mockImplementation(function (sql, params, callback) {
      // params is optional in sqlite3, so check arguments
      const cb = typeof params === 'function' ? params : callback;
      if (cb) {
        // Call with 'this' context having lastID
        cb.call({ lastID: 1 }, null);
      }
      return this;
    });
  });

  describe('Happy Path: Full Typographic Data Storage', () => {
    /**
         * Requirement 4.1: storeMemorial() with full typographic data stores all fields
         */
    it('should store all typographic analysis fields when provided', async () => {
      const data = validCompleteData;
      const id = await storeMemorial(data);

      expect(id).toBe(1);

      // Verify the SQL and params passed to db.run
      const [sql, params] = mockRun.mock.calls.find(call =>
        call[0].includes('INSERT INTO memorials')
      );

      // Check SQL contains new columns
      expect(sql).toContain('transcription_raw');
      expect(sql).toContain('stone_condition');
      expect(sql).toContain('typography_analysis');
      expect(sql).toContain('iconography');
      expect(sql).toContain('structural_observations');

      // Check params contain mapped values
      // 0-11: Original fields
      // 12: transcription_raw
      // 13: stone_condition
      // 14: typography_analysis (JSON)
      // 15: iconography (JSON)
      // 16: structural_observations
      // 17: confidence_scores (JSON)
      // 18: confidence_coverage
      // 19: disagreement_score
      // 20: needs_review
      // 21: validation_warnings (JSON)
      // 22: input_tokens
      // 23: output_tokens
      // 24: estimated_cost_usd
      // 25: processing_id
      // 26: project_id
      expect(params).toHaveLength(27);

      expect(params[12]).toBe(data.transcription_raw);
      expect(params[13]).toBe(data.stone_condition);
      expect(JSON.parse(params[14])).toEqual(data.typography_analysis);
      expect(JSON.parse(params[15])).toEqual(data.iconography);
      expect(params[16]).toBe(data.structural_observations);
      // 17: confidence_scores
      // 18: confidence_coverage
      // 19: disagreement_score
      // 20: needs_review
      // 21: validation_warnings
      // 22-24: Cost columns
      expect(typeof params[22]).toBe('number'); // input_tokens
      expect(typeof params[23]).toBe('number'); // output_tokens
      expect(typeof params[24]).toBe('number'); // estimated_cost_usd
    });

    /**
         * Requirement 4.4: JSON fields serialized correctly in database
         */
    it('should serialize typography_analysis object to valid JSON string', async () => {
      const data = {
        ...validCompleteData,
        typography_analysis: {
          serif_style: 'Roman serif',
          long_s_present: true,
          superscript_usage: ['th', 'nd']
        }
      };

      await storeMemorial(data);

      const [, params] = mockRun.mock.calls.find(call => call[0].includes('INSERT INTO memorials'));
      const typographyJson = params[14];

      expect(typeof typographyJson).toBe('string');
      const parsed = JSON.parse(typographyJson);
      expect(parsed.serif_style).toBe('Roman serif');
      expect(parsed.long_s_present).toBe(true);
      expect(parsed.superscript_usage).toEqual(['th', 'nd']);
    });

    it('should serialize iconography object with nested style_technique', async () => {
      const iconographyData = {
        visual_motifs: ['Celtic cross'],
        daisy_wheels: false,
        style_technique: {
          period: 'Victorian',
          carving_depth: 'High relief'
        }
      };

      const data = {
        ...validCompleteData,
        iconography: iconographyData
      };

      await storeMemorial(data);

      const [, params] = mockRun.mock.calls.find(call => call[0].includes('INSERT INTO memorials'));
      const iconographyJson = params[15];

      expect(typeof iconographyJson).toBe('string');
      const parsed = JSON.parse(iconographyJson);
      expect(parsed.visual_motifs).toEqual(['Celtic cross']);
      expect(parsed.style_technique.period).toBe('Victorian');
    });

    /**
         * Requirement 2.1/2.2: Historical characters (ſ, þ) preserved in transcription_raw
         */
    it('should preserve historical characters (long-s, thorn) in transcription_raw', async () => {
      const transcriptionWithHistorical = 'HERE LYETH þe BODY|OF THOMAS ſMITH|WHO DEPARTED þIS LIFE';

      const data = {
        ...validCompleteData,
        transcription_raw: transcriptionWithHistorical
      };

      await storeMemorial(data);

      const [, params] = mockRun.mock.calls.find(call => call[0].includes('INSERT INTO memorials'));
      const storedTranscription = params[12];

      expect(storedTranscription).toBe(transcriptionWithHistorical);
      expect(storedTranscription).toContain('ſ');
      expect(storedTranscription).toContain('þ');
    });
  });

  describe('Happy Path: Null Handling', () => {
    /**
         * Requirement 5.1: Null analysis fields stored as NULL (not empty string)
         */
    it('should store NULL for null analysis fields, not empty string', async () => {
      const data = {
        fileName: 'test.jpg',
        ai_provider: 'openai',
        source_type: 'typographic_analysis',
        transcription_raw: 'SOME TEXT|LINE 2',
        stone_condition: null,
        typography_analysis: null,
        iconography: null,
        structural_observations: null
      };

      await storeMemorial(data);

      const [, params] = mockRun.mock.calls.find(call => call[0].includes('INSERT INTO memorials'));

      // Null analysis fields should be null, not empty string
      expect(params[13]).toBeNull(); // stone_condition
      expect(params[14]).toBeNull(); // typography_analysis
      expect(params[15]).toBeNull(); // iconography
      expect(params[16]).toBeNull(); // structural_observations

      // But transcription_raw should have its value
      expect(params[12]).toBe('SOME TEXT|LINE 2');
    });
  });

  describe('Backward Compatibility', () => {
    /**
         * Requirement 5.2: Existing storeMemorial() calls work unchanged
         */
    it('should store records without new fields (backward compat)', async () => {
      const data = legacyData;

      await storeMemorial(data);

      const [, params] = mockRun.mock.calls.find(call => call[0].includes('INSERT INTO memorials'));

      // Original fields should be stored correctly
      // 0=memorial_number, 1=first_name, 2=last_name (names might be different order, checking based on previous usage)
      // SQL: memorial_number, first_name, last_name, year_of_death...
      // Let's rely on mapping logic being consistent

      // New typographic fields should be null when not provided
      expect(params[12]).toBeNull(); // transcription_raw
      expect(params[13]).toBeNull(); // stone_condition
      expect(params[14]).toBeNull(); // typography_analysis
      expect(params[15]).toBeNull(); // iconography
      expect(params[16]).toBeNull(); // structural_observations
    });
  });

  describe('Unhappy Path: Error Handling', () => {
    /**
         * Requirement 4.4: Circular reference in iconography throws serialization error
         */
    it('should throw serialization error for circular reference in iconography', async () => {
      // Create circular reference
      const circular = { visual_motifs: [] };
      circular.self = circular;

      const data = {
        fileName: 'test.jpg',
        iconography: circular
      };

      // storeMemorial calls JSON.stringify which throws
      await expect(storeMemorial(data)).rejects.toThrow(/circular|cyclic/i);
    });

    /**
         * Edge case: Undefined vs null distinction
         */
    it('should handle undefined values same as null', async () => {
      const data = {
        fileName: 'test.jpg',
        ai_provider: 'openai',
        transcription_raw: undefined,
        stone_condition: undefined
      };

      await storeMemorial(data);

      const [, params] = mockRun.mock.calls.find(call => call[0].includes('INSERT INTO memorials'));

      // undefined should become null
      expect(params[12]).toBeNull(); // transcription_raw
      expect(params[13]).toBeNull(); // stone_condition
    });

    /**
         * Error case: Database error should propagate
         */
    it('should propagate database errors', async () => {
      // Make mock throw error for next call
      mockRun.mockImplementationOnce((sql, params, cb) => {
        const callback = typeof params === 'function' ? params : cb;
        callback(new Error('DB Error'));
      });

      await expect(storeMemorial({ fileName: 'error.jpg' }))
        .rejects.toThrow('DB Error');
    });

    /**
     * Duplicate detection: SQLITE_CONSTRAINT should set isDuplicate flag
     */
    it('should catch SQLITE_CONSTRAINT and set isDuplicate flag', async () => {
      // Make mock return SQLITE_CONSTRAINT error with UNIQUE constraint message
      mockRun.mockImplementationOnce((sql, params, cb) => {
        const callback = typeof params === 'function' ? params : cb;
        const err = new Error('UNIQUE constraint failed: memorials(file_name, ai_provider)');
        err.code = 'SQLITE_CONSTRAINT';
        callback(err);
      });

      const data = {
        ...validCompleteData,
        fileName: 'duplicate_memorial.jpg'
      };

      const error = await storeMemorial(data).catch(e => e);
      expect(error).toBeInstanceOf(Error);
      expect(error.isDuplicate).toBe(true);
      expect(error.message).toContain('Duplicate');
    });

    /**
     * Non-constraint errors should not have isDuplicate flag
     */
    it('should not set isDuplicate for non-UNIQUE constraint errors', async () => {
      // Make mock return generic database error
      mockRun.mockImplementationOnce((sql, params, cb) => {
        const callback = typeof params === 'function' ? params : cb;
        const err = new Error('Disk I/O error');
        err.code = 'SQLITE_IOERR';
        callback(err);
      });

      const data = { ...validCompleteData };

      const error = await storeMemorial(data).catch(e => e);
      expect(error).toBeInstanceOf(Error);
      expect(error.isDuplicate).toBeUndefined();
      expect(error.message).toBe('Disk I/O error');
    });
  });

  describe('Update Operations: updateMemorial()', () => {
    let updateMemorial;

    beforeEach(() => {
      // Re-import to get fresh mock state
      jest.resetModules();
      const db = require('../../src/utils/database');
      updateMemorial = db.updateMemorial;
    });

    it('should update editable fields and return updated row', async () => {
      const updates = {
        first_name: 'JANE',
        inscription: 'Updated inscription'
      };

      const updatedRow = {
        id: 1,
        first_name: 'JANE',
        inscription: 'Updated inscription',
        edited_at: '2026-04-03T12:00:00.000Z',
        edited_fields: JSON.stringify(['first_name', 'inscription'])
      };

      mockRun.mockImplementationOnce((sql, params, cb) => {
        expect(sql).toContain('UPDATE memorials');
        expect(sql).toContain('first_name');
        expect(sql).toContain('inscription');
        expect(sql).toContain('edited_at');
        cb(null);
      });

      mockGet.mockImplementationOnce((sql, params, cb) => {
        cb(null, updatedRow);
      });

      const result = await updateMemorial(1, updates);
      expect(result).toEqual(updatedRow);
    });

    it('should return null for non-existent id', async () => {
      const updates = { first_name: 'JANE' };

      mockRun.mockImplementationOnce((sql, params, cb) => cb(null));
      mockGet.mockImplementationOnce((sql, params, cb) => {
        cb(null, null); // Not found
      });

      const result = await updateMemorial(999, updates);
      expect(result).toBeNull();
    });

    it('should ignore non-editable fields (ai_provider, tokens, etc.)', async () => {
      const updates = {
        first_name: 'JANE',
        ai_provider: 'anthropic', // Should be ignored
        input_tokens: 500, // Should be ignored
        processed_date: '2026-04-03' // Should be ignored
      };

      mockRun.mockImplementationOnce((sql, params, cb) => {
        expect(sql).toContain('first_name');
        expect(sql).not.toContain('ai_provider');
        expect(sql).not.toContain('input_tokens');
        expect(sql).not.toContain('processed_date');
        cb(null);
      });

      mockGet.mockImplementationOnce((sql, params, cb) => {
        cb(null, { id: 1, first_name: 'JANE' });
      });

      await updateMemorial(1, updates);
    });

    it('should set edited_at timestamp', async () => {
      const updates = { first_name: 'JANE' };

      let capturedSql = '';
      mockRun.mockImplementationOnce((sql, params, cb) => {
        capturedSql = sql;
        cb(null);
      });

      mockGet.mockImplementationOnce((sql, params, cb) => {
        cb(null, { id: 1, first_name: 'JANE' });
      });

      await updateMemorial(1, updates);
      expect(capturedSql).toContain('edited_at');
      expect(capturedSql).toContain('CURRENT_TIMESTAMP');
    });

    it('should store edited_fields as JSON array of changed field names', async () => {
      const updates = {
        first_name: 'JANE',
        inscription: 'New inscription'
      };

      let capturedParams;
      mockRun.mockImplementationOnce((sql, params, cb) => {
        capturedParams = params;
        cb(null);
      });

      mockGet.mockImplementationOnce((sql, params, cb) => {
        cb(null, { id: 1 });
      });

      await updateMemorial(1, updates);

      // Find the edited_fields parameter
      const editedFieldsJson = capturedParams.find(p =>
        typeof p === 'string' && p.includes('first_name')
      );
      expect(editedFieldsJson).toBeTruthy();
    });

    it('should validate year_of_death format', async () => {
      const validUpdates = [
        { year_of_death: '1857' },
        { year_of_death: '1800-1900' },
        { year_of_death: '-' },
        { year_of_death: null }
      ];

      for (const update of validUpdates) {
        mockRun.mockImplementationOnce((sql, params, cb) => cb(null));
        mockGet.mockImplementationOnce((sql, params, cb) => cb(null, { id: 1 }));

        const result = await updateMemorial(1, update);
        expect(result).toBeTruthy();
      }
    });

    it('should reject invalid year_of_death (outside 1500-2100 range)', async () => {
      const invalidUpdates = [
        { year_of_death: '1000' },
        { year_of_death: '2500' }
      ];

      for (const update of invalidUpdates) {
        const error = await updateMemorial(1, update).catch(e => e);
        expect(error).toBeInstanceOf(Error);
      }
    });

    /**
     * Regression #244: updateMemorial() bound JSON-typed editable fields raw, so
     * an inline edit wrote an object where the column expects JSON text. The read
     * path then failed JSON.parse, nulled the field, and forced needs_review = 1.
     */
    it('should JSON-serialize typography_analysis and iconography objects (#244)', async () => {
      const typography = {
        serif_style: 'Roman serif with bracketed terminals',
        superscript_usage: ['TH']
      };
      const iconography = {
        visual_motifs: ['ribbed volutes'],
        style_technique: { carving_depth: 'High relief' }
      };

      let capturedParams;
      mockRun.mockImplementationOnce((sql, params, cb) => {
        capturedParams = params;
        cb(null);
      });
      mockGet.mockImplementationOnce((sql, params, cb) => cb(null, { id: 1 }));

      await updateMemorial(1, {
        typography_analysis: typography,
        iconography
      });

      expect(typeof capturedParams[0]).toBe('string');
      expect(typeof capturedParams[1]).toBe('string');
      expect(JSON.parse(capturedParams[0])).toEqual(typography);
      expect(JSON.parse(capturedParams[1])).toEqual(iconography);
    });

    it('should reject when a JSON field cannot be serialized (#244)', async () => {
      const circular = { visual_motifs: [] };
      circular.self = circular;

      const error = await updateMemorial(1, { iconography: circular }).catch(e => e);

      expect(error).toBeInstanceOf(Error);
      expect(error.message).toMatch(/^Serialization error for field:/);
      // The failure must happen before any UPDATE is issued, so the row is untouched.
      const updateCalls = mockRun.mock.calls.filter(call => call[0].includes('UPDATE memorials'));
      expect(updateCalls).toHaveLength(0);
    });

    it('should leave pre-serialized string and null JSON fields unchanged (#244)', async () => {
      const preSerialized = '{"serif_style":"gothic"}';

      let capturedParams;
      mockRun.mockImplementationOnce((sql, params, cb) => {
        capturedParams = params;
        cb(null);
      });
      mockGet.mockImplementationOnce((sql, params, cb) => cb(null, { id: 1 }));

      await updateMemorial(1, {
        typography_analysis: preSerialized,
        iconography: null
      });

      expect(capturedParams[0]).toBe(preSerialized);
      expect(capturedParams[1]).toBeNull();
    });
  });

  describe('Update Operations: markAsReviewed()', () => {
    let markAsReviewed;

    beforeEach(() => {
      jest.resetModules();
      const db = require('../../src/utils/database');
      markAsReviewed = db.markAsReviewed;
    });

    it('should set needs_review=0 and reviewed_at=CURRENT_TIMESTAMP', async () => {
      let capturedSql = '';
      mockRun.mockImplementationOnce((sql, params, cb) => {
        capturedSql = sql;
        cb(null);
      });

      mockGet.mockImplementationOnce((sql, params, cb) => {
        cb(null, { id: 1, needs_review: 0, reviewed_at: '2026-04-03T12:00:00Z' });
      });

      await markAsReviewed('memorials', 1);
      expect(capturedSql).toContain('needs_review = 0');
      expect(capturedSql).toContain('reviewed_at');
      expect(capturedSql).toContain('CURRENT_TIMESTAMP');
    });

    it('should return null for non-existent id', async () => {
      mockRun.mockImplementationOnce((sql, params, cb) => cb(null));
      mockGet.mockImplementationOnce((sql, params, cb) => cb(null, null));

      const result = await markAsReviewed('memorials', 999);
      expect(result).toBeNull();
    });

    it('should work for all 3 table names', async () => {
      const tables = ['memorials', 'burial_register_entries', 'grave_cards'];

      for (const table of tables) {
        mockRun.mockImplementationOnce((sql, params, cb) => {
          expect(sql).toContain(`UPDATE ${table}`);
          cb(null);
        });

        mockGet.mockImplementationOnce((sql, params, cb) => {
          cb(null, { id: 1, needs_review: 0 });
        });

        await markAsReviewed(table, 1);
      }
    });

    it('should reject invalid table names (SQL injection protection)', async () => {
      const error = await markAsReviewed('invalid_table; DROP TABLE memorials;--', 1)
        .catch(e => e);
      expect(error).toBeInstanceOf(Error);
    });
  });
});
