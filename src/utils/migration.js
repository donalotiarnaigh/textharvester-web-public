const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const logger = require('./logger');

// Database path
const dbDir = path.dirname(path.join(__dirname, '../../data', 'memorials.db'));
const dbPath = path.join(dbDir, 'memorials.db');

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
  logger.info('Connected to SQLite database for migration');
});

/**
 * Migrates the database to remove the confidence_score column
 */
async function migrateDatabase() {
  return new Promise((resolve, reject) => {
    // Begin transaction
    db.serialize(() => {
      db.run('BEGIN TRANSACTION', (err) => {
        if (err) {
          logger.error('Error beginning transaction:', err);
          reject(err);
          return;
        }
        
        // Create a new table without the confidence_score column
        db.run(`
          CREATE TABLE memorials_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            memorial_number TEXT,
            first_name TEXT,
            last_name TEXT,
            year_of_death TEXT,
            inscription TEXT,
            file_name TEXT,
            processed_date DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `, (err) => {
          if (err) {
            logger.error('Error creating new table:', err);
            db.run('ROLLBACK');
            reject(err);
            return;
          }
          
          // Copy data from old table to new table
          db.run(`
            INSERT INTO memorials_new (
              id, memorial_number, first_name, last_name, 
              year_of_death, inscription, file_name, processed_date
            )
            SELECT 
              id, memorial_number, first_name, last_name, 
              year_of_death, inscription, file_name, processed_date
            FROM memorials
          `, (err) => {
            if (err) {
              logger.error('Error copying data to new table:', err);
              db.run('ROLLBACK');
              reject(err);
              return;
            }
            
            // Drop old table
            db.run('DROP TABLE memorials', (err) => {
              if (err) {
                logger.error('Error dropping old table:', err);
                db.run('ROLLBACK');
                reject(err);
                return;
              }
              
              // Rename new table to old table name
              db.run('ALTER TABLE memorials_new RENAME TO memorials', (err) => {
                if (err) {
                  logger.error('Error renaming new table:', err);
                  db.run('ROLLBACK');
                  reject(err);
                  return;
                }
                
                // Commit transaction
                db.run('COMMIT', (err) => {
                  if (err) {
                    logger.error('Error committing transaction:', err);
                    db.run('ROLLBACK');
                    reject(err);
                    return;
                  }
                  
                  logger.info('Successfully migrated database to remove confidence_score column');
                  resolve();
                });
              });
            });
          });
        });
      });
    });
  });
}

// Run the migration if this script is executed directly
if (require.main === module) {
  migrateDatabase()
    .then(() => {
      logger.info('Migration completed successfully');
      db.close();
      process.exit(0);
    })
    .catch((err) => {
      logger.error('Migration failed:', err);
      db.close();
      process.exit(1);
    });
}

module.exports = { migrateDatabase }; 