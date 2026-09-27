/**
 * @jest-environment node
 */

/**
 * Tests for eval/scripts/score.js — Ground Truth Scoring Engine
 * Issue #242
 */

// score.js uses the real fs module — unmock it before any require
jest.unmock('fs');

const path = require('path');
const fs = require('fs');
const os = require('os');

const {
  levenshteinDistance,
  characterErrorRate,
  exactMatch,
  scoreDocument,
  computeNeedsReviewMetrics,
  runFullEvaluation,
} = require('../../eval/scripts/score');

// ---------------------------------------------------------------------------
// levenshteinDistance
// ---------------------------------------------------------------------------

describe('levenshteinDistance', () => {
  test('identical strings return 0', () => {
    expect(levenshteinDistance('hello', 'hello')).toBe(0);
  });

  test('empty strings return 0', () => {
    expect(levenshteinDistance('', '')).toBe(0);
  });

  test('one empty string returns length of other', () => {
    expect(levenshteinDistance('abc', '')).toBe(3);
    expect(levenshteinDistance('', 'abc')).toBe(3);
  });

  test('null treated as empty string', () => {
    expect(levenshteinDistance(null, 'abc')).toBe(3);
    expect(levenshteinDistance('abc', null)).toBe(3);
    expect(levenshteinDistance(null, null)).toBe(0);
  });

  test('single substitution returns 1', () => {
    expect(levenshteinDistance('cat', 'bat')).toBe(1);
  });

  test('single insertion returns 1', () => {
    expect(levenshteinDistance('cat', 'cats')).toBe(1);
  });

  test('single deletion returns 1', () => {
    expect(levenshteinDistance('cats', 'cat')).toBe(1);
  });

  test('completely different strings', () => {
    expect(levenshteinDistance('abc', 'xyz')).toBe(3);
  });

  test('case sensitive', () => {
    expect(levenshteinDistance('ABC', 'abc')).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// characterErrorRate
// ---------------------------------------------------------------------------

describe('characterErrorRate', () => {
  test('identical strings return 0', () => {
    expect(characterErrorRate('hello', 'hello')).toBe(0);
  });

  test('both null/empty return 0', () => {
    expect(characterErrorRate(null, null)).toBe(0);
    expect(characterErrorRate('', '')).toBe(0);
  });

  test('predicted non-empty, reference empty returns 1', () => {
    expect(characterErrorRate('abc', '')).toBe(1);
  });

  test('predicted empty, reference non-empty returns 1', () => {
    expect(characterErrorRate('', 'abc')).toBe(1);
  });

  test('single error in 4-char reference', () => {
    // levenshtein('cat', 'cats') = 1, reference length = 4
    expect(characterErrorRate('cat', 'cats')).toBe(0.25);
  });

  test('handles numeric values as strings', () => {
    expect(characterErrorRate(1923, 1923)).toBe(0);
    expect(characterErrorRate(1923, 1924)).toBeCloseTo(0.25);
  });

  test('handles null vs non-empty', () => {
    // null normalises to '', reference 'abc' has length 3, distance 3
    expect(characterErrorRate(null, 'abc')).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// exactMatch
// ---------------------------------------------------------------------------

describe('exactMatch', () => {
  test('identical strings match', () => {
    expect(exactMatch('hello', 'hello')).toBe(1);
  });

  test('different strings do not match', () => {
    expect(exactMatch('hello', 'world')).toBe(0);
  });

  test('null === null matches', () => {
    expect(exactMatch(null, null)).toBe(1);
  });

  test('null vs empty string matches (both normalise to empty)', () => {
    expect(exactMatch(null, '')).toBe(1);
  });

  test('whitespace is trimmed', () => {
    expect(exactMatch('  hello  ', 'hello')).toBe(1);
  });

  test('case sensitive', () => {
    expect(exactMatch('Hello', 'hello')).toBe(0);
  });

  test('numeric values compared as strings', () => {
    expect(exactMatch(1923, '1923')).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// computeNeedsReviewMetrics
// ---------------------------------------------------------------------------

describe('computeNeedsReviewMetrics', () => {
  test('perfect prediction', () => {
    const pairs = [
      { model: true, actual: true },
      { model: false, actual: false },
    ];
    const result = computeNeedsReviewMetrics(pairs);
    expect(result.precision).toBe(1);
    expect(result.recall).toBe(1);
    expect(result.f1).toBe(1);
  });

  test('all false positives', () => {
    const pairs = [
      { model: true, actual: false },
      { model: true, actual: false },
    ];
    const result = computeNeedsReviewMetrics(pairs);
    expect(result.precision).toBe(0);
    expect(result.recall).toBe(0);
    expect(result.f1).toBe(0);
  });

  test('all false negatives', () => {
    const pairs = [
      { model: false, actual: true },
      { model: false, actual: true },
    ];
    const result = computeNeedsReviewMetrics(pairs);
    expect(result.precision).toBe(0);
    expect(result.recall).toBe(0);
    expect(result.f1).toBe(0);
  });

  test('mixed results', () => {
    const pairs = [
      { model: true, actual: true },   // TP
      { model: true, actual: false },   // FP
      { model: false, actual: true },   // FN
      { model: false, actual: false },  // TN
    ];
    const result = computeNeedsReviewMetrics(pairs);
    expect(result.tp).toBe(1);
    expect(result.fp).toBe(1);
    expect(result.fn).toBe(1);
    expect(result.tn).toBe(1);
    expect(result.precision).toBe(0.5);
    expect(result.recall).toBe(0.5);
    expect(result.f1).toBeCloseTo(0.5);
  });

  test('empty pairs', () => {
    const result = computeNeedsReviewMetrics([]);
    expect(result.f1).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// scoreDocument — integration tests with temp GT files
// ---------------------------------------------------------------------------

describe('scoreDocument', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = require('child_process').execSync('mktemp -d').toString().trim();
  });

  afterEach(() => {
    require('child_process').execSync(`rm -rf "${tmpDir}"`);
  });

  function writeGtFile(name, content) {
    const filePath = path.join(tmpDir, name);
    fs.writeFileSync(filePath, JSON.stringify(content, null, 2));
    return filePath;
  }

  test('scores a memorial with perfect model output', () => {
    const gtPath = writeGtFile('test.gt.json', {
      schema_version: '1.0.0',
      document_type: 'memorial',
      image_ref: 'test.jpg',
      annotator: 'test',
      annotation_date: '2026-04-14',
      blind_transcribed: false,
      difficulty: 2,
      annotator_notes: '',
      records: [
        {
          record_index: 0,
          model_output: {
            memorial_number: '5',
            first_name: 'JOHN',
            last_name: 'SMITH',
            year_of_death: '1923',
            inscription: 'IN LOVING MEMORY OF|JOHN SMITH',
          },
          corrected: {
            memorial_number: '5',
            first_name: 'JOHN',
            last_name: 'SMITH',
            year_of_death: '1923',
            inscription: 'IN LOVING MEMORY OF|JOHN SMITH',
          },
          corrections_made: [],
          needs_review_model: false,
          needs_review_actual: false,
        },
      ],
    });

    const result = scoreDocument(gtPath);
    expect(result.document_type).toBe('memorial');
    expect(result.entry_count).toBe(1);
    expect(result.overall_exact_match).toBe(1);
    expect(result.overall_cer).toBe(0);
    expect(result.fields.first_name.exact_match).toBe(1);
  });

  test('scores a memorial with errors in model output', () => {
    const gtPath = writeGtFile('test.gt.json', {
      schema_version: '1.0.0',
      document_type: 'memorial',
      image_ref: 'test.jpg',
      annotator: 'test',
      annotation_date: '2026-04-14',
      blind_transcribed: false,
      difficulty: 3,
      annotator_notes: '',
      records: [
        {
          record_index: 0,
          model_output: {
            memorial_number: '5',
            first_name: 'JOHN',
            last_name: 'SMYTH',
            year_of_death: '1924',
            inscription: 'IN LOVING MEMORY OF|JOHN SMYTH',
          },
          corrected: {
            memorial_number: '5',
            first_name: 'JOHN',
            last_name: 'SMITH',
            year_of_death: '1923',
            inscription: 'IN LOVING MEMORY OF|JOHN SMITH',
          },
          corrections_made: ['last_name', 'year_of_death', 'inscription'],
          needs_review_model: false,
          needs_review_actual: true,
        },
      ],
    });

    const result = scoreDocument(gtPath);
    expect(result.overall_exact_match).toBeLessThan(1);
    // memorial_number and first_name match, last_name/year_of_death/inscription don't
    expect(result.fields.memorial_number.exact_match).toBe(1);
    expect(result.fields.first_name.exact_match).toBe(1);
    expect(result.fields.last_name.exact_match).toBe(0);
    expect(result.fields.year_of_death.exact_match).toBe(0);
    expect(result.fields.last_name.cer).toBeGreaterThan(0);
  });

  test('scores a burial register page', () => {
    const gtPath = writeGtFile('test.gt.json', {
      schema_version: '1.0.0',
      document_type: 'burial_register',
      image_ref: 'test.jpg',
      annotator: 'test',
      annotation_date: '2026-04-14',
      blind_transcribed: false,
      difficulty: 2,
      annotator_notes: '',
      page_level: {
        model_output: {
          parish_header_raw: 'St Mary',
          county_header_raw: 'Cork',
          year_header_raw: '1842',
          page_marginalia_raw: null,
        },
        corrected: {
          parish_header_raw: 'St. Mary',
          county_header_raw: 'Cork',
          year_header_raw: '1842',
          page_marginalia_raw: null,
        },
        corrections_made: ['parish_header_raw'],
      },
      entries: [
        {
          row_index_on_page: 0,
          model_output: {
            entry_no_raw: '137',
            name_raw: 'John Smith',
            abode_raw: 'Blackpool',
            burial_date_raw: 'March 15th',
            age_raw: '84',
            officiant_raw: 'Rev. Jones',
            marginalia_raw: null,
            extra_notes_raw: null,
          },
          corrected: {
            entry_no_raw: '137',
            name_raw: 'John Smith',
            abode_raw: 'Blackpool',
            burial_date_raw: 'March 15th',
            age_raw: '84',
            officiant_raw: 'Rev. Jones',
            marginalia_raw: null,
            extra_notes_raw: null,
          },
          corrections_made: [],
          needs_review_model: false,
          needs_review_actual: false,
        },
      ],
    });

    const result = scoreDocument(gtPath);
    expect(result.document_type).toBe('burial_register');
    expect(result.entry_count).toBe(1);
    // Page-level: 3/4 exact (parish_header differs), entry-level: all match
    expect(result.fields.parish_header_raw.exact_match).toBe(0);
    expect(result.fields.name_raw.exact_match).toBe(1);
  });

  test('handles multiple records in a memorial', () => {
    const gtPath = writeGtFile('test.gt.json', {
      schema_version: '1.0.0',
      document_type: 'memorial',
      image_ref: 'test.jpg',
      annotator: 'test',
      annotation_date: '2026-04-14',
      blind_transcribed: false,
      difficulty: 2,
      annotator_notes: '',
      records: [
        {
          record_index: 0,
          model_output: { memorial_number: '1', first_name: 'JOHN', last_name: 'DOE', year_of_death: '1900', inscription: 'text' },
          corrected: { memorial_number: '1', first_name: 'JOHN', last_name: 'DOE', year_of_death: '1900', inscription: 'text' },
          corrections_made: [],
          needs_review_model: false,
          needs_review_actual: false,
        },
        {
          record_index: 1,
          model_output: { memorial_number: '1', first_name: 'JANE', last_name: 'DOE', year_of_death: '1910', inscription: 'text' },
          corrected: { memorial_number: '1', first_name: 'JANE', last_name: 'DOE', year_of_death: '1905', inscription: 'text' },
          corrections_made: ['year_of_death'],
          needs_review_model: false,
          needs_review_actual: true,
        },
      ],
    });

    const result = scoreDocument(gtPath);
    expect(result.entry_count).toBe(2);
    // year_of_death: 1/2 = 0.5 exact match
    expect(result.fields.year_of_death.exact_match).toBe(0.5);
    // first_name, last_name, memorial_number, inscription: all match
    expect(result.fields.first_name.exact_match).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// runFullEvaluation — integration with empty directory
// ---------------------------------------------------------------------------

describe('runFullEvaluation', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = require('child_process').execSync('mktemp -d').toString().trim();
    fs.mkdirSync(path.join(tmpDir, 'ground-truth', 'burial-registers'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'ground-truth', 'grave-cards'), { recursive: true });
    fs.mkdirSync(path.join(tmpDir, 'ground-truth', 'memorials'), { recursive: true });
  });

  afterEach(() => {
    require('child_process').execSync(`rm -rf "${tmpDir}"`);
  });

  test('returns zero counts for empty directories', () => {
    const report = runFullEvaluation(path.join(tmpDir, 'ground-truth'));
    expect(report.total_documents).toBe(0);
    expect(report.total_entries).toBe(0);
    expect(report.overall_exact_match).toBe(0);
  });

  test('evaluates a single memorial GT file', () => {
    const gtPath = path.join(tmpDir, 'ground-truth', 'memorials', 'test.gt.json');
    fs.writeFileSync(gtPath, JSON.stringify({
      schema_version: '1.0.0',
      document_type: 'memorial',
      image_ref: 'test.jpg',
      annotator: 'test',
      annotation_date: '2026-04-14',
      blind_transcribed: false,
      difficulty: 1,
      annotator_notes: '',
      records: [{
        record_index: 0,
        model_output: { memorial_number: '1', first_name: 'A', last_name: 'B', year_of_death: '1900', inscription: 'text' },
        corrected: { memorial_number: '1', first_name: 'A', last_name: 'B', year_of_death: '1900', inscription: 'text' },
        corrections_made: [],
        needs_review_model: false,
        needs_review_actual: false,
      }],
    }));

    const report = runFullEvaluation(path.join(tmpDir, 'ground-truth'));
    expect(report.total_documents).toBe(1);
    expect(report.total_entries).toBe(1);
    expect(report.overall_exact_match).toBe(1);
    expect(report.by_document_type.memorial).toBeDefined();
    expect(report.by_document_type.memorial.overall_exact_match).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Tracked synthetic fixtures
//
// The real ground truth transcribes client records and is gitignored, so these
// fixtures are the only committed examples of the schema. They must stay valid
// and scoreable, and must never contain real records.
// ---------------------------------------------------------------------------

describe('synthetic fixtures', () => {
  const fixturesDir = path.join(__dirname, '..', '..', 'eval', 'fixtures', 'synthetic');
  const types = ['burial-registers', 'grave-cards', 'memorials'];

  test('cover all three document types', () => {
    for (const type of types) {
      const files = fs.readdirSync(path.join(fixturesDir, type)).filter((f) => f.endsWith('.gt.json'));
      expect(files.length).toBeGreaterThan(0);
    }
  });

  test('score end to end without any client data', () => {
    const report = runFullEvaluation(fixturesDir);
    expect(report.total_documents).toBe(types.length);
    expect(report.total_entries).toBeGreaterThan(0);
    // The fixtures deliberately include corrections, so this must not be perfect.
    expect(report.overall_exact_match).toBeLessThan(1);
    expect(report.overall_exact_match).toBeGreaterThan(0);
  });

  test('are marked synthetic so a real record cannot hide among them', () => {
    for (const type of types) {
      const dir = path.join(fixturesDir, type);
      for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.gt.json'))) {
        const gt = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8'));
        expect(gt.annotator).toBe('synthetic');
        expect(gt.extraction_provider).toBe('synthetic');
      }
    }
  });
});
