const logger = require('../logger');

/**
 * Adds ai_provider and model_version columns to the memorials table
 * @param {sqlite3.Database} db - Database instance to migrate
 * @returns {Promise<void>} Resolves when migration is complete
 */
async function migrateAddModelColumns(db) {
  const addColumn = (columnName) => {
    return new Promise((resolve, reject) => {
      const sql = `ALTER TABLE memorials ADD COLUMN ${columnName} TEXT`;
      db.run(sql, (err) => {
        if (err && !err.message.includes('duplicate column')) {
          reject(err);
        } else {
          resolve();
        }
      });
    });
  };

  try {
    await addColumn('ai_provider');
    await addColumn('model_version');
    logger.info('Successfully added model columns to memorials table');
  } catch (err) {
    logger.error('Error during migration:', err);
    throw err;
  }
}

module.exports = migrateAddModelColumns; 