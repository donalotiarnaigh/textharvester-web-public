const logger = require('../logger');

/**
 * Migrates the database to the new schema with proper types
 * @param {sqlite3.Database} db - Database instance to migrate
 * @returns {Promise<void>} Resolves when migration is complete
 */
async function migrateToNewSchema(db) {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Begin transaction
      db.run('BEGIN TRANSACTION', (err) => {
        if (err) {
          logger.error('Error beginning transaction:', err);
          reject(err);
          return;
        }

        // Create new table with updated schema
        db.run(`
          CREATE TABLE memorials_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            memorial_number INTEGER,
            first_name TEXT,
            last_name TEXT,
            year_of_death INTEGER,
            inscription TEXT,
            file_name TEXT NOT NULL,
            ai_provider TEXT,
            model_version TEXT,
            prompt_version TEXT,
            processed_date DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `, (err) => {
          if (err) {
            logger.error('Error creating new table:', err);
            db.run('ROLLBACK');
            reject(err);
            return;
          }

          // Copy data with type conversion
          db.run(`
            INSERT INTO memorials_new (
              id, memorial_number, first_name, last_name,
              year_of_death, inscription, file_name,
              ai_provider, model_version, processed_date
            )
            SELECT 
              id,
              CAST(NULLIF(memorial_number, '') AS INTEGER),
              first_name,
              last_name,
              CAST(NULLIF(year_of_death, '') AS INTEGER),
              inscription,
              file_name,
              ai_provider,
              model_version,
              processed_date
            FROM memorials
          `, (err) => {
            if (err) {
              logger.error('Error copying data:', err);
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

              // Rename new table
              db.run('ALTER TABLE memorials_new RENAME TO memorials', (err) => {
                if (err) {
                  logger.error('Error renaming table:', err);
                  db.run('ROLLBACK');
                  reject(err);
                  return;
                }

                // Create indexes
                const indexes = [
                  'CREATE INDEX idx_memorial_number ON memorials(memorial_number)',
                  'CREATE INDEX idx_name ON memorials(last_name, first_name)',
                  'CREATE INDEX idx_year ON memorials(year_of_death)'
                ];

                let indexesCreated = 0;
                indexes.forEach(indexSql => {
                  db.run(indexSql, (err) => {
                    if (err) {
                      logger.error('Error creating index:', err);
                      db.run('ROLLBACK');
                      reject(err);
                      return;
                    }
                    indexesCreated++;
                    if (indexesCreated === indexes.length) {
                      // Commit transaction
                      db.run('COMMIT', (err) => {
                        if (err) {
                          logger.error('Error committing transaction:', err);
                          db.run('ROLLBACK');
                          reject(err);
                          return;
                        }
                        logger.info('Successfully migrated to new schema');
                        resolve();
                      });
                    }
                  });
                });
              });
            });
          });
        });
      });
    });
  });
}

module.exports = {
  migrateToNewSchema
}; 