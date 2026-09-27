/**
 * @jest-environment node
 */

/**
 * Test suite for dataValidation.js
 *
 * Covers issue #124: JSON parse failures must set needs_review = 1 and emit a
 * structured error visible regardless of logger sampling/quietMode.
 *
 * Logger mock note: dataValidation.js requires logger via the relative path
 * './logger', which resolves to the real Logger singleton. logger.error()
 * always calls console.error() regardless of quietMode/sampling, so we spy on
 * console.error to verify structured-error emission.
 */

const { validateAndConvertTypes, validateAndConvertRecords } = require('../../src/utils/dataValidation');

let consoleErrorSpy;

beforeEach(() => {
  // Suppress output while still capturing calls
  consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  consoleErrorSpy.mockRestore();
});

// ---------------------------------------------------------------------------
// validateAndConvertTypes — JSON field parsing
// ---------------------------------------------------------------------------

describe('validateAndConvertTypes — JSON field parsing', () => {
  describe('Happy path: valid JSON strings are parsed', () => {
    it('parses confidence_scores from a valid JSON string', () => {
      const record = {
        confidence_scores: '{"first_name":0.9,"last_name":0.8}',
        needs_review: 0
      };
      const result = validateAndConvertTypes(record);
      expect(result.confidence_scores).toEqual({ first_name: 0.9, last_name: 0.8 });
      expect(result.needs_review).toBe(0);
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('parses validation_warnings from a valid JSON string', () => {
      const record = {
        validation_warnings: '["IMPLAUSIBLE_AGE"]',
        needs_review: 1
      };
      const result = validateAndConvertTypes(record);
      expect(result.validation_warnings).toEqual(['IMPLAUSIBLE_AGE']);
      expect(result.needs_review).toBe(1);
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('passes already-parsed object through unchanged', () => {
      const scores = { first_name: 0.95 };
      const record = { confidence_scores: scores, needs_review: 0 };
      const result = validateAndConvertTypes(record);
      expect(result.confidence_scores).toBe(scores);
      expect(result.needs_review).toBe(0);
    });

    it('treats null confidence_scores as null without flagging', () => {
      const record = { confidence_scores: null, needs_review: 0 };
      const result = validateAndConvertTypes(record);
      expect(result.confidence_scores).toBeNull();
      expect(result.needs_review).toBe(0);
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('treats empty-string confidence_scores as null without flagging', () => {
      const record = { confidence_scores: '', needs_review: 0 };
      const result = validateAndConvertTypes(record);
      expect(result.confidence_scores).toBeNull();
      expect(result.needs_review).toBe(0);
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Unhappy path — corrupted JSON must set needs_review = 1
  // -------------------------------------------------------------------------

  describe('Unhappy path: corrupted JSON sets needs_review = 1 and emits structured error', () => {
    it('sets needs_review = 1 and emits [ERROR] for corrupted confidence_scores', () => {
      const record = {
        confidence_scores: '{invalid-json',
        needs_review: 0
      };
      const result = validateAndConvertTypes(record);
      expect(result.confidence_scores).toBeNull();
      expect(result.needs_review).toBe(1);
      // Real logger.error always calls console.error with [ERROR] prefix
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy.mock.calls[0][0]).toMatch(/\[ERROR\].*confidence_scores/);
    });

    it('sets needs_review = 1 and emits [ERROR] for corrupted validation_warnings', () => {
      const record = {
        validation_warnings: '[broken',
        needs_review: 0
      };
      const result = validateAndConvertTypes(record);
      expect(result.validation_warnings).toBeNull();
      expect(result.needs_review).toBe(1);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy.mock.calls[0][0]).toMatch(/\[ERROR\].*validation_warnings/);
    });

    it('sets needs_review = 1 for corrupted stone_condition (existing JSON field)', () => {
      const record = {
        stone_condition: 'not-valid-json{{{',
        needs_review: 0
      };
      const result = validateAndConvertTypes(record);
      expect(result.stone_condition).toBeNull();
      expect(result.needs_review).toBe(1);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });

    it('preserves a pre-existing needs_review = 1 when JSON also fails', () => {
      const record = {
        confidence_scores: 'not-json',
        needs_review: 1
      };
      const result = validateAndConvertTypes(record);
      expect(result.needs_review).toBe(1);
    });

    it('sets needs_review = 1 when needs_review field is absent', () => {
      const record = { confidence_scores: 'BAD' };
      const result = validateAndConvertTypes(record);
      expect(result.needs_review).toBe(1);
    });

    it('emits one [ERROR] per failing field and sets needs_review = 1 for multiple corrupted fields', () => {
      const record = {
        confidence_scores: '{bad',
        validation_warnings: '{worse',
        needs_review: 0
      };
      const result = validateAndConvertTypes(record);
      expect(result.confidence_scores).toBeNull();
      expect(result.validation_warnings).toBeNull();
      expect(result.needs_review).toBe(1);
      expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
    });

    it('passes the parse Error as the second argument to console.error', () => {
      const record = { confidence_scores: '{bad', needs_review: 0 };
      validateAndConvertTypes(record);
      const [, errorArg] = consoleErrorSpy.mock.calls[0];
      expect(errorArg).toBeInstanceOf(SyntaxError);
    });
  });
});

// ---------------------------------------------------------------------------
// validateAndConvertRecords
// ---------------------------------------------------------------------------

describe('validateAndConvertRecords — per-record isolation', () => {
  it('flags only the corrupted record, leaving clean records unchanged', () => {
    const records = [
      { id: 1, confidence_scores: '{"first_name":0.9}', needs_review: 0 },
      { id: 2, confidence_scores: 'CORRUPTED', needs_review: 0 },
      { id: 3, confidence_scores: null, needs_review: 0 }
    ];
    const results = validateAndConvertRecords(records);

    expect(results[0].needs_review).toBe(0);
    expect(results[0].confidence_scores).toEqual({ first_name: 0.9 });

    expect(results[1].needs_review).toBe(1);
    expect(results[1].confidence_scores).toBeNull();

    expect(results[2].needs_review).toBe(0);
    expect(results[2].confidence_scores).toBeNull();
  });

  it('returns empty array for non-array input', () => {
    expect(validateAndConvertRecords(null)).toEqual([]);
    expect(validateAndConvertRecords('foo')).toEqual([]);
  });
});
