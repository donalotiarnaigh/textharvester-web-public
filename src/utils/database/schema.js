const logger = require('../logger');

/**
 * Initialize the database with the required schema and indexes
 * @param {sqlite3.Database} db - The database instance to initialize
 * @returns {Promise<void>} Resolves when initialization is complete
 */
async function initializeDatabase(db) {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Drop existing table if it exists
      db.run('DROP TABLE IF EXISTS memorials', (err) => {
        if (err) {
          logger.error('Error dropping existing table:', err);
          reject(err);
          return;
        }
      });

      // Create memorials table with proper types
      db.run(`
        CREATE TABLE memorials (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          memorial_number INTEGER,
          first_name TEXT,
          last_name TEXT,
          year_of_death TEXT CONSTRAINT valid_year CHECK (
            year_of_death IS NULL OR 
            (typeof(year_of_death) = 'integer' AND year_of_death > 1500 AND year_of_death <= 2100) OR
            (typeof(year_of_death) = 'text' AND (year_of_death = '-' OR year_of_death GLOB '*-*'))
          ),
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
          reject(err);
          return;
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
              reject(err);
              return;
            }
            completed++;
            if (completed === indexes.length) {
              logger.info('All indexes created successfully');
              resolve();
            }
          });
        });
      });
    });
  });
}

/**
 * Insert sample test data into the database
 * @param {sqlite3.Database} db - The database instance
 * @returns {Promise<void>} Resolves when sample data is inserted
 */
async function insertSampleData(db) {
  const sampleData = [
    {
      memorial_number: 123,
      first_name: 'John',
      last_name: 'Doe',
      year_of_death: 1900,
      inscription: 'Beloved father and husband',
      file_name: 'memorial123.jpg',
      ai_provider: 'openai',
      model_version: 'gpt-5.1',
      prompt_version: '1.0.0'
    },
    {
      memorial_number: 124,
      first_name: 'Jane',
      last_name: 'Smith',
      year_of_death: 1925,
      inscription: 'In loving memory',
      file_name: 'memorial124.jpg',
      ai_provider: 'anthropic',
      model_version: 'claude-3',
      prompt_version: '1.0.0'
    }
  ];

  return new Promise((resolve, reject) => {
    let completed = 0;
    sampleData.forEach((data) => {
      db.run(`
        INSERT INTO memorials (
          memorial_number, first_name, last_name,
          year_of_death, inscription, file_name,
          ai_provider, model_version, prompt_version
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        data.memorial_number,
        data.first_name,
        data.last_name,
        data.year_of_death,
        data.inscription,
        data.file_name,
        data.ai_provider,
        data.model_version,
        data.prompt_version
      ], (err) => {
        if (err) {
          logger.error('Error inserting sample data:', err);
          reject(err);
          return;
        }
        completed++;
        if (completed === sampleData.length) {
          logger.info('Sample data inserted successfully');
          resolve();
        }
      });
    });
  });
}

module.exports = {
  initializeDatabase,
  insertSampleData
}; 