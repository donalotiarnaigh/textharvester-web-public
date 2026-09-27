const { buildCsvData } = require('../../scripts/export-burial-register-csv');

function parseCsvLine(line) {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }

    if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  values.push(current);
  return values;
}

describe('burial register CSV schema', () => {
  const expectedColumns = [
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
  ];

  const sampleEntry = {
    volume_id: 'vol1',
    page_number: 1,
    row_index_on_page: 3,
    entry_id: 'vol1_p001_r003',
    entry_no_raw: '12',
    name_raw: 'John Doe',
    abode_raw: 'Bermondsey',
    burial_date_raw: '1850-01-14',
    age_raw: '45',
    officiant_raw: 'J Smith',
    marginalia_raw: 'note in margin',
    extra_notes_raw: 'transcribed faithfully',
    row_ocr_raw: 'row text here',
    parish_header_raw: 'St Luke\'s',
    county_header_raw: 'London',
    year_header_raw: '1850',
    model_name: 'gpt-5.1',
    model_run_id: 'run-001',
    uncertainty_flags: ['partial_name', 'illegible_date'],
    file_name: 'page_001.png',
    ai_provider: 'openai',
    prompt_template: 'burialRegister',
    prompt_version: 'latest',
    processed_date: '2025-01-01T00:00:00Z'
  };

  it('uses the pilot plan column order', () => {
    const csv = buildCsvData([sampleEntry]);
    const [header] = csv.trim().split('\n');

    expect(header.split(',')).toEqual(expectedColumns);
  });

  it('exports values in the expected order and types', () => {
    const csv = buildCsvData([sampleEntry]);
    const [, dataRow] = csv.trim().split('\n');
    const parsedRow = parseCsvLine(dataRow);

    expect(parsedRow).toEqual([
      'vol1',
      '1',
      '3',
      'vol1_p001_r003',
      '12',
      'John Doe',
      'Bermondsey',
      '1850-01-14',
      '45',
      'J Smith',
      'note in margin',
      'transcribed faithfully',
      'row text here',
      'St Luke\'s',
      'London',
      '1850',
      'gpt-5.1',
      'run-001',
      '["partial_name","illegible_date"]',
      'page_001.png',
      'openai',
      'burialRegister',
      'latest',
      '2025-01-01T00:00:00Z'
    ]);
  });

  it('normalizes uncertainty flags to JSON strings', () => {
    const entryWithString = { ...sampleEntry, uncertainty_flags: 'existing_string' };
    const entryWithArray = { ...sampleEntry, entry_id: 'vol1_p001_r004', row_index_on_page: 4 };

    const csv = buildCsvData([entryWithArray, entryWithString]);
    const lines = csv.trim().split('\n');
    const firstRow = parseCsvLine(lines[1]);
    const secondRow = parseCsvLine(lines[2]);

    expect(firstRow[18]).toBe('["partial_name","illegible_date"]');
    expect(secondRow[18]).toBe('existing_string');
  });
});
