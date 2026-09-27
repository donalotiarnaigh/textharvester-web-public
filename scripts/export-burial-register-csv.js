const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { jsonToCsv } = require('../src/utils/dataConversion');
const logger = require('../src/utils/logger');
const config = require('../config.json');

const dbPath = path.join(__dirname, '..', 'data', 'memorials.db');

function getBurialRegisterOutputDir() {
  const burialRegisterConfig = config.burialRegister || {};
  const outputDir = process.env.BURIAL_REGISTER_OUTPUT_DIR || burialRegisterConfig.outputDir;

  if (outputDir) {
    return path.resolve(outputDir);
  }

  return path.join(__dirname, '..', 'data', 'burial_register');
}

function normalizeProvider(providerArg) {
  const provider = providerArg.toLowerCase();

  if (provider === 'gpt') {
    return 'openai';
  }

  if (provider === 'claude') {
    return 'anthropic';
  }

  return provider;
}

function validateProvider(provider) {
  const supportedProviders = ['openai', 'anthropic'];

  if (!supportedProviders.includes(provider)) {
    throw new Error(`Invalid provider: ${provider}. Supported providers: ${supportedProviders.join(', ')}`);
  }

  return provider;
}

function createDatabaseConnection() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(db);
    });
  });
}

function fetchEntries(db, provider, volumeId) {
  const sql = `
    SELECT * FROM burial_register_entries
    WHERE ai_provider = ? AND volume_id = ?
    ORDER BY volume_id, page_number, row_index_on_page
  `;

  return new Promise((resolve, reject) => {
    db.all(sql, [provider, volumeId], (err, rows) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(rows || []);
    });
  });
}

function normalizeUncertaintyFlags(value) {
  if (Array.isArray(value)) {
    return JSON.stringify(value);
  }

  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'string') {
    return value;
  }

  return JSON.stringify(value);
}

function buildCsvData(entries) {
  const columnOrder = [
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

  const normalizedEntries = entries.map(entry => ({
    ...entry,
    uncertainty_flags: normalizeUncertaintyFlags(entry.uncertainty_flags)
  }));

  return jsonToCsv(normalizedEntries, columnOrder);
}

function writeCsvFile(csvData, volumeId, provider) {
  const csvDir = path.join(getBurialRegisterOutputDir(), volumeId, 'csv');
  fs.mkdirSync(csvDir, { recursive: true });

  const outputPath = path.join(csvDir, `burials_${volumeId}_${provider}.csv`);
  fs.writeFileSync(outputPath, csvData, 'utf-8');

  return outputPath;
}

async function main() {
  if (process.argv.length < 4) {
    console.log('Usage: node scripts/export-burial-register-csv.js {provider} {volumeId}');
    console.log('Example: node scripts/export-burial-register-csv.js gpt vol1');
    process.exit(1);
  }

  const providerArg = process.argv[2];
  const volumeId = process.argv[3];

  try {
    const provider = validateProvider(normalizeProvider(providerArg));

    logger.info(`Generating burial register CSV for provider=${provider}, volume=${volumeId}`);

    const db = await createDatabaseConnection();

    try {
      const entries = await fetchEntries(db, provider, volumeId);

      if (entries.length === 0) {
        logger.warn(`No burial register entries found for provider=${provider}, volume=${volumeId}`);
        db.close();
        process.exit(0);
      }

      logger.info(`Found ${entries.length} entries for provider=${provider}, volume=${volumeId}`);

      // Calculate page range
      const pages = [...new Set(entries.map(e => e.page_number).filter(p => p != null))].sort((a, b) => a - b);
      const minPage = pages.length > 0 ? pages[0] : 'N/A';
      const maxPage = pages.length > 0 ? pages[pages.length - 1] : 'N/A';
      const uniquePages = pages.length;
      
      if (pages.length > 0) {
        logger.info(`Page range: ${minPage} to ${maxPage} (${uniquePages} unique pages)`);
      }

      const csvData = buildCsvData(entries);

      if (!csvData) {
        logger.warn('No CSV data generated');
        db.close();
        process.exit(1);
      }

      const outputPath = writeCsvFile(csvData, volumeId, provider);
      logger.info(`CSV export completed: ${outputPath} (${entries.length} entries, ${uniquePages} unique pages)`);
    } finally {
      db.close((err) => {
        if (err) {
          logger.error('Error closing database connection:', err);
        }
      });
    }
  } catch (error) {
    logger.error('Failed to export burial register CSV:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  buildCsvData,
  fetchEntries,
  main,
  getBurialRegisterOutputDir
};
