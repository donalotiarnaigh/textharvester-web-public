const logger = require('./logger');
const { db } = require('./database');
const config = require('../../config.json');

/**
 * Initialize the llm_audit_log table
 */
function initialize() {
  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS llm_audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      processing_id TEXT NOT NULL,
      provider TEXT NOT NULL,
      model TEXT NOT NULL,
      system_prompt TEXT,
      user_prompt TEXT,
      image_size_bytes INTEGER DEFAULT 0,
      raw_response TEXT,
      input_tokens INTEGER DEFAULT 0,
      output_tokens INTEGER DEFAULT 0,
      response_time_ms INTEGER DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'success',
      error_message TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `;

  const cacheMigrations = [
    'ALTER TABLE llm_audit_log ADD COLUMN cache_creation_tokens INTEGER DEFAULT 0',
    'ALTER TABLE llm_audit_log ADD COLUMN cache_read_tokens INTEGER DEFAULT 0',
  ];

  return new Promise((resolve, reject) => {
    db.run(createTableSQL, (err) => {
      if (err) {
        logger.error('Error creating llm_audit_log table:', err);
        reject(err);
        return;
      }

      // Run migrations sequentially; ignore "duplicate column" errors (column already exists)
      const runMigrations = (migrations, index) => {
        if (index >= migrations.length) {
          logger.info('llm_audit_log table initialized');
          resolve();
          return;
        }
        db.run(migrations[index], (migErr) => {
          if (migErr && !migErr.message.includes('duplicate column name')) {
            logger.error('Error running llm_audit_log migration:', migErr);
          }
          runMigrations(migrations, index + 1);
        });
      };
      runMigrations(cacheMigrations, 0);
    });
  });
}

/**
 * Log an LLM API call to the audit log.
 * Fire-and-forget: catches all errors internally, never throws.
 *
 * @param {Object} entry - Audit log entry
 * @param {string} entry.processing_id - Unique request correlation ID
 * @param {string} entry.provider - Provider name (openai, anthropic, gemini)
 * @param {string} entry.model - Model identifier
 * @param {string} [entry.system_prompt] - Full system prompt sent to LLM
 * @param {string} [entry.user_prompt] - Full user prompt sent to LLM
 * @param {number} [entry.image_size_bytes] - Size of base64 image in bytes
 * @param {string} [entry.raw_response] - Raw response text before parsing
 * @param {number} [entry.input_tokens] - Input token count from API response
 * @param {number} [entry.output_tokens] - Output token count from API response
 * @param {number} [entry.response_time_ms] - API call duration in milliseconds
 * @param {string} [entry.status='success'] - Status: 'success' or 'error'
 * @param {string} [entry.error_message] - Error message if status is 'error'
 * @returns {Promise<number|undefined>} - Inserted row ID, or undefined on error
 */
async function logEntry(entry) {
  // Check if audit logging is enabled (always on by default)
  if (config.audit?.enabled === false) {
    return; // Audit logging is disabled
  }

  return new Promise((resolve) => {
    const {
      processing_id,
      provider,
      model,
      system_prompt = null,
      user_prompt = null,
      image_size_bytes = 0,
      raw_response = null,
      input_tokens = 0,
      output_tokens = 0,
      cache_creation_tokens = 0,
      cache_read_tokens = 0,
      response_time_ms = 0,
      status = 'success',
      error_message = null
    } = entry;

    const sql = `
      INSERT INTO llm_audit_log (
        processing_id,
        provider,
        model,
        system_prompt,
        user_prompt,
        image_size_bytes,
        raw_response,
        input_tokens,
        output_tokens,
        cache_creation_tokens,
        cache_read_tokens,
        response_time_ms,
        status,
        error_message
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.run(
      sql,
      [
        processing_id,
        provider,
        model,
        system_prompt,
        user_prompt,
        image_size_bytes,
        raw_response,
        input_tokens,
        output_tokens,
        cache_creation_tokens,
        cache_read_tokens,
        response_time_ms,
        status,
        error_message
      ],
      function (err) {
        if (err) {
          logger.error('Error logging audit entry:', err);
          resolve(undefined);
          return;
        }
        resolve(this.lastID);
      }
    );
  });
}

/**
 * Retrieve all audit log entries for a given processing_id.
 * Used for debugging and eval dataset building.
 *
 * @param {string} processingId - Unique request correlation ID
 * @returns {Promise<Array>} - Array of audit log entries, empty array on error
 */
async function getEntriesByProcessingId(processingId) {
  return new Promise((resolve) => {
    const sql = 'SELECT * FROM llm_audit_log WHERE processing_id = ? ORDER BY timestamp ASC';

    db.all(sql, [processingId], (err, rows) => {
      if (err) {
        logger.error('Error retrieving audit entries:', err);
        resolve([]);
        return;
      }
      resolve(rows || []);
    });
  });
}

module.exports = {
  initialize,
  logEntry,
  getEntriesByProcessingId
};
