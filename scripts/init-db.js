const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const logger = require('../src/utils/logger');

// Database path
const dbPath = path.join(__dirname, '..', 'data', 'memorials.db');

// Create/connect to database
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    logger.error('Error connecting to database:', err);
    process.exit(1);
  }
  logger.info('Connected to database');
});

// Create tables with updated schema
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS memorials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      memorial_number INTEGER,
      first_name TEXT,
      last_name TEXT,
      year_of_death INTEGER CONSTRAINT valid_year CHECK (year_of_death IS NULL OR (year_of_death > 1500 AND year_of_death <= 2100 AND typeof(year_of_death) = 'integer')),
      inscription TEXT,
      file_name TEXT NOT NULL,
      ai_provider TEXT,
      model_version TEXT,
      prompt_template TEXT,
      prompt_version TEXT,
      processed_date DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) {
      logger.error('Error creating memorials table:', err);
      process.exit(1);
    }
    logger.info('Memorials table created successfully');

    // Create indexes for common queries
    const indexes = [
      'CREATE INDEX idx_memorial_number ON memorials(memorial_number)',
      'CREATE INDEX idx_name ON memorials(last_name, first_name)',
      'CREATE INDEX idx_year ON memorials(year_of_death)'
    ];

    let completed = 0;
    indexes.forEach((sql, index) => {
      db.run(sql, (err) => {
        if (err) {
          logger.error(`Error creating index ${index + 1}:`, err);
          process.exit(1);
        }
        completed++;
        
        // Close database connection after all indexes are created
        if (completed === indexes.length) {
          db.close((err) => {
            if (err) {
              logger.error('Error closing database:', err);
              process.exit(1);
            }
            logger.info('Database initialized successfully with all indexes');
            process.exit(0);
          });
        }
      });
    });
  });
}); 