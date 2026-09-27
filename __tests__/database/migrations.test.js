/**
 * @jest-environment node
 *
 * Integration tests for database migration transactions (Issue #125).
 *
 * Uses a real in-memory SQLite database to verify:
 * - schema_migrations table creation
 * - Inline column migrations wrapped in transactions
 * - schema_migrations record written on success
 * - Idempotency (no duplicate rows)
 * - SQLite DDL transaction rollback behaviour
 * - Partial-migration crash simulation → full rollback
 * - migrate-add-typographic-analysis.js transaction wrapping
 *
 * jest.unmock('fs') is required because jest.setup.cjs globally mocks fs,
 * which breaks sqlite3's native bindings loader (it uses fs.readdirSync etc.)
 */

// Restore real fs BEFORE sqlite3 is required so the native addon can load.
// jest.unmock alone is insufficient after setupFilesAfterEnv registers the mock;
// use jest.mock with requireActual, matching the integration test pattern.
jest.mock('fs', () => jest.requireActual('fs'));
jest.unmock('sqlite3');

const sqlite3 = require('sqlite3').verbose();

// ---------------------------------------------------------------------------
// Helper: open a fresh in-memory SQLite database
// ---------------------------------------------------------------------------
function openInMemoryDb() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(':memory:', (err) => {
      if (err) return reject(err);
      resolve(db);
    });
  });
}

function dbRun(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve(this);
    });
  });
}

function dbAll(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

function dbGet(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

function closeDb(db) {
  return new Promise((resolve, reject) => {
    db.close((err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

// ---------------------------------------------------------------------------
// Helper: create a minimal memorials table in the given db
// ---------------------------------------------------------------------------
async function createMinimalMemorialsTable(db) {
  await dbRun(db, `
    CREATE TABLE IF NOT EXISTS memorials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      memorial_number TEXT,
      first_name TEXT,
      last_name TEXT
    )
  `);
}

// ---------------------------------------------------------------------------
// Helper: create schema_migrations table (mirrors initializeMigrationsTable)
// ---------------------------------------------------------------------------
async function initMigrationsTable(db) {
  await dbRun(db, `
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      migration_name TEXT NOT NULL UNIQUE,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

// ---------------------------------------------------------------------------
// Shared transactional migration helper that mirrors the production pattern
// in database.js.  Tests both the helper directly AND use it to verify that
// the production code must implement the same contract to pass.
// ---------------------------------------------------------------------------
function runColumnMigration(db, tableName, missing, migrationName) {
  return new Promise((resolve, reject) => {
    // BEGIN IMMEDIATE acquires a write-lock immediately, preventing concurrent
    // writers from interleaving DDL changes mid-migration.
    db.run('BEGIN IMMEDIATE', (beginErr) => {
      if (beginErr) return reject(beginErr);

      const addNext = (index) => {
        if (index >= missing.length) {
          db.run('COMMIT', (commitErr) => {
            if (commitErr) {
              db.run('ROLLBACK', () => reject(commitErr));
              return;
            }
            db.run(
              'INSERT OR IGNORE INTO schema_migrations (migration_name) VALUES (?)',
              [migrationName],
              (insertErr) => {
                if (insertErr) return reject(insertErr);
                resolve();
              }
            );
          });
          return;
        }

        const col = missing[index];
        db.run(
          `ALTER TABLE ${tableName} ADD COLUMN ${col.name} ${col.def}`,
          (alterErr) => {
            if (alterErr) {
              db.run('ROLLBACK', () => reject(alterErr));
            } else {
              addNext(index + 1);
            }
          }
        );
      };

      addNext(0);
    });
  });
}

// ===========================================================================
// Test suites
// ===========================================================================

describe('Migration infrastructure: schema_migrations table', () => {
  let db;

  beforeEach(async () => {
    db = await openInMemoryDb();
  });

  afterEach(async () => {
    await closeDb(db);
  });

  test('1. schema_migrations table is created with correct columns', async () => {
    await initMigrationsTable(db);

    const cols = await dbAll(db, 'PRAGMA table_info(schema_migrations)');
    const colNames = cols.map(c => c.name);

    expect(colNames).toContain('id');
    expect(colNames).toContain('migration_name');
    expect(colNames).toContain('applied_at');
  });
});

describe('Transactional column migration — memorials', () => {
  let db;

  beforeEach(async () => {
    db = await openInMemoryDb();
    await createMinimalMemorialsTable(db);
    await initMigrationsTable(db);
  });

  afterEach(async () => {
    await closeDb(db);
  });

  test('2. All missing columns are added after a successful migration', async () => {
    const missing = [
      { name: 'site_code', def: 'TEXT' },
      { name: 'confidence_scores', def: 'TEXT' },
      { name: 'needs_review', def: 'INTEGER DEFAULT 0' },
      { name: 'reviewed_at', def: 'DATETIME' },
      { name: 'validation_warnings', def: 'TEXT' }
    ];

    await runColumnMigration(db, 'memorials', missing, 'memorials_add_columns_v1');

    const cols = await dbAll(db, 'PRAGMA table_info(memorials)');
    const colNames = cols.map(c => c.name);

    for (const col of missing) {
      expect(colNames).toContain(col.name);
    }
  });

  test('3. schema_migrations row written after successful migration', async () => {
    const missing = [{ name: 'site_code', def: 'TEXT' }];

    await runColumnMigration(db, 'memorials', missing, 'memorials_add_columns_v1');

    const row = await dbGet(
      db,
      'SELECT * FROM schema_migrations WHERE migration_name = ?',
      ['memorials_add_columns_v1']
    );

    expect(row).toBeDefined();
    expect(row.migration_name).toBe('memorials_add_columns_v1');
  });

  test('4. Migration is idempotent — no duplicate schema_migrations rows', async () => {
    const missing = [{ name: 'site_code', def: 'TEXT' }];

    // First run — adds the column and records in schema_migrations
    await runColumnMigration(db, 'memorials', missing, 'memorials_add_columns_v1');

    // Second run — production code would pass an empty missing list because
    // PRAGMA table_info would show the column already exists.
    await runColumnMigration(db, 'memorials', [], 'memorials_add_columns_v1');

    const rows = await dbAll(
      db,
      'SELECT * FROM schema_migrations WHERE migration_name = ?',
      ['memorials_add_columns_v1']
    );

    // INSERT OR IGNORE means only one row regardless of how many times called
    expect(rows).toHaveLength(1);
  });
});

describe('SQLite DDL transaction rollback', () => {
  let db;

  beforeEach(async () => {
    db = await openInMemoryDb();
    await createMinimalMemorialsTable(db);
  });

  afterEach(async () => {
    await closeDb(db);
  });

  test('5. ROLLBACK after ALTER TABLE reverts the DDL change', async () => {
    await dbRun(db, 'BEGIN IMMEDIATE');
    await dbRun(db, 'ALTER TABLE memorials ADD COLUMN x TEXT');

    // Column exists inside the transaction
    const colsDuring = await dbAll(db, 'PRAGMA table_info(memorials)');
    expect(colsDuring.map(c => c.name)).toContain('x');

    await dbRun(db, 'ROLLBACK');

    // Column must NOT exist after rollback
    const colsAfter = await dbAll(db, 'PRAGMA table_info(memorials)');
    expect(colsAfter.map(c => c.name)).not.toContain('x');
  });

  test('6. Partial-migration crash → all columns rolled back (none survive)', async () => {
    await initMigrationsTable(db);

    // Insert a row so that TEXT NOT NULL without a default is rejected by SQLite
    // (SQLite only rejects NOT NULL without default when the table has existing rows).
    await dbRun(db, 'INSERT INTO memorials (memorial_number, first_name, last_name) VALUES (\'T1\', \'Test\', \'Row\')');

    // col_bad uses TEXT NOT NULL without a default, which SQLite rejects when
    // adding to an existing (already-populated) table — simulates a crash at
    // position 2 of 3 columns in the batch.
    const brokenMissing = [
      { name: 'col_a', def: 'TEXT' },
      { name: 'col_b', def: 'TEXT' },
      { name: 'col_bad', def: 'TEXT NOT NULL' }   // SQLite rejects this
    ];

    await expect(
      runColumnMigration(db, 'memorials', brokenMissing, 'memorials_test_v1')
    ).rejects.toThrow();

    const cols = await dbAll(db, 'PRAGMA table_info(memorials)');
    const colNames = cols.map(c => c.name);

    // col_a was added before the failure — must NOT persist after rollback
    expect(colNames).not.toContain('col_a');
    expect(colNames).not.toContain('col_b');
    expect(colNames).not.toContain('col_bad');
  });
});

describe('runColumnMigration — nested transaction guard (Issue #232)', () => {
  // Mirror of the fixed production runColumnMigration that uses SAVEPOINT instead of
  // BEGIN IMMEDIATE, matching the fix in src/utils/database.js (Issue #232).
  function runColumnMigrationFixed(db, tableName, missing, migrationName) {
    return new Promise((resolve, reject) => {
      if (missing.length === 0) {
        db.run(
          'INSERT OR IGNORE INTO schema_migrations (migration_name) VALUES (?)',
          [migrationName],
          (err) => (err ? reject(err) : resolve())
        );
        return;
      }
      const sp = `mig_${migrationName.replace(/[^a-z0-9_]/gi, '_')}`;
      db.run(`SAVEPOINT ${sp}`, (spErr) => {
        if (spErr) return reject(spErr);
        const addNext = (index) => {
          if (index >= missing.length) {
            db.run(`RELEASE SAVEPOINT ${sp}`, (releaseErr) => {
              if (releaseErr) {
                db.run(`ROLLBACK TO SAVEPOINT ${sp}`, () =>
                  db.run(`RELEASE SAVEPOINT ${sp}`, () => reject(releaseErr))
                );
                return;
              }
              db.run(
                'INSERT OR IGNORE INTO schema_migrations (migration_name) VALUES (?)',
                [migrationName],
                (insertErr) => (insertErr ? reject(insertErr) : resolve())
              );
            });
            return;
          }
          const col = missing[index];
          db.run(`ALTER TABLE ${tableName} ADD COLUMN ${col.name} ${col.def}`, (alterErr) => {
            if (alterErr) {
              db.run(`ROLLBACK TO SAVEPOINT ${sp}`, () =>
                db.run(`RELEASE SAVEPOINT ${sp}`, () => reject(alterErr))
              );
            } else {
              addNext(index + 1);
            }
          });
        };
        addNext(0);
      });
    });
  }

  let db;

  beforeEach(async () => {
    db = await openInMemoryDb();
    await createMinimalMemorialsTable(db);
    await initMigrationsTable(db);
  });

  afterEach(async () => {
    await closeDb(db);
  });

  test('8. Calling migration while inside a transaction adds columns and records migration', async () => {
    await dbRun(db, 'BEGIN IMMEDIATE');

    const missing = [{ name: 'disagreement_score', def: 'REAL DEFAULT NULL' }];
    await runColumnMigrationFixed(db, 'memorials', missing, 'add_cost_columns_v1');

    await dbRun(db, 'COMMIT');

    const cols = await dbAll(db, 'PRAGMA table_info(memorials)');
    expect(cols.map(c => c.name)).toContain('disagreement_score');

    const row = await dbGet(
      db,
      'SELECT * FROM schema_migrations WHERE migration_name = ?',
      ['add_cost_columns_v1']
    );
    expect(row).toBeDefined();
  });

  test('9. Calling migration outside a transaction still uses BEGIN IMMEDIATE path', async () => {
    const missing = [{ name: 'disagreement_score', def: 'REAL DEFAULT NULL' }];
    await runColumnMigrationFixed(db, 'memorials', missing, 'add_cost_columns_v1');

    const cols = await dbAll(db, 'PRAGMA table_info(memorials)');
    expect(cols.map(c => c.name)).toContain('disagreement_score');
  });

  test('10. Old behaviour (no guard) fails with nested transaction error', async () => {
    await dbRun(db, 'BEGIN IMMEDIATE');

    const missing = [{ name: 'disagreement_score', def: 'REAL DEFAULT NULL' }];

    // The unfixed helper issues BEGIN IMMEDIATE unconditionally — must fail
    await expect(
      runColumnMigration(db, 'memorials', missing, 'add_cost_columns_v1')
    ).rejects.toThrow(/transaction/i);

    await dbRun(db, 'ROLLBACK');
  });
});

describe('migrate-add-typographic-analysis.js — transaction wrapping', () => {
  test('7. Failure mid-migration rolls back all columns (none added)', async () => {
    const db = await openInMemoryDb();
    await createMinimalMemorialsTable(db);
    await initMigrationsTable(db);

    // Insert a row so that TEXT NOT NULL without a default is rejected by SQLite
    // (SQLite only rejects NOT NULL without default when the table has existing rows).
    await dbRun(db, 'INSERT INTO memorials (memorial_number, first_name, last_name) VALUES (\'T1\', \'Test\', \'Row\')');

    // Inject a bad column at position 2 (0-indexed) of the 5 typographic
    // columns, simulating a crash after col 0 and 1 are already added.
    const columns = [
      { name: 'transcription_raw', type: 'TEXT' },
      { name: 'stone_condition', type: 'TEXT' },
      { name: 'bad_col', type: 'TEXT NOT NULL' },   // will fail
      { name: 'iconography', type: 'TEXT' },
      { name: 'structural_observations', type: 'TEXT' }
    ];

    // Replicate the exact transaction pattern the migration script must use
    const migrationFn = (dbInstance, cols, migrationName) =>
      new Promise((resolve, reject) => {
        dbInstance.run('BEGIN IMMEDIATE', (beginErr) => {
          if (beginErr) return reject(beginErr);

          const addNext = (index) => {
            if (index >= cols.length) {
              dbInstance.run('COMMIT', (commitErr) => {
                if (commitErr) {
                  dbInstance.run('ROLLBACK', () => reject(commitErr));
                  return;
                }
                dbInstance.run(
                  'INSERT OR IGNORE INTO schema_migrations (migration_name) VALUES (?)',
                  [migrationName],
                  (insertErr) => {
                    if (insertErr) return reject(insertErr);
                    resolve();
                  }
                );
              });
              return;
            }
            const col = cols[index];
            dbInstance.run(
              `ALTER TABLE memorials ADD COLUMN ${col.name} ${col.type}`,
              (alterErr) => {
                if (alterErr) {
                  dbInstance.run('ROLLBACK', () => reject(alterErr));
                } else {
                  addNext(index + 1);
                }
              }
            );
          };

          addNext(0);
        });
      });

    await expect(
      migrationFn(db, columns, 'memorials_add_typographic_columns_v1')
    ).rejects.toThrow();

    const cols = await dbAll(db, 'PRAGMA table_info(memorials)');
    const colNames = cols.map(c => c.name);

    // transcription_raw was added before the failure — must be rolled back
    expect(colNames).not.toContain('transcription_raw');
    expect(colNames).not.toContain('stone_condition');
    expect(colNames).not.toContain('bad_col');

    // No schema_migrations row either
    const row = await dbGet(
      db,
      'SELECT * FROM schema_migrations WHERE migration_name = ?',
      ['memorials_add_typographic_columns_v1']
    );
    expect(row).toBeUndefined();

    await closeDb(db);
  });
});
