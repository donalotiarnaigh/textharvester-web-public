const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { migrateToNewSchema } = require('../src/utils/migrations/schemaUpdate');
const logger = require('../src/utils/logger');
const { backupDatabase } = require('../src/utils/database');

async function main() {
  try {
    // Create backup before migration
    logger.info('Creating database backup...');
    await backupDatabase();

    // Connect to the database
    const db = new sqlite3.Database(
      path.join(__dirname, '..', 'data', 'memorials.db'),
      sqlite3.OPEN_READWRITE,
      (err) => {
        if (err) {
          logger.error('Error connecting to database:', err);
          process.exit(1);
        }
        logger.info('Connected to database');
      }
    );

    // Run migration
    logger.info('Starting schema migration...');
    await migrateToNewSchema(db);
    logger.info('Schema migration completed successfully');

    // Close database connection
    db.close((err) => {
      if (err) {
        logger.error('Error closing database:', err);
        process.exit(1);
      }
      logger.info('Database connection closed');
      process.exit(0);
    });
  } catch (error) {
    logger.error('Migration failed:', error);
    process.exit(1);
  }
}

// Run migration
main(); 