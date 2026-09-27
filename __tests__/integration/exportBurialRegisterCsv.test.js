jest.unmock('fs');
const fs = jest.requireActual('fs');
const path = require('path');
const config = require('../../config.json');

const openaiEntries = [
  {
    volume_id: 'vol1',
    page_number: 1,
    row_index_on_page: 1,
    entry_id: 'vol1_p001_r001',
    entry_no_raw: '1',
    name_raw: 'John Doe',
    abode_raw: 'High Street',
    burial_date_raw: '1850-01-01',
    age_raw: '40',
    officiant_raw: 'Rev A',
    marginalia_raw: '',
    extra_notes_raw: 'Note A',
    row_ocr_raw: 'OCR line 1',
    parish_header_raw: 'St Luke',
    county_header_raw: 'London',
    year_header_raw: '1850',
    model_name: 'gpt-4.1',
    model_run_id: 'run-openai-1',
    uncertainty_flags: '["flagged_line"]',
    file_name: 'page1.jpg',
    ai_provider: 'openai',
    prompt_template: 'burialRegister',
    prompt_version: '1',
    processed_date: '2024-01-01T00:00:00Z'
  },
  {
    volume_id: 'vol1',
    page_number: 2,
    row_index_on_page: 1,
    entry_id: 'vol1_p002_r001',
    entry_no_raw: '2',
    name_raw: 'Jane Roe',
    abode_raw: 'Oak Lane',
    burial_date_raw: '1850-02-01',
    age_raw: '32',
    officiant_raw: 'Rev B',
    marginalia_raw: 'Smudged',
    extra_notes_raw: 'Note B',
    row_ocr_raw: 'OCR line 2',
    parish_header_raw: 'St Luke',
    county_header_raw: 'London',
    year_header_raw: '1850',
    model_name: 'gpt-4.1',
    model_run_id: 'run-openai-2',
    uncertainty_flags: '["crossed_out"]',
    file_name: 'page2.jpg',
    ai_provider: 'openai',
    prompt_template: 'burialRegister',
    prompt_version: '1',
    processed_date: '2024-02-01T00:00:00Z'
  }
];

const anthropicEntries = [
  {
    volume_id: 'vol1',
    page_number: 3,
    row_index_on_page: 1,
    entry_id: 'vol1_p003_r001',
    entry_no_raw: '3',
    name_raw: 'Richard Roe',
    abode_raw: 'Elm Street',
    burial_date_raw: '1850-03-01',
    age_raw: '55',
    officiant_raw: 'Rev C',
    marginalia_raw: '',
    extra_notes_raw: '',
    row_ocr_raw: 'OCR line 3',
    parish_header_raw: 'St Luke',
    county_header_raw: 'London',
    year_header_raw: '1850',
    model_name: 'claude-3',
    model_run_id: 'run-claude-1',
    uncertainty_flags: '["uncertain_date"]',
    file_name: 'page3.jpg',
    ai_provider: 'anthropic',
    prompt_template: 'burialRegister',
    prompt_version: '1',
    processed_date: '2024-03-01T00:00:00Z'
  }
];

const mockEntries = [...openaiEntries, ...anthropicEntries];

jest.mock('sqlite3', () => {
  class Database {
    constructor(path, mode, callback) {
      if (typeof mode === 'function') {
        callback = mode;
      }
      if (callback) {
        setTimeout(() => callback(null), 0);
      }
    }

    all(sql, params, callback) {
      const [provider, volumeId] = params;
      const filtered = mockEntries.filter(
        entry => entry.ai_provider === provider && entry.volume_id === volumeId
      );
      callback(null, filtered);
    }

    close(callback) {
      if (callback) {
        callback(null);
      }
    }
  }

  return {
    verbose: () => ({ Database }),
    OPEN_READONLY: 1
  };
});

jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
}));

const exportScript = require('../../scripts/export-burial-register-csv');
const logger = require('../../src/utils/logger');

const resolveBurialRegisterBaseDir = () => path.resolve(
  process.env.BURIAL_REGISTER_OUTPUT_DIR
    || (config.burialRegister && config.burialRegister.outputDir)
    || path.join(__dirname, '..', '..', 'data', 'burial_register')
);

const burialRegisterBaseDir = resolveBurialRegisterBaseDir();
const csvDir = path.join(burialRegisterBaseDir, 'vol1', 'csv');
const expectedHeader = [
  'volume_id',
  'page_number',
  'row_index_on_page',
  'entry_id',
  'entry_no_raw',
  'name_raw',
  'abode_raw',
  'burial_date_raw',
  'age_raw',
  'officiant_raw',
  'marginalia_raw',
  'extra_notes_raw',
  'row_ocr_raw',
  'parish_header_raw',
  'county_header_raw',
  'year_header_raw',
  'model_name',
  'model_run_id',
  'uncertainty_flags',
  'file_name',
  'ai_provider',
  'prompt_template',
  'prompt_version',
  'processed_date'
].join(',');

describe('export-burial-register-csv script', () => {
  let exitSpy;
  const removeDataDir = () => {
    if (fs.existsSync(burialRegisterBaseDir)) {
      fs.rmSync(burialRegisterBaseDir, { recursive: true, force: true });
    }
  };

  beforeAll(async () => {
    exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});
    removeDataDir();
    fs.mkdirSync(burialRegisterBaseDir, { recursive: true });
  });

  afterAll(async () => {
    exitSpy.mockRestore();
    removeDataDir();
  });

  const runExport = async (providerArg) => {
    const originalArgv = process.argv;
    exitSpy.mockClear();
    logger.warn.mockClear();
    logger.error.mockClear();
    process.argv = ['node', 'scripts/export-burial-register-csv.js', providerArg, 'vol1'];

    await exportScript.main();

    process.argv = originalArgv;

    const normalizedProvider = providerArg === 'gpt'
      ? 'openai'
      : providerArg === 'claude'
        ? 'anthropic'
        : providerArg;
    const outputPath = path.join(csvDir, `burials_vol1_${normalizedProvider}.csv`);

    return {
      exitCalled: exitSpy.mock.calls.length > 0,
      warnCalls: logger.warn.mock.calls,
      errorCalls: logger.error.mock.calls,
      outputPath,
      csvExists: fs.existsSync(outputPath)
    };
  };

  const readCsv = (filePath) => {
    const content = fs.readFileSync(filePath, 'utf-8').trim().split('\n');
    const [header, ...rows] = content;
    return { header, rows };
  };

  test('exports GPT entries to CSV with expected order and columns', async () => {
    const result = await runExport('gpt');

    expect(result.exitCalled).toBe(false);
    expect(result.warnCalls).toEqual([]);
    expect(result.errorCalls).toEqual([]);

    expect(result.csvExists).toBe(true);

    const { header, rows } = readCsv(result.outputPath);
    expect(header).toBe(expectedHeader);
    expect(rows).toHaveLength(openaiEntries.length);

    const firstRowFields = rows[0].split(',');
    expect(firstRowFields[0]).toBe('vol1');
    expect(firstRowFields[3]).toBe('vol1_p001_r001');
    expect(firstRowFields[18]).toContain('flagged_line');
    expect(firstRowFields[20]).toBe('openai');
  });

  test('exports Claude entries to CSV including uncertainty flags', async () => {
    const result = await runExport('claude');

    expect(result.exitCalled).toBe(false);
    expect(result.warnCalls).toEqual([]);
    expect(result.errorCalls).toEqual([]);

    expect(result.csvExists).toBe(true);

    const { header, rows } = readCsv(result.outputPath);
    expect(header).toBe(expectedHeader);
    expect(rows).toHaveLength(anthropicEntries.length);

    const fields = rows[0].split(',');
    expect(fields[3]).toBe('vol1_p003_r001');
    expect(fields[18]).toContain('uncertain_date');
    expect(fields[20]).toBe('anthropic');
  });
});
