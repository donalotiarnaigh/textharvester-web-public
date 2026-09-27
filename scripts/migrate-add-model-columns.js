const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const migrateAddModelColumns = require('../src/utils/migrations/addModelColumns');
const logger = require('../src/utils/logger');

// Connect to the database
const db = new sqlite3.Database(
  path.join(__dirname, '..', 'data', 'memorials.db'),
  sqlite3.OPEN_READWRITE,
  (err) => {
    if (err) {
      logger.error('Error connecting to database:', err);
      process.exit(1);
    }
  }
);

// Run migration
migrateAddModelColumns(db)
  .then(() => {
    logger.info('Migration completed successfully');
    db.close((err) => {
      if (err) {
        logger.error('Error closing database:', err);
        process.exit(1);
      }
      process.exit(0);
    });
  })
  .catch((err) => {
    logger.error('Migration failed:', err);
    db.close((err) => {
      if (err) {
        logger.error('Error closing database:', err);
      }
      process.exit(1);
    });
  }); 