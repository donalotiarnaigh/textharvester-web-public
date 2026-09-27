jest.unmock('fs');
const fs = jest.requireActual('fs');
const os = require('os');
const path = require('path');

jest.mock('sqlite3', () => {
  const mockState = { burialEntries: [], lastId: 0 };

  class Database {
    constructor(dbPath, mode, callback) {
      if (typeof mode === 'function') {
        callback = mode;
      }

      if (callback) {
        setTimeout(() => callback(null), 0);
      }
    }

    serialize(fn) {
      fn();
    }

    run(sql, params, callback) {
      if (typeof params === 'function') {
        callback = params;
        params = [];
      }

      const normalizedSql = sql.trim().toUpperCase();

      if (normalizedSql.startsWith('CREATE TABLE')
        || normalizedSql.startsWith('CREATE INDEX')
        || normalizedSql.startsWith('BEGIN')
        || normalizedSql.startsWith('COMMIT')
        || normalizedSql.startsWith('ROLLBACK')) {
        if (callback) callback(null);
        return;
      }

      if (/INSERT INTO\s+BURIAL_REGISTER_ENTRIES/i.test(normalizedSql)) {
        const [
          volume_id,
          page_number,
          row_index_on_page,
          entry_id,
          entry_no_raw,
          name_raw,
          abode_raw,
          burial_date_raw,
          age_raw,
          officiant_raw,
          marginalia_raw,
          extra_notes_raw,
          row_ocr_raw,
          parish_header_raw,
          county_header_raw,
          year_header_raw,
          model_name,
          model_run_id,
          uncertainty_flags,
          file_name,
          ai_provider,
          prompt_template,
          prompt_version
        ] = params;

        const duplicate = mockState.burialEntries.find(entry =>
          entry.volume_id === volume_id
          && entry.page_number === page_number
          && entry.row_index_on_page === row_index_on_page
          && entry.ai_provider === ai_provider
        );

        if (duplicate) {
          const error = new Error('SQLITE_CONSTRAINT: UNIQUE constraint failed: burial_register_entries.volume_id, page_number, row_index_on_page, ai_provider');
          if (callback) callback(error);
          return;
        }

        const record = {
          id: mockState.lastId + 1,
          volume_id,
          page_number,
          row_index_on_page,
          entry_id,
          entry_no_raw,
          name_raw,
          abode_raw,
          burial_date_raw,
          age_raw,
          officiant_raw,
          marginalia_raw,
          extra_notes_raw,
          row_ocr_raw,
          parish_header_raw,
          county_header_raw,
          year_header_raw,
          model_name,
          model_run_id,
          uncertainty_flags,
          file_name,
          ai_provider,
          prompt_template,
          prompt_version,
          processed_date: new Date().toISOString()
        };

        mockState.lastId += 1;
        mockState.burialEntries.push(record);

        if (callback) callback.call({ lastID: record.id }, null);
        return;
      }

      if (callback) callback(null);
    }

    all(sql, params, callback) {
      if (typeof params === 'function') {
        callback = params;
        params = [];
      }

      if (/FROM\s+BURIAL_REGISTER_ENTRIES/i.test(sql)) {
        const [provider, volumeId] = params;
        const filtered = mockState.burialEntries
          .filter(entry => entry.ai_provider === provider && entry.volume_id === volumeId)
          .sort((a, b) => {
            if (a.volume_id !== b.volume_id) return a.volume_id.localeCompare(b.volume_id);
            if (a.page_number !== b.page_number) return a.page_number - b.page_number;
            return a.row_index_on_page - b.row_index_on_page;
          });

        callback(null, filtered);
        return;
      }

      callback(null, []);
    }

    close(callback) {
      if (callback) callback(null);
    }
  }

  return {
    verbose: () => ({ Database }),
    OPEN_READONLY: 1,
    OPEN_READWRITE: 2,
    OPEN_CREATE: 4,
    __mockState: mockState
  };
});

jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

const sqlite3 = require('sqlite3');
const { storePageJSON, storeBurialRegisterEntry } = require('../../src/utils/burialRegisterStorage');
const exportScript = require('../../scripts/export-burial-register-csv');

const resolvePath = (...segments) => path.join(...segments);

const getCsvPaths = (baseDir) => ({
  openai: resolvePath(baseDir, 'vol1', 'csv', 'burials_vol1_openai.csv'),
  anthropic: resolvePath(baseDir, 'vol1', 'csv', 'burials_vol1_anthropic.csv')
});

describe('Dual provider burial register processing', () => {
  let tempDir;
  let originalArgv;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'burial-register-'));
    process.env.BURIAL_REGISTER_OUTPUT_DIR = tempDir;
    sqlite3.__mockState.burialEntries = [];
    sqlite3.__mockState.lastId = 0;
    originalArgv = process.argv;
  });

  afterEach(() => {
    process.argv = originalArgv;
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    delete process.env.BURIAL_REGISTER_OUTPUT_DIR;
  });

  it('stores entries for GPT and Claude providers and exports CSV files', async () => {
    const pageData = {
      volume_id: 'vol1',
      page_number: 1,
      parish_header_raw: 'St Luke',
      county_header_raw: 'London',
      year_header_raw: '1850',
      entries: []
    };

    await storePageJSON(pageData, 'openai', 'vol1', 1);
    await storePageJSON(pageData, 'anthropic', 'vol1', 1);

    const openaiPagePath = resolvePath(tempDir, 'vol1', 'pages', 'openai', 'page_001.json');
    const anthropicPagePath = resolvePath(tempDir, 'vol1', 'pages', 'anthropic', 'page_001.json');

    expect(fs.existsSync(openaiPagePath)).toBe(true);
    expect(fs.existsSync(anthropicPagePath)).toBe(true);

    const baseEntry = {
      volume_id: 'vol1',
      page_number: 1,
      row_index_on_page: 1,
      entry_id: 'vol1_p001_r001',
      entry_no_raw: '1',
      name_raw: 'John Doe',
      abode_raw: 'High Street',
      burial_date_raw: '1850-01-01',
      age_raw: '42',
      officiant_raw: 'Rev A',
      marginalia_raw: null,
      extra_notes_raw: null,
      row_ocr_raw: 'John Doe High Street 42',
      parish_header_raw: 'St Luke',
      county_header_raw: 'London',
      year_header_raw: '1850',
      model_name: 'test-model',
      model_run_id: 'run-1',
      uncertainty_flags: ['flagged'],
      prompt_template: 'burialRegister',
      prompt_version: '1.0.0'
    };

    await storeBurialRegisterEntry({ ...baseEntry, ai_provider: 'openai', fileName: 'page1.jpg' });
    await storeBurialRegisterEntry({ ...baseEntry, ai_provider: 'anthropic', fileName: 'page1.jpg' });

    const db = new (sqlite3.verbose().Database)();
    const openaiEntries = await exportScript.fetchEntries(db, 'openai', 'vol1');
    const anthropicEntries = await exportScript.fetchEntries(db, 'anthropic', 'vol1');

    expect(openaiEntries).toHaveLength(1);
    expect(anthropicEntries).toHaveLength(1);
    expect(openaiEntries[0].entry_id).toBe(anthropicEntries[0].entry_id);
    expect(openaiEntries[0].ai_provider).toBe('openai');
    expect(anthropicEntries[0].ai_provider).toBe('anthropic');

    await expect(
      storeBurialRegisterEntry({ ...baseEntry, ai_provider: 'openai', fileName: 'duplicate.jpg' })
    ).rejects.toThrow(/UNIQUE constraint/);

    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});

    process.argv = ['node', 'scripts/export-burial-register-csv.js', 'gpt', 'vol1'];
    await exportScript.main();

    process.argv = ['node', 'scripts/export-burial-register-csv.js', 'claude', 'vol1'];
    await exportScript.main();

    exitSpy.mockRestore();

    const csvPaths = getCsvPaths(tempDir);
    expect(fs.existsSync(csvPaths.openai)).toBe(true);
    expect(fs.existsSync(csvPaths.anthropic)).toBe(true);

    const openaiCsv = fs.readFileSync(csvPaths.openai, 'utf-8');
    const anthropicCsv = fs.readFileSync(csvPaths.anthropic, 'utf-8');

    expect(openaiCsv).toContain('vol1_p001_r001');
    expect(anthropicCsv).toContain('vol1_p001_r001');
  });
});
