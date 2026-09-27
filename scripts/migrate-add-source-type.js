const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const logger = require('../src/utils/logger');

/**
 * Add source_type column to the memorials table
 * @param {string} dbPath - Optional database path (defaults to project database)
 * @returns {Promise<boolean>} - Success status
 */
async function addSourceTypeColumn(dbPath) {
  // Use provided path or default to project database
  const finalDbPath = dbPath || path.join(__dirname, '../data/memorials.db');
  
  // Check if database file exists
  if (!fs.existsSync(finalDbPath)) {
    logger.info('Database file does not exist. Migration not needed.');
    return true;
  }

  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(finalDbPath, sqlite3.OPEN_READWRITE, (err) => {
      if (err) {
        logger.error('Error connecting to database for migration:', err);
        reject(err);
        return;
      }

      // Check if source_type column already exists
      db.all('PRAGMA table_info(memorials)', (err, columns) => {
        if (err) {
          logger.error('Error checking table structure:', err);
          db.close();
          reject(err);
          return;
        }

        // Check if source_type column already exists
        const hasSourceType = columns.some(col => col.name === 'source_type');
        
        if (hasSourceType) {
          logger.info('✓ source_type column already exists');
          db.close();
          resolve(true);
          return;
        }

        // Add the source_type column
        logger.info('Adding source_type column to memorials table...');
        
        db.run('ALTER TABLE memorials ADD COLUMN source_type TEXT', (err) => {
          if (err) {
            logger.error('Error adding source_type column:', err);
            db.close();
            reject(err);
            return;
          }

          logger.info('✓ Successfully added source_type column');
          db.close();
          resolve(true);
        });
      });
    });
  });
}

// Run the migration if this script is executed directly
if (require.main === module) {
  addSourceTypeColumn()
    .then(() => {
      logger.info('Migration completed successfully');
      process.exit(0);
    })
    .catch((err) => {
      logger.error('Migration failed:', err);
      process.exit(1);
    });
}

module.exports = { addSourceTypeColumn };
