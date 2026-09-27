const logger = require('./logger');
const { db } = require('./database');

/**
 * Initialize the monument_classifications table
 */
function initialize() {
  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS monument_classifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_name TEXT NOT NULL,
      broad_type TEXT,
      data_json TEXT,
      processed_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      ai_provider TEXT,
      confidence_scores TEXT,
      needs_review INTEGER DEFAULT 0,
      validation_warnings TEXT,
      input_tokens INTEGER DEFAULT 0,
      output_tokens INTEGER DEFAULT 0,
      estimated_cost_usd REAL DEFAULT 0,
      processing_id TEXT
    )
  `;

  return new Promise((resolve, reject) => {
    db.run(createTableSQL, (err) => {
      if (err) {
        logger.error('Error creating monument_classifications table:', err);
        reject(err);
        return;
      }
      logger.info('monument_classifications table initialized');
      resolve();
    });
  });
}

/**
 * Clear all classifications from the database.
 * @returns {Promise<void>}
 */
function clearAllClassifications() {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM monument_classifications', (err) => {
      if (err) {
        logger.error('Error clearing monument_classifications table:', err);
        reject(err);
        return;
      }
      logger.info('Cleared all monument classifications from database');
      resolve();
    });
  });
}

/**
 * Store a processed monument classification record.
 * @param {Object} data - The complete object including metadata and classification result.
 * @returns {Promise<number>} - The ID of the inserted record.
 */
function storeClassification(data) {
  return new Promise((resolve, reject) => {
    if (!data.fileName) {
      const error = new Error('Missing required metadata: fileName');
      logger.error(error.message);
      reject(error);
      return;
    }

    const fileName = data.fileName;
    const broadType = data.broad_type || null;
    const aiProvider = data.ai_provider || null;
    const dataJson = JSON.stringify(data);
    const confidenceScores = data.confidence_scores || null;
    const needsReview = data.needs_review ?? 0;
    const validationWarnings = data.validation_warnings || null;
    const inputTokens = data.input_tokens ?? 0;
    const outputTokens = data.output_tokens ?? 0;
    const estimatedCostUsd = data.estimated_cost_usd ?? 0;
    const processingId = data.processing_id || null;

    const sql = `
      INSERT INTO monument_classifications (
        file_name,
        broad_type,
        data_json,
        ai_provider,
        confidence_scores,
        needs_review,
        validation_warnings,
        input_tokens,
        output_tokens,
        estimated_cost_usd,
        processing_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.run(
      sql,
      [
        fileName,
        broadType,
        dataJson,
        aiProvider,
        confidenceScores,
        needsReview,
        validationWarnings,
        inputTokens,
        outputTokens,
        estimatedCostUsd,
        processingId
      ],
      function (err) {
        if (err) {
          logger.error('Error storing monument classification:', err);
          reject(err);
          return;
        }
        logger.info(`Successfully stored monument classification with ID: ${this.lastID}`);
        resolve(this.lastID);
      }
    );
  });
}

/**
 * Retrieve all monument classifications.
 * @returns {Promise<Array>} - List of classifications with parsed JSON data.
 */
function getAllClassifications() {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM monument_classifications ORDER BY processed_date DESC', [], (err, rows) => {
      if (err) {
        logger.error('Error retrieving monument classifications:', err);
        reject(err);
        return;
      }

      const classifications = (rows || []).map(row => {
        try {
          const data = JSON.parse(row.data_json);
          return {
            ...row,
            data
          };
        } catch (e) {
          logger.warn(`Failed to parse JSON for classification ${row.id}`, e);
          return {
            ...row,
            data: null,
            error: 'Invalid JSON data'
          };
        }
      });
      resolve(classifications);
    });
  });
}

/**
 * Retrieve a single classification by ID.
 * @param {number|string} id
 * @returns {Promise<Object|null>}
 */
function getClassificationById(id) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM monument_classifications WHERE id = ?', [id], (err, row) => {
      if (err) {
        logger.error(`Error retrieving classification ${id}:`, err);
        reject(err);
        return;
      }
      if (!row) {
        resolve(null);
        return;
      }
      try {
        const data = JSON.parse(row.data_json);
        resolve({ ...row, data });
      } catch (e) {
        logger.warn(`Failed to parse JSON for classification ${row.id}`, e);
        resolve({ ...row, data: null, error: 'Invalid JSON data' });
      }
    });
  });
}

module.exports = {
  initialize,
  storeClassification,
  getAllClassifications,
  getClassificationById,
  clearAllClassifications
};
