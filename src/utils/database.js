const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const logger = require('./logger');
const fs = require('fs');
const moment = require('moment');

// Allow dbPath to be overridden via environment variable or default to data directory
let dbPath;
if (process.env.DB_PATH) {
  dbPath = process.env.DB_PATH;
} else {
  const defaultDbDir = path.dirname(path.join(__dirname, '../../data', 'memorials.db'));
  dbPath = path.join(defaultDbDir, 'memorials.db');
}

const dbDir = path.dirname(dbPath);

// Ensure data directory exists
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
  logger.info('Created database directory');
}

// Create database connection
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    logger.error('Error connecting to database:', err);
    return;
  }
  logger.info('Connected to SQLite database');
});

// Initialize schema_migrations tracking table
function initializeMigrationsTable() {
  db.run(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      migration_name TEXT NOT NULL UNIQUE,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) logger.error('Error creating schema_migrations table:', err);
    else logger.info('Schema migrations table initialized');
  });
}

// Run a batch of column migrations inside a single BEGIN IMMEDIATE transaction.
// On success, records the migration in schema_migrations (idempotent via INSERT OR IGNORE).
// On any ALTER TABLE failure, rolls back the entire batch.
function runColumnMigration(tableName, missing, migrationName) {
  if (missing.length === 0) {
    db.run(
      'INSERT OR IGNORE INTO schema_migrations (migration_name) VALUES (?)',
      [migrationName]
    );
    return;
  }
  // Use SAVEPOINT instead of BEGIN IMMEDIATE so the migration is safe to call
  // both inside an existing transaction (nested savepoint) and outside one
  // (implicit transaction), avoiding "cannot start a transaction within a
  // transaction" errors (Issue #232).
  const sp = `mig_${migrationName.replace(/[^a-z0-9_]/gi, '_')}`;
  db.run(`SAVEPOINT ${sp}`, (spErr) => {
    if (spErr) {
      logger.error(`Migration ${migrationName}: SAVEPOINT failed:`, spErr);
      return;
    }
    const addNext = (index) => {
      if (index >= missing.length) {
        db.run(`RELEASE SAVEPOINT ${sp}`, (releaseErr) => {
          if (releaseErr) {
            db.run(`ROLLBACK TO SAVEPOINT ${sp}`, () =>
              db.run(`RELEASE SAVEPOINT ${sp}`, () =>
                logger.error(`Migration ${migrationName}: RELEASE failed, rolled back:`, releaseErr)
              )
            );
            return;
          }
          db.run(
            'INSERT OR IGNORE INTO schema_migrations (migration_name) VALUES (?)',
            [migrationName],
            (insertErr) => {
              if (insertErr)
                logger.error(`Migration ${migrationName}: schema_migrations insert failed:`, insertErr);
              else
                logger.info(`Migration ${migrationName}: completed`);
            }
          );
        });
        return;
      }
      const col = missing[index];
      db.run(`ALTER TABLE ${tableName} ADD COLUMN ${col.name} ${col.def}`, (alterErr) => {
        if (alterErr) {
          db.run(`ROLLBACK TO SAVEPOINT ${sp}`, () =>
            db.run(`RELEASE SAVEPOINT ${sp}`, () =>
              logger.error(`Migration ${migrationName}: failed on ${col.name}, rolled back:`, alterErr)
            )
          );
        } else {
          logger.info(`Migration ${migrationName}: added ${col.name}`);
          addNext(index + 1);
        }
      });
    };
    addNext(0);
  });
}

// Initialize database with required table
function initializeDatabase() {
  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS memorials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      memorial_number TEXT,
      first_name TEXT,
      last_name TEXT,
      year_of_death TEXT CONSTRAINT valid_year CHECK (
        year_of_death IS NULL OR 
        year_of_death = '-' OR
        year_of_death GLOB '*-*' OR
        (CAST(year_of_death AS INTEGER) >= 1500 AND CAST(year_of_death AS INTEGER) <= 2100)
      ),
      inscription TEXT,
      file_name TEXT,
      ai_provider TEXT,
      model_version TEXT,
      prompt_template TEXT,
      prompt_version TEXT,
      processed_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      source_type TEXT,
      site_code TEXT,
      transcription_raw TEXT,
      stone_condition TEXT,
      typography_analysis TEXT,
      iconography TEXT,
      structural_observations TEXT,
      confidence_scores TEXT,
      confidence_coverage REAL DEFAULT NULL,
      needs_review INTEGER DEFAULT 0,
      reviewed_at DATETIME,
      validation_warnings TEXT,
      input_tokens INTEGER DEFAULT 0,
      output_tokens INTEGER DEFAULT 0,
      estimated_cost_usd REAL DEFAULT 0,
      processing_id TEXT,
      edited_at DATETIME,
      edited_fields TEXT,
      project_id TEXT
    )
  `;

  db.run(createTableSQL, (err) => {
    if (err) {
      logger.error('Error creating memorials table:', err);
      return;
    }
    logger.info('Memorials table initialized');

    // Migration: Add missing columns if they don't exist
    db.all('PRAGMA table_info(memorials)', (err, rows) => {
      if (err) {
        logger.error('Error checking table info:', err);
        return;
      }
      const existingCols = rows ? rows.map(row => row.name) : [];
      const migrations = [
        { name: 'site_code', def: 'TEXT' },
        { name: 'confidence_scores', def: 'TEXT' },
        { name: 'confidence_coverage', def: 'REAL DEFAULT NULL' },
        { name: 'disagreement_score', def: 'REAL DEFAULT NULL' },
        { name: 'needs_review', def: 'INTEGER DEFAULT 0' },
        { name: 'reviewed_at', def: 'DATETIME' },
        { name: 'validation_warnings', def: 'TEXT' },
        { name: 'input_tokens', def: 'INTEGER DEFAULT 0' },
        { name: 'output_tokens', def: 'INTEGER DEFAULT 0' },
        { name: 'estimated_cost_usd', def: 'REAL DEFAULT 0' },
        { name: 'processing_id', def: 'TEXT' },
        { name: 'edited_at', def: 'DATETIME' },
        { name: 'edited_fields', def: 'TEXT' },
        { name: 'project_id', def: 'TEXT' }
      ];
      const missing = migrations.filter(col => !existingCols.includes(col.name));
      runColumnMigration('memorials', missing, 'add_cost_columns_v1');

      // Schedule deduplication and index creation (runs asynchronously after migrations)
      // Note: SQLite3 driver is async, so these fire after the migrations above
      setTimeout(() => {
        // Deduplicate existing records (keep newest by id)
        db.run(`DELETE FROM memorials WHERE id NOT IN (
          SELECT MAX(id) FROM memorials GROUP BY file_name, ai_provider
        )`, function(dedupErr) {
          if (dedupErr) {
            logger.error('memorials dedup failed:', dedupErr);
            return;
          }
          if (this && this.changes > 0) logger.info(`memorials: removed ${this.changes} duplicates`);

          db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_memorials_file_provider ON memorials(file_name, ai_provider)', (idxErr) => {
            if (idxErr) {
              logger.error('memorials unique index failed:', idxErr);
              return;
            }
            logger.info('memorials: unique index on (file_name, ai_provider) ensured');

            // Create project_id index for filtering
            db.run('CREATE INDEX IF NOT EXISTS idx_memorials_project ON memorials(project_id)', (projIdxErr) => {
              if (projIdxErr) logger.error('memorials project_id index failed:', projIdxErr);
              else logger.info('memorials: project_id index ensured');
            });
          });
        });
      }, 100);
    });
  });
}

// Initialize burial register table
function initializeBurialRegisterTable() {
  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS burial_register_entries (
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
      confidence_scores TEXT,
      confidence_coverage REAL DEFAULT NULL,
      needs_review INTEGER DEFAULT 0,
      reviewed_at DATETIME,
      validation_warnings TEXT,
      processing_id TEXT,
      edited_at DATETIME,
      edited_fields TEXT,
      project_id TEXT,
      UNIQUE(volume_id, file_name, row_index_on_page, ai_provider)
    )
  `;

  db.run(createTableSQL, (err) => {
    if (err) {
      logger.error('Error creating burial_register_entries table:', err);
      return;
    }
    logger.info('Burial register entries table initialized');

    // Migration: Add missing columns if they don't exist
    db.all('PRAGMA table_info(burial_register_entries)', (pragmaErr, pragmaRows) => {
      if (pragmaErr) {
        logger.error('Error checking burial_register_entries table info:', pragmaErr);
        return;
      }
      const existingCols = pragmaRows ? pragmaRows.map(row => row.name) : [];
      const burialMigrations = [
        { name: 'confidence_scores', def: 'TEXT' },
        { name: 'confidence_coverage', def: 'REAL DEFAULT NULL' },
        { name: 'disagreement_score', def: 'REAL DEFAULT NULL' },
        { name: 'needs_review', def: 'INTEGER DEFAULT 0' },
        { name: 'reviewed_at', def: 'DATETIME' },
        { name: 'validation_warnings', def: 'TEXT' },
        { name: 'input_tokens', def: 'INTEGER DEFAULT 0' },
        { name: 'output_tokens', def: 'INTEGER DEFAULT 0' },
        { name: 'estimated_cost_usd', def: 'REAL DEFAULT 0' },
        { name: 'processing_id', def: 'TEXT' },
        { name: 'edited_at', def: 'DATETIME' },
        { name: 'edited_fields', def: 'TEXT' },
        { name: 'project_id', def: 'TEXT' },
        { name: 'burial_date_normalized', def: 'TEXT' },
        { name: 'burial_date_year', def: 'INTEGER' }
      ];
      const missingBurial = burialMigrations.filter(col => !existingCols.includes(col.name));
      runColumnMigration('burial_register_entries', missingBurial, 'burial_register_add_columns_v1');
    });

    // Create indexes
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_burial_provider_volume_page ON burial_register_entries(ai_provider, volume_id, page_number)',
      'CREATE INDEX IF NOT EXISTS idx_burial_entry_id ON burial_register_entries(entry_id)',
      'CREATE INDEX IF NOT EXISTS idx_burial_volume_page ON burial_register_entries(volume_id, page_number)',
      'CREATE INDEX IF NOT EXISTS idx_burial_project ON burial_register_entries(project_id)'
    ];

    indexes.forEach((indexSQL) => {
      db.run(indexSQL, (indexErr) => {
        if (indexErr) {
          logger.error('Error creating burial register index:', indexErr);
        }
      });
    });
  });
}

// Initialize custom_schemas table
function initializeCustomSchemasTable() {
  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS custom_schemas (
      id TEXT PRIMARY KEY,
      version INTEGER DEFAULT 1,
      name TEXT UNIQUE NOT NULL,
      table_name TEXT UNIQUE NOT NULL,
      json_schema TEXT NOT NULL,
      system_prompt TEXT,
      user_prompt_template TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `;

  db.run(createTableSQL, (err) => {
    if (err) {
      logger.error('Error creating custom_schemas table:', err);
      return;
    }
    logger.info('Custom schemas table initialized');

    // Add updated_at column if missing
    db.all('PRAGMA table_info(custom_schemas)', (err, rows) => {
      if (err || !rows) return;
      const existingCols = rows.map(r => r.name);
      const missing = [
        { name: 'updated_at', def: 'DATETIME' }
      ].filter(col => !existingCols.includes(col.name));

      if (missing.length > 0) {
        runColumnMigration('custom_schemas', missing, 'custom_schemas_add_updated_at_v1');
      }
    });
  });
}
/**
 * JSON-typed columns on the `memorials` table.
 *
 * Both write paths (`storeMemorial`, `updateMemorial`) must serialize exactly
 * this set. If they diverge, one path binds a raw object where the column
 * expects JSON text; the read path's JSON.parse then fails, silently nulls the
 * field, and forces needs_review = 1 (see #244).
 */
const MEMORIAL_JSON_FIELDS = [
  'typography_analysis',
  'iconography',
  'confidence_scores',
  'validation_warnings'
];

/**
 * Serialize one memorial field for storage in a TEXT column.
 *
 * Nullish values stay NULL rather than the string "null" (Requirement 5.1), and
 * already-serialized strings pass through untouched so re-saving a record read
 * back from the database does not double-encode it.
 *
 * @param {string} field - Column name, used in the error message.
 * @param {*} value - Raw value from the pipeline, an edit request, or the DB.
 * @returns {string|null} JSON text ready to bind, or null.
 * @throws {Error} When the value cannot be serialized (e.g. circular reference).
 */
function serializeMemorialField(field, value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch (e) {
    throw new Error(`Serialization error for field: ${e.message}`);
  }
}

/**
 * Serialize every JSON-typed memorial field present on `data`.
 * Fields absent from `data` are left absent, so this is safe for partial
 * update payloads as well as full records.
 *
 * @param {Object} data - Memorial record or partial edit payload.
 * @returns {Object} Shallow copy with JSON fields converted to TEXT-ready values.
 */
function serializeMemorialFields(data) {
  const serialized = { ...data };
  for (const field of MEMORIAL_JSON_FIELDS) {
    if (field in serialized) {
      serialized[field] = serializeMemorialField(field, serialized[field]);
    }
  }
  return serialized;
}

function storeMemorial(data) {
  // Use a safe logger that handles circular references if needed, or try/catch the logging
  try {
    logger.info('Attempting to store memorial:', JSON.stringify(data));
  } catch {
    logger.warn('Could not log memorial data (possibly circular structure)');
  }

  const sql = `
    INSERT INTO memorials (
      memorial_number,
      first_name,
      last_name,
      year_of_death,
      inscription,
      file_name,
      ai_provider,
      model_version,
      prompt_template,
      prompt_version,
      source_type,
      site_code,
      transcription_raw,
      stone_condition,
      typography_analysis,
      iconography,
      structural_observations,
      confidence_scores,
      confidence_coverage,
      disagreement_score,
      needs_review,
      validation_warnings,
      input_tokens,
      output_tokens,
      estimated_cost_usd,
      processing_id,
      project_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  return new Promise((resolve, reject) => {
    let params;
    try {
      // JSON-typed columns are serialized by the same helper updateMemorial()
      // uses, so the two write paths cannot drift apart (see #244).
      const jsonFields = serializeMemorialFields(data);
      params = [
        data.memorial_number || null,
        data.first_name || null,
        data.last_name || null,
        data.year_of_death || null,
        data.inscription || null,
        data.fileName || null,
        data.ai_provider || null,
        data.model_version || null,
        data.prompt_template || null,
        data.prompt_version || null,
        data.source_type || null,
        data.site_code || null,
        data.transcription_raw || null,
        data.stone_condition || null,
        jsonFields.typography_analysis ?? null,
        jsonFields.iconography ?? null,
        data.structural_observations || null,
        jsonFields.confidence_scores ?? null,
        data.confidence_coverage ?? null,
        data.disagreement_score ?? null,
        data.needs_review ?? 0,
        jsonFields.validation_warnings ?? null,
        data.input_tokens        ?? 0,
        data.output_tokens       ?? 0,
        data.estimated_cost_usd  ?? 0,
        data.processing_id || null,
        data.project_id || null
      ];
    } catch (e) {
      logger.error('Error preparing memorial params:', e);
      reject(e);
      return;
    }

    db.run(sql, params, function (err) {
      if (err) {
        // Check if this is a unique constraint violation (true duplicate)
        if (err.code === 'SQLITE_CONSTRAINT' && err.message && err.message.includes('UNIQUE constraint failed')) {
          logger.warn(`Duplicate memorial detected: file ${data.fileName}, provider ${data.ai_provider}`);
          const error = new Error(`Duplicate entry: memorial already exists for file ${data.fileName}, provider ${data.ai_provider}`);
          error.isDuplicate = true;
          reject(error);
          return;
        }
        logger.error('Error storing memorial:', err);
        reject(err);
        return;
      }
      logger.info(`Successfully stored memorial with ID: ${this.lastID}`);
      resolve(this.lastID);
    });
  });
}

// Retrieve all memorial records
function getAllMemorials() {
  return new Promise((resolve, reject) => {
    logger.info('Attempting to retrieve all memorials from database');
    db.all('SELECT * FROM memorials ORDER BY processed_date DESC', [], (err, rows) => {
      if (err) {
        logger.error('Error retrieving memorials:', err);
        reject(err);
        return;
      }
      logger.info(`Retrieved ${rows ? rows.length : 0} memorial records`);
      resolve(rows || []); // Ensure we always return an array
    });
  });
}

// Retrieve a single memorial by ID
function getMemorialById(id) {
  return new Promise((resolve, reject) => {
    logger.info(`Attempting to retrieve memorial with ID: ${id}`);
    db.get('SELECT * FROM memorials WHERE id = ?', [id], (err, row) => {
      if (err) {
        logger.error(`Error retrieving memorial ${id}:`, err);
        reject(err);
        return;
      }
      resolve(row || null);
    });
  });
}

// Retrieve memorials filtered by site_code (Requirement 3.2)
function getMemorialsBySiteCode(siteCode) {
  return new Promise((resolve, reject) => {
    // Edge case: null/undefined siteCode returns empty array (defensive)
    if (!siteCode) {
      return resolve([]);
    }

    logger.info(`Querying memorials for site_code: ${siteCode}`);
    db.all(
      'SELECT * FROM memorials WHERE site_code = ? ORDER BY processed_date DESC',
      [siteCode],
      (err, rows) => {
        if (err) {
          logger.error(`Error retrieving memorials for site_code ${siteCode}:`, err);
          reject(err);
          return;
        }
        logger.info(`Retrieved ${rows ? rows.length : 0} records for site_code: ${siteCode}`);
        resolve(rows || []);
      }
    );
  });
}

// Add this function to database.js
function clearAllMemorials() {
  return new Promise((resolve, reject) => {
    logger.info('Attempting to clear all memorial records');
    db.run('DELETE FROM memorials', [], (err) => {
      if (err) {
        logger.error('Error clearing memorials:', err);
        reject(err);
        return;
      }
      logger.info('Successfully cleared all memorial records');
      resolve();
    });
  });
}

const backupDatabase = async () => {
  const backupDir = path.join(__dirname, '../../backups');
  if (!fs.existsSync(backupDir)) {
    fs.mkdirSync(backupDir, { recursive: true });
  }
  const timestamp = moment().format('YYYYMMDD_HHmmss');
  const backupPath = path.join(backupDir, `memorials_${timestamp}.db`);

  return new Promise((resolve, reject) => {
    const backup = fs.createReadStream(dbPath).pipe(fs.createWriteStream(backupPath));
    backup.on('finish', () => {
      logger.info(`Database backed up to ${backupPath}`);
      resolve();
    });
    backup.on('error', reject);
  });
};

const MEMORIAL_EDITABLE_FIELDS = [
  'first_name', 'last_name', 'year_of_death', 'inscription',
  'site_code', 'memorial_number', 'transcription_raw',
  'stone_condition', 'typography_analysis', 'iconography',
  'structural_observations'
];

const VALID_YEAR_OF_DEATH_PATTERN = /^(\d{4}(-\d{4})?|-)$/;

function validateYearOfDeath(value) {
  if (value === null || value === undefined) return true;
  if (value === '-') return true;
  if (typeof value !== 'string') return false;
  if (!VALID_YEAR_OF_DEATH_PATTERN.test(value)) return false;

  // Extract year and validate range
  const year = parseInt(value.split('-')[0], 10);
  return year >= 1500 && year <= 2100;
}

const updateMemorial = async (id, fields) => {
  if (!id || id <= 0) {
    throw new Error('Invalid memorial ID');
  }

  if (!fields || Object.keys(fields).length === 0) {
    throw new Error('No fields to update');
  }

  // Filter to editable fields only
  const editableUpdates = {};
  const editedFields = [];

  for (const [key, value] of Object.entries(fields)) {
    if (MEMORIAL_EDITABLE_FIELDS.includes(key)) {
      // Validate specific fields
      if (key === 'year_of_death' && !validateYearOfDeath(value)) {
        throw new Error(`Invalid year_of_death format: ${value}`);
      }

      // JSON-typed editable fields (typography_analysis, iconography) must be
      // serialized here as well, or the read path cannot JSON.parse them (#244).
      editableUpdates[key] = MEMORIAL_JSON_FIELDS.includes(key)
        ? serializeMemorialField(key, value)
        : value;
      editedFields.push(key);
    }
  }

  if (editedFields.length === 0) {
    throw new Error('No valid editable fields provided');
  }

  return new Promise((resolve, reject) => {
    const setClauses = Object.keys(editableUpdates)
      .map(key => `${key} = ?`)
      .concat(['edited_at = CURRENT_TIMESTAMP', 'edited_fields = ?'])
      .join(', ');

    const params = [
      ...Object.values(editableUpdates),
      JSON.stringify(editedFields),
      id
    ];

    const sql = `UPDATE memorials SET ${setClauses} WHERE id = ?`;

    db.run(sql, params, function(err) {
      if (err) {
        logger.error('Error updating memorial:', err);
        reject(err);
        return;
      }

      // Fetch the updated record
      db.get('SELECT * FROM memorials WHERE id = ?', [id], (err, row) => {
        if (err) {
          logger.error('Error fetching updated memorial:', err);
          reject(err);
          return;
        }
        resolve(row || null);
      });
    });
  });
};

const markAsReviewed = async (tableName, id) => {
  const VALID_TABLES = ['memorials', 'burial_register_entries', 'grave_cards'];

  if (!VALID_TABLES.includes(tableName)) {
    throw new Error(`Invalid table name: ${tableName}`);
  }

  if (!id || id <= 0) {
    throw new Error('Invalid ID');
  }

  return new Promise((resolve, reject) => {
    const sql = `UPDATE ${tableName} SET needs_review = 0, reviewed_at = CURRENT_TIMESTAMP WHERE id = ?`;

    db.run(sql, [id], function(err) {
      if (err) {
        logger.error(`Error marking record as reviewed in ${tableName}:`, err);
        reject(err);
        return;
      }

      // Fetch the updated record
      db.get(`SELECT * FROM ${tableName} WHERE id = ?`, [id], (err, row) => {
        if (err) {
          logger.error(`Error fetching reviewed record from ${tableName}:`, err);
          reject(err);
          return;
        }
        resolve(row || null);
      });
    });
  });
};

// Initialize database on module load
initializeMigrationsTable();
initializeDatabase();
initializeBurialRegisterTable();
initializeCustomSchemasTable();

// Initialize grave cards table

// Initialize grave cards table - MOVED TO server.js to avoid circular dependency
// const graveCardStorage = require('./graveCardStorage');
// graveCardStorage.initialize().catch(err => {
//   logger.error('Error initializing grave cards table:', err);
// });

module.exports = {
  storeMemorial,
  getAllMemorials,
  getMemorialById,
  getMemorialsBySiteCode,
  clearAllMemorials,
  backupDatabase,
  updateMemorial,
  markAsReviewed,
  MEMORIAL_EDITABLE_FIELDS,
  initializeMigrationsTable,
  runColumnMigration,
  initializeDatabase,
  initializeBurialRegisterTable,
  initializeCustomSchemasTable,
  db // Exported for closing connection when needed
};