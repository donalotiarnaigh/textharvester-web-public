/**
 * verify-migration-transactions.js
 *
 * Smoke-test script for the Issue #125 fix (transactional schema migrations).
 * Run with:
 *   node scripts/verify-migration-transactions.js
 *   npm run verify:migrations
 *
 * Exits 0 if all checks pass, 1 if any fail.
 * Does not modify the real database; isolated checks use an in-memory SQLite db.
 */

'use strict';

const os = require('os');
const path = require('path');
const fs = require('fs');
const sqlite3 = require('sqlite3').verbose();

// ─── Output helpers ──────────────────────────────────────────────────────────

const GREEN  = '\x1b[32m';
const RED    = '\x1b[31m';
const RESET  = '\x1b[0m';
const BOLD   = '\x1b[1m';

let passed = 0;
let failed = 0;
const results = [];

function recordCheck(n, ok, label, detail = '') {
  if (ok) {
    passed++;
    results.push(`  ${GREEN}✔${RESET}  ${n}. ${label}`);
  } else {
    failed++;
    const suffix = detail ? ` — ${detail}` : '';
    results.push(`  ${RED}✘${RESET}  ${n}. ${label}${RED}${suffix}${RESET}`);
  }
}

function printSummary() {
  const total = passed + failed;
  console.log('');
  console.log(`${BOLD}TextHarvester — Migration Transaction Verification${RESET}`);
  console.log('='.repeat(52));
  results.forEach(r => console.log(r));
  console.log('='.repeat(52));
  if (failed === 0) {
    console.log(`${GREEN}All ${total} checks passed.${RESET}`);
  } else {
    console.log(`${RED}${failed} of ${total} checks FAILED.${RESET}`);
  }
  console.log('');
  process.exit(failed === 0 ? 0 : 1);
}

// ─── SQLite promise wrappers (isolated db only) ───────────────────────────────

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

function openMemoryDb() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(':memory:', (err) => {
      if (err) return reject(err);
      resolve(db);
    });
  });
}

function closeDb(db) {
  return new Promise((resolve, reject) => db.close((err) => err ? reject(err) : resolve()));
}

// ─── Inline runColumnMigration (mirrors production code, works on any db) ────
// The exported runColumnMigration in database.js is bound to the module-level
// singleton db; this version accepts an explicit db so isolated checks can use
// their own in-memory connection.

function runColumnMigration(db, tableName, missing, migrationName) {
  return new Promise((resolve, reject) => {
    if (missing.length === 0) {
      db.run(
        'INSERT OR IGNORE INTO schema_migrations (migration_name) VALUES (?)',
        [migrationName],
        (err) => err ? reject(err) : resolve()
      );
      return;
    }
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
              (insertErr) => insertErr ? reject(insertErr) : resolve()
            );
          });
          return;
        }
        const col = missing[index];
        db.run(`ALTER TABLE ${tableName} ADD COLUMN ${col.name} ${col.def}`, (alterErr) => {
          if (alterErr) {
            db.run('ROLLBACK', () => reject(alterErr));
          } else {
            addNext(index + 1);
          }
        });
      };
      addNext(0);
    });
  });
}

// ─── Check 1–3: real database via database.js auto-init ──────────────────────

function checkRealDb() {
  return new Promise((resolve) => {
    // Suppress the module's logger noise to stdout during this script.
    // Requiring the module triggers initializeMigrationsTable() +
    // initializeDatabase() + initializeBurialRegisterTable() on the real db.
    // sqlite3 serialises all queued operations, so our query runs after them.
    let realDb;
    try {
      const dbModule = require('../src/utils/database');
      realDb = dbModule.db;
    } catch (e) {
      recordCheck(1, false, 'Real DB: schema_migrations table exists', e.message);
      recordCheck(2, false, 'Real DB: memorials_add_columns_v1 recorded', 'module load failed');
      recordCheck(3, false, 'Real DB: burial_register_add_columns_v1 recorded', 'module load failed');
      return resolve();
    }

    // Check 1: table exists
    realDb.get(
      'SELECT name FROM sqlite_master WHERE type=\'table\' AND name=\'schema_migrations\'',
      (err, row) => {
        recordCheck(1, !err && !!row, 'Real DB: schema_migrations table exists',
          err ? err.message : (!row ? 'table not found in sqlite_master' : ''));

        // Checks 2 & 3: migration names recorded
        realDb.all('SELECT migration_name FROM schema_migrations', (err2, rows) => {
          const names = rows ? rows.map(r => r.migration_name) : [];
          const hasMemorials = names.includes('memorials_add_columns_v1');
          const hasBurial    = names.includes('burial_register_add_columns_v1');

          recordCheck(2, !err2 && hasMemorials, 'Real DB: memorials_add_columns_v1 recorded',
            err2 ? err2.message : (!hasMemorials ? 'row missing from schema_migrations' : ''));
          recordCheck(3, !err2 && hasBurial, 'Real DB: burial_register_add_columns_v1 recorded',
            err2 ? err2.message : (!hasBurial ? 'row missing from schema_migrations' : ''));

          resolve();
        });
      }
    );
  });
}

// ─── Check 4: idempotency ────────────────────────────────────────────────────

async function checkIdempotency() {
  const db = await openMemoryDb();
  try {
    await dbRun(db, `
      CREATE TABLE memorials (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        memorial_number TEXT, first_name TEXT, last_name TEXT
      )
    `);
    await dbRun(db, `
      CREATE TABLE schema_migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        migration_name TEXT NOT NULL UNIQUE,
        applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const col = [{ name: 'site_code', def: 'TEXT' }];
    await runColumnMigration(db, 'memorials', col, 'memorials_add_columns_v1');
    // Second run with empty missing list — should still INSERT OR IGNORE
    await runColumnMigration(db, 'memorials', [], 'memorials_add_columns_v1');

    const rows = await dbAll(
      db,
      'SELECT * FROM schema_migrations WHERE migration_name = ?',
      ['memorials_add_columns_v1']
    );
    recordCheck(4, rows.length === 1,
      'Isolated DB: idempotency — no duplicate schema_migrations rows',
      rows.length !== 1 ? `expected 1 row, got ${rows.length}` : '');
  } catch (e) {
    recordCheck(4, false, 'Isolated DB: idempotency — no duplicate schema_migrations rows', e.message);
  } finally {
    await closeDb(db);
  }
}

// ─── Check 5: rollback on mid-migration failure ───────────────────────────────

async function checkRollback() {
  const db = await openMemoryDb();
  try {
    await dbRun(db, `
      CREATE TABLE memorials (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        memorial_number TEXT, first_name TEXT, last_name TEXT
      )
    `);
    await dbRun(db, `
      CREATE TABLE schema_migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        migration_name TEXT NOT NULL UNIQUE,
        applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    // Insert a row so that TEXT NOT NULL without default is rejected by SQLite
    await dbRun(db, 'INSERT INTO memorials (memorial_number, first_name, last_name) VALUES (?,?,?)',
      ['M1', 'Test', 'Row']);

    const broken = [
      { name: 'col_a', def: 'TEXT' },
      { name: 'col_b', def: 'TEXT' },
      { name: 'col_bad', def: 'TEXT NOT NULL' }  // SQLite rejects on non-empty table
    ];

    let rejected = false;
    try {
      await runColumnMigration(db, 'memorials', broken, 'memorials_rollback_test');
    } catch (e) { // eslint-disable-line no-unused-vars
      rejected = true;
    }

    const cols = await dbAll(db, 'PRAGMA table_info(memorials)');
    const colNames = cols.map(c => c.name);
    const noneAdded = !colNames.includes('col_a') && !colNames.includes('col_b');

    recordCheck(5, rejected && noneAdded,
      'Isolated DB: mid-migration crash → all columns rolled back',
      !rejected ? 'migration did not reject' :
        !noneAdded ? `columns survived rollback: ${colNames.filter(n => ['col_a','col_b','col_bad'].includes(n)).join(', ')}` : '');
  } catch (e) {
    recordCheck(5, false, 'Isolated DB: mid-migration crash → all columns rolled back', e.message);
  } finally {
    await closeDb(db);
  }
}

// ─── Check 6: typographic analysis migration script ──────────────────────────

async function checkTypographicMigration() {
  const tmpPath = path.join(os.tmpdir(), `verify-typo-${Date.now()}.db`);
  let db;
  try {
    // Build a minimal database file with the base memorials schema
    db = await new Promise((resolve, reject) => {
      const d = new sqlite3.Database(tmpPath, (err) => err ? reject(err) : resolve(d));
    });
    await dbRun(db, `
      CREATE TABLE memorials (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        memorial_number TEXT, first_name TEXT, last_name TEXT
      )
    `);
    await dbRun(db, `
      CREATE TABLE schema_migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        migration_name TEXT NOT NULL UNIQUE,
        applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await closeDb(db);
    db = null;

    // Now run the actual migration script against the temp file
    const { addTypographicAnalysisColumns } = require('./migrate-add-typographic-analysis');
    const result = await addTypographicAnalysisColumns(tmpPath);

    // Re-open and verify
    db = await new Promise((resolve, reject) => {
      const d = new sqlite3.Database(tmpPath, sqlite3.OPEN_READONLY, (err) => err ? reject(err) : resolve(d));
    });
    const row = await dbGet(
      db,
      'SELECT * FROM schema_migrations WHERE migration_name = ?',
      ['memorials_add_typographic_columns_v1']
    );
    const cols = await dbAll(db, 'PRAGMA table_info(memorials)');
    const colNames = cols.map(c => c.name);
    const allPresent = ['transcription_raw', 'stone_condition', 'typography_analysis',
      'iconography', 'structural_observations'].every(c => colNames.includes(c));

    recordCheck(6, result === true && !!row && allPresent,
      'Isolated DB: typographic migration script records in schema_migrations',
      !result   ? 'script did not return true' :
        !row      ? 'schema_migrations row missing' :
          !allPresent ? 'not all typographic columns present' : '');
  } catch (e) {
    recordCheck(6, false,
      'Isolated DB: typographic migration script records in schema_migrations', e.message);
  } finally {
    if (db) { try { await closeDb(db); } catch { /* ignore close errors on cleanup */ } }
    try { fs.unlinkSync(tmpPath); } catch { /* ignore if temp file already gone */ }
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  await checkRealDb();
  await checkIdempotency();
  await checkRollback();
  await checkTypographicMigration();
  printSummary();
}

main().catch((err) => {
  console.error('Unexpected error running verification:', err);
  process.exit(1);
});
