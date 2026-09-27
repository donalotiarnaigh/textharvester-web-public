const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const logger = require('../src/utils/logger');

const dbDir = path.join(__dirname, '..', 'data');
const dbPath = path.join(dbDir, 'memorials.db');

function runSql(db, sql) {
  return new Promise((resolve, reject) => {
    db.run(sql, (err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
}

async function migrate() {
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE, (err) => {
    if (err) {
      logger.error('Error connecting to database:', err);
      process.exit(1);
    }
  });

  try {
    await runSql(db, 'BEGIN TRANSACTION');

    // Drop existing table (data doesn't need to be preserved)
    logger.info('Dropping existing burial_register_entries table...');
    await runSql(db, 'DROP TABLE IF EXISTS burial_register_entries');

    // Recreate table with new UNIQUE constraint using file_name
    logger.info('Creating burial_register_entries table with new UNIQUE constraint...');
    const createTableSql = `
      CREATE TABLE burial_register_entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        volume_id TEXT NOT NULL,
        page_number INTEGER NOT NULL,
        row_index_on_page INTEGER NOT NULL,
        entry_id TEXT NOT NULL,
        entry_no_raw TEXT,
        name_raw TEXT,
        abode_raw TEXT,
        burial_date_raw TEXT,
        age_raw TEXT,
        officiant_raw TEXT,
        marginalia_raw TEXT,
        extra_notes_raw TEXT,
        row_ocr_raw TEXT,
        parish_header_raw TEXT,
        county_header_raw TEXT,
        year_header_raw TEXT,
        model_name TEXT,
        model_run_id TEXT,
        uncertainty_flags TEXT,
        file_name TEXT NOT NULL,
        ai_provider TEXT NOT NULL,
        prompt_template TEXT,
        prompt_version TEXT,
        processed_date DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(volume_id, file_name, row_index_on_page, ai_provider)
      )
    `;
    await runSql(db, createTableSql);

    // Recreate indexes
    logger.info('Creating indexes...');
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_burial_provider_volume_page ON burial_register_entries(ai_provider, volume_id, page_number)',
      'CREATE INDEX IF NOT EXISTS idx_burial_entry_id ON burial_register_entries(entry_id)',
      'CREATE INDEX IF NOT EXISTS idx_burial_volume_page ON burial_register_entries(volume_id, page_number)'
    ];

    for (const indexSql of indexes) {
      await runSql(db, indexSql);
    }

    await runSql(db, 'COMMIT');
    logger.info('Migration completed successfully: Changed UNIQUE constraint to use file_name instead of page_number');
  } catch (err) {
    logger.error('Migration failed, rolling back transaction:', err);
    try {
      await runSql(db, 'ROLLBACK');
    } catch (rollbackError) {
      logger.error('Error during rollback:', rollbackError);
    }
    process.exit(1);
  } finally {
    db.close((err) => {
      if (err) {
        logger.error('Error closing database:', err);
        process.exit(1);
      }
      logger.info('Database connection closed');
      process.exit(0);
    });
  }
}

migrate();

