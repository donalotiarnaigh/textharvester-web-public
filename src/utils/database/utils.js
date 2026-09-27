const logger = require('../logger');

/**
 * Store a single memorial record with proper type handling
 * @param {sqlite3.Database} db - Database instance
 * @param {Object} data - Memorial data to store
 * @returns {Promise<number>} Resolves with the ID of the inserted record
 */
async function storeMemorial(db, data) {
  logger.info('Attempting to store memorial:', JSON.stringify(data));
  
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
      prompt_version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  // Type conversion for numeric fields
  const memorial_number = data.memorial_number ? parseInt(data.memorial_number, 10) : null;
  const year_of_death = data.year_of_death ? parseInt(data.year_of_death, 10) : null;
  
  // Handle file_name from either fileName or file_name property
  const file_name = data.fileName || data.file_name;
  if (!file_name) {
    throw new Error('NOT NULL constraint failed: file_name');
  }

  // Validate year_of_death if present
  if (year_of_death !== null) {
    const currentYear = new Date().getFullYear();
    if (year_of_death <= 1500 || year_of_death > currentYear + 1) {
      throw new Error('CHECK constraint failed: valid_year');
    }
  }

  return new Promise((resolve, reject) => {
    db.run(sql, [
      memorial_number,
      data.first_name || null,
      data.last_name || null,
      year_of_death,
      data.inscription || null,
      file_name,
      data.ai_provider || null,
      data.model_version || null,
      data.prompt_version || null
    ], function(err) {
      if (err) {
        logger.error('Error storing memorial:', err);
        reject(err);
        return;
      }
      logger.info(`Successfully stored memorial with ID: ${this.lastID}`);
      resolve(this.lastID);
    });
  });
}

/**
 * Retrieve all memorial records
 * @param {sqlite3.Database} db - Database instance
 * @returns {Promise<Array>} Resolves with array of memorial records
 */
async function getAllMemorials(db) {
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

/**
 * Clear all memorial records from the database
 * @param {sqlite3.Database} db - Database instance
 * @returns {Promise<void>} Resolves when all records are cleared
 */
async function clearAllMemorials(db) {
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

module.exports = {
  storeMemorial,
  getAllMemorials,
  clearAllMemorials
}; 