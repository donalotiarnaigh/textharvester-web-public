jest.unmock('fs');
const fs = jest.requireActual('fs');
const os = require('os');
const path = require('path');

jest.mock('sqlite3', () => {
  const mockState = {
    burialEntries: [],
    lastId: 0,
    reset() {
      this.burialEntries = [];
      this.lastId = 0;
    }
  };

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

const createPageData = (pageNumber) => ({
  volume_id: 'vol1',
  page_number: pageNumber,
  parish_header_raw: 'St Luke',
  county_header_raw: 'London',
  year_header_raw: `185${pageNumber}`,
  entries: []
});

const createEntry = (pageNumber, rowIndex, aiProvider) => {
  const paddedPage = String(pageNumber).padStart(3, '0');
  const paddedRow = String(rowIndex).padStart(3, '0');

  return {
    volume_id: 'vol1',
    page_number: pageNumber,
    row_index_on_page: rowIndex,
    entry_id: `vol1_p${paddedPage}_r${paddedRow}`,
    entry_no_raw: `${pageNumber}-${rowIndex}`,
    name_raw: `Name ${pageNumber}-${rowIndex}`,
    abode_raw: `Street ${pageNumber}-${rowIndex}`,
    burial_date_raw: `1850-0${pageNumber}-0${rowIndex}`,
    age_raw: `${30 + pageNumber + rowIndex}`,
    officiant_raw: `Rev ${String.fromCharCode(64 + pageNumber)}`,
    marginalia_raw: '',
    extra_notes_raw: '',
    row_ocr_raw: `OCR ${pageNumber}-${rowIndex}`,
    parish_header_raw: 'St Luke',
    county_header_raw: 'London',
    year_header_raw: `185${pageNumber}`,
    model_name: aiProvider === 'openai' ? 'gpt-4.1' : 'claude-3',
    model_run_id: `${aiProvider}-run-${pageNumber}-${rowIndex}`,
    uncertainty_flags: ['flagged'],
    prompt_template: 'burialRegister',
    prompt_version: '1.0.0',
    ai_provider: aiProvider,
    fileName: `page${pageNumber}.jpg`
  };
};

describe('Multi-page burial register batch processing', () => {
  let tempDir;
  let originalArgv;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'burial-register-batch-'));
    process.env.BURIAL_REGISTER_OUTPUT_DIR = tempDir;
    sqlite3.__mockState.reset();
    originalArgv = process.argv;
  });

  afterEach(() => {
    process.argv = originalArgv;
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    delete process.env.BURIAL_REGISTER_OUTPUT_DIR;
  });

  it('processes multiple pages for both providers and exports ordered CSVs', async () => {
    const pageNumbers = [1, 2, 3, 4];
    const providers = ['openai', 'anthropic'];

    for (const provider of providers) {
      for (const pageNumber of pageNumbers) {
        await storePageJSON(createPageData(pageNumber), provider, 'vol1', pageNumber);
      }
    }

    const pagePaths = pageNumbers.flatMap(pageNumber => (
      providers.map(provider => resolvePath(tempDir, 'vol1', 'pages', provider, `page_${String(pageNumber).padStart(3, '0')}.json`))
    ));

    pagePaths.forEach(pagePath => {
      expect(fs.existsSync(pagePath)).toBe(true);
    });

    const openaiEntriesData = [
      createEntry(1, 1, 'openai'),
      createEntry(2, 1, 'openai'),
      createEntry(2, 2, 'openai'),
      createEntry(3, 1, 'openai'),
      createEntry(4, 1, 'openai')
    ];

    const anthropicEntriesData = [
      createEntry(1, 1, 'anthropic'),
      createEntry(2, 1, 'anthropic'),
      createEntry(3, 1, 'anthropic'),
      createEntry(3, 2, 'anthropic'),
      createEntry(4, 1, 'anthropic')
    ];

    for (const entry of openaiEntriesData) {
      await storeBurialRegisterEntry(entry);
    }

    for (const entry of anthropicEntriesData) {
      await storeBurialRegisterEntry(entry);
    }

    const db = new (sqlite3.verbose().Database)();
    const openaiEntries = await exportScript.fetchEntries(db, 'openai', 'vol1');
    const anthropicEntries = await exportScript.fetchEntries(db, 'anthropic', 'vol1');

    expect(openaiEntries).toHaveLength(openaiEntriesData.length);
    expect(anthropicEntries).toHaveLength(anthropicEntriesData.length);

    const expectedOpenaiOrder = openaiEntriesData.map(entry => entry.entry_id);
    const expectedAnthropicOrder = anthropicEntriesData.map(entry => entry.entry_id);

    expect(openaiEntries.map(entry => entry.entry_id)).toEqual(expectedOpenaiOrder);
    expect(anthropicEntries.map(entry => entry.entry_id)).toEqual(expectedAnthropicOrder);

    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});

    process.argv = ['node', 'scripts/export-burial-register-csv.js', 'gpt', 'vol1'];
    await exportScript.main();

    process.argv = ['node', 'scripts/export-burial-register-csv.js', 'claude', 'vol1'];
    await exportScript.main();

    exitSpy.mockRestore();

    const csvPaths = {
      openai: resolvePath(tempDir, 'vol1', 'csv', 'burials_vol1_openai.csv'),
      anthropic: resolvePath(tempDir, 'vol1', 'csv', 'burials_vol1_anthropic.csv')
    };

    expect(fs.existsSync(csvPaths.openai)).toBe(true);
    expect(fs.existsSync(csvPaths.anthropic)).toBe(true);

    const readCsvRows = (filePath) => fs.readFileSync(filePath, 'utf-8')
      .trim()
      .split('\n')
      .slice(1);

    const openaiCsvRows = readCsvRows(csvPaths.openai);
    const anthropicCsvRows = readCsvRows(csvPaths.anthropic);

    expect(openaiCsvRows).toHaveLength(openaiEntriesData.length);
    expect(anthropicCsvRows).toHaveLength(anthropicEntriesData.length);

    expect(openaiCsvRows.map(row => row.split(',')[3])).toEqual(expectedOpenaiOrder);
    expect(anthropicCsvRows.map(row => row.split(',')[3])).toEqual(expectedAnthropicOrder);
  });
});
