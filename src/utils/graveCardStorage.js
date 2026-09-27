const logger = require('./logger');
const { db } = require('./database');

/**
 * Initialize the grave_cards table
 */
function initialize() {
  const createTableSQL = `
    CREATE TABLE IF NOT EXISTS grave_cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_name TEXT NOT NULL,
      section TEXT,
      grave_number TEXT,
      data_json TEXT,
      processed_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      ai_provider TEXT,
      input_tokens INTEGER DEFAULT 0,
      output_tokens INTEGER DEFAULT 0,
      estimated_cost_usd REAL DEFAULT 0,
      processing_id TEXT,
      edited_at DATETIME,
      edited_fields TEXT,
      project_id TEXT
    )
  `;

  return new Promise((resolve, reject) => {
    db.run(createTableSQL, (err) => {
      if (err) {
        logger.error('Error creating grave_cards table:', err);
        reject(err);
        return;
      }
      logger.info('grave_cards table initialized');

      // Migration: Add cost columns if they don't exist (plain ALTER TABLE, no transaction)
      db.all('PRAGMA table_info(grave_cards)', (pragmaErr, pragmaRows) => {
        if (pragmaErr) {
          logger.error('Error checking grave_cards table info:', pragmaErr);
          resolve(); // Non-fatal: table was created OK
          return;
        }
        const existingCols = pragmaRows ? pragmaRows.map(row => row.name) : [];
        const costMigrations = [
          { name: 'input_tokens', def: 'INTEGER DEFAULT 0' },
          { name: 'output_tokens', def: 'INTEGER DEFAULT 0' },
          { name: 'estimated_cost_usd', def: 'REAL DEFAULT 0' },
          { name: 'processing_id', def: 'TEXT' },
          { name: 'needs_review', def: 'INTEGER DEFAULT 0' },
          { name: 'reviewed_at', def: 'DATETIME' },
          { name: 'edited_at', def: 'DATETIME' },
          { name: 'edited_fields', def: 'TEXT' },
          { name: 'project_id', def: 'TEXT' },
          { name: 'disagreement_score', def: 'REAL DEFAULT NULL' }
        ];
        const missing = costMigrations.filter(col => !existingCols.includes(col.name));
        if (missing.length === 0) {
          // After migrations complete, deduplicate and add unique index
          deduplicateAndIndexGraveCards();
          return;
        }
        let remaining = missing.length;
        missing.forEach(col => {
          db.run('ALTER TABLE grave_cards ADD COLUMN ' + col.name + ' ' + col.def, (alterErr) => {
            if (alterErr) {
              logger.error('Error adding column ' + col.name + ' to grave_cards:', alterErr);
            } else {
              logger.info('grave_cards: added column ' + col.name);
            }
            remaining--;
            if (remaining === 0) {
              deduplicateAndIndexGraveCards();
            }
          });
        });
      });
    });

    function deduplicateAndIndexGraveCards() {
      // Deduplicate existing records (keep newest by id)
      db.run(`DELETE FROM grave_cards WHERE id NOT IN (
        SELECT MAX(id) FROM grave_cards GROUP BY file_name, ai_provider
      )`, function(dedupErr) {
        if (dedupErr) {
          logger.error('grave_cards dedup failed:', dedupErr);
          resolve();
          return;
        }
        if (this.changes > 0) logger.info(`grave_cards: removed ${this.changes} duplicates`);

        db.run('CREATE UNIQUE INDEX IF NOT EXISTS idx_grave_cards_file_provider ON grave_cards(file_name, ai_provider)', (idxErr) => {
          if (idxErr) {
            logger.error('grave_cards unique index failed:', idxErr);
            resolve();
            return;
          }
          logger.info('grave_cards: unique index on (file_name, ai_provider) ensured');

          db.run('CREATE INDEX IF NOT EXISTS idx_grave_cards_project ON grave_cards(project_id)', (projIdxErr) => {
            if (projIdxErr) logger.error('grave_cards project_id index failed:', projIdxErr);
            else logger.info('grave_cards: project_id index ensured');
            resolve();
          });
        });
      });
    }
  });
}
/**
 * Clear all grave cards from the database.
 * @returns {Promise<void>}
 */
function clearAllGraveCards() {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM grave_cards', (err) => {
      if (err) {
        logger.error('Error clearing grave_cards table:', err);
        reject(err);
        return;
      }
      logger.info('Cleared all grave cards from database');
      resolve();
    });
  });
}


/**
 * Store a processed grave card record.
 * @param {Object} data - The complete object including metadata and AI result.
 * @returns {Promise<number>} - The ID of the inserted record.
 */
function storeGraveCard(data) {
  return new Promise((resolve, reject) => {
    if (!data.fileName) {
      const error = new Error('Missing required metadata: fileName');
      logger.error(error.message);
      reject(error);
      return;
    }

    const fileName = data.fileName;
    const aiProvider = data.ai_provider || null;
    const section = data.location?.section || null;
    const graveNumber = data.location?.grave_number || null;
    const dataJson = JSON.stringify(data);
    const inputTokens = data.input_tokens ?? 0;
    const outputTokens = data.output_tokens ?? 0;
    const estimatedCostUsd = data.estimated_cost_usd ?? 0;
    const processingId = data.processing_id || null;
    const projectId = data.project_id || null;
    const disagreementScore = data.disagreement_score ?? null;

    const sql = `
      INSERT INTO grave_cards (
        file_name,
        section,
        grave_number,
        data_json,
        ai_provider,
        input_tokens,
        output_tokens,
        estimated_cost_usd,
        processing_id,
        project_id,
        disagreement_score
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    db.run(sql, [fileName, section, graveNumber, dataJson, aiProvider, inputTokens, outputTokens, estimatedCostUsd, processingId, projectId, disagreementScore], function (err) {
      if (err) {
        // Check if this is a unique constraint violation (true duplicate)
        if (err.code === 'SQLITE_CONSTRAINT' && err.message && err.message.includes('UNIQUE constraint failed')) {
          logger.warn(`Duplicate grave card detected: file ${fileName}, provider ${aiProvider}`);
          const error = new Error(`Duplicate entry: grave card already exists for file ${fileName}, provider ${aiProvider}`);
          error.isDuplicate = true;
          reject(error);
          return;
        }
        logger.error('Error storing grave card:', err);
        reject(err);
        return;
      }
      logger.info(`Successfully stored grave card with ID: ${this.lastID}`);
      resolve(this.lastID);
    });
  });

}

/**
 * Retrieve all grave cards.
 * @returns {Promise<Array>} - List of grave cards with parsed JSON data.
 */
function getAllGraveCards() {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM grave_cards ORDER BY processed_date DESC', [], (err, rows) => {
      if (err) {
        logger.error('Error retrieving grave cards:', err);
        reject(err);
        return;
      }

      const cards = rows.map(row => {
        try {
          // Parse the JSON data
          const data = JSON.parse(row.data_json);
          return {
            ...row,
            data
          };
        } catch (e) {
          logger.warn(`Failed to parse JSON for grave card ${row.id}`, e);
          return {
            ...row,
            data: null,
            error: 'Invalid JSON data'
          };
        }
      });
      resolve(cards);
    });
  });
}

/**
 * Retrieve a single grave card by ID.
 * @param {number|string} id 
 * @returns {Promise<Object|null>}
 */
function getGraveCardById(id) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM grave_cards WHERE id = ?', [id], (err, row) => {
      if (err) {
        logger.error(`Error retrieving grave card ${id}:`, err);
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
        logger.warn(`Failed to parse JSON for grave card ${row.id}`, e);
        resolve({ ...row, data: null, error: 'Invalid JSON data' });
      }
    });
  });
}


/**
 * Deep merge an updates object into a target object.
 * @param {Object} target - The target object to merge into
 * @param {Object} updates - The updates to apply
 * @returns {Object} A new merged object
 */
function deepMerge(target, updates) {
  const result = { ...target };
  for (const [key, value] of Object.entries(updates)) {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = deepMerge(result[key] || {}, value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Update a grave card with specified fields.
 * Supports nested paths like 'location.section', 'grave.status', etc.
 * @param {number|string} id
 * @param {Object} fields - Fields to update
 * @returns {Promise<Object|null>} Updated grave card with parsed data or null if not found
 */
async function updateGraveCard(id, fields) {
  if (!id || id <= 0) {
    throw new Error('Invalid grave card ID');
  }

  if (!fields || Object.keys(fields).length === 0) {
    throw new Error('No fields to update');
  }

  // Get current grave card
  const currentCard = await getGraveCardById(id);
  if (!currentCard) {
    return null;
  }

  let currentData = currentCard.data || {};
  if (typeof currentData !== 'object') {
    currentData = {};
  }

  // Merge the updates into the data
  const updatedData = deepMerge(currentData, fields);

  // Extract top-level section and grave_number if they exist in the updates
  let topLevelUpdates = {
    data_json: JSON.stringify(updatedData)
  };

  if (fields.section !== undefined) {
    topLevelUpdates.section = fields.section;
  }
  if (fields.grave_number !== undefined) {
    topLevelUpdates.grave_number = fields.grave_number;
  }

  // Build the UPDATE statement
  const editedFields = Object.keys(fields);

  return new Promise((resolve, reject) => {
    const setClauses = Object.keys(topLevelUpdates)
      .map(key => `${key} = ?`)
      .concat(['edited_at = CURRENT_TIMESTAMP', 'edited_fields = ?'])
      .join(', ');

    const params = [
      ...Object.values(topLevelUpdates),
      JSON.stringify(editedFields),
      id
    ];

    const sql = `UPDATE grave_cards SET ${setClauses} WHERE id = ?`;

    db.run(sql, params, function(err) {
      if (err) {
        logger.error('Error updating grave card:', err);
        reject(err);
        return;
      }

      // Fetch the updated record
      getGraveCardById(id).then(resolve).catch(reject);
    });
  });
}

/**
 * Export all grave cards to a flattened CSV format.
 * @returns {Promise<string>} - The CSV string.
 */
function exportCardsToCsv() {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM grave_cards ORDER BY processed_date DESC', [], (err, rows) => {
      if (err) {
        logger.error('Error retrieving grave cards for export:', err);
        reject(err);
        return;
      }

      if (!rows || rows.length === 0) {
        resolve('');
        return;
      }

      // Process rows to flatten JSON
      const flattenedRows = rows.map(row => {
        let data = {};
        try {
          data = JSON.parse(row.data_json);
        } catch (e) {
          logger.error(`Error parsing JSON for row ${row.id}`, e);
          return null;
        }

        const flat = {
          id: row.id,
          file_name: row.file_name,
          processed_date: row.processed_date,
          ai_provider: row.ai_provider,
          section: row.section,
          grave_number: row.grave_number,
          grave_status: data.grave?.status || '',
          grave_type: data.grave?.type || '',
          grave_notes: data.grave?.notes || '',
          dimensions_length: data.grave?.dimensions?.length_ft || '',
          dimensions_width: data.grave?.dimensions?.width_ft || '',
          inscription_text: data.inscription?.text ? data.inscription.text.replace(/\n/g, ' | ') : '',
          inscription_notes: data.inscription?.notes || '',
          sketch_description: data.sketch?.description || '',
          card_processed_by: data.card_metadata?.processed_by || '',
        };

        // Flatten interments
        if (Array.isArray(data.interments)) {
          data.interments.forEach((interment, index) => {
            const i = index + 1;
            flat[`interment_${i}_name`] = interment.name || '';
            flat[`interment_${i}_date_death`] = interment.date_of_death || '';
            flat[`interment_${i}_date_burial`] = interment.date_of_burial || '';
            flat[`interment_${i}_age`] = interment.age || (interment.age_at_death || '');
            flat[`interment_${i}_notes`] = interment.notes || '';
          });
        }

        return flat;
      }).filter(r => r !== null);

      if (flattenedRows.length === 0) {
        resolve('');
        return;
      }

      // Collect all unique keys for header
      const allKeys = new Set();
      flattenedRows.forEach(row => {
        Object.keys(row).forEach(key => allKeys.add(key));
      });

      // Sort keys: Standard first, then interments sorted by number
      const standardKeys = [
        'id', 'file_name', 'processed_date', 'ai_provider', 'section', 'grave_number',
        'grave_status', 'grave_type', 'grave_notes', 'dimensions_length', 'dimensions_width',
        'inscription_text', 'inscription_notes', 'sketch_description', 'card_processed_by'
      ];

      const intermentKeys = Array.from(allKeys)
        .filter(k => k.startsWith('interment_'))
        .sort((a, b) => {
          // Extract number
          const numA = parseInt(a.match(/interment_(\d+)_/)[1]);
          const numB = parseInt(b.match(/interment_(\d+)_/)[1]);
          if (numA !== numB) return numA - numB;
          return a.localeCompare(b);
        });

      const otherKeys = Array.from(allKeys).filter(k => !standardKeys.includes(k) && !intermentKeys.includes(k));

      const sortedKeys = [...standardKeys, ...intermentKeys, ...otherKeys].filter(k => allKeys.has(k));

      // Build CSV
      const headerRow = sortedKeys.join(',');
      const dataRows = flattenedRows.map(row => {
        return sortedKeys.map(key => {
          let val = row[key] === undefined ? '' : String(row[key]);
          // Escape quotes and wrap in quotes if contains comma or newline
          if (val.includes(',') || val.includes('"') || val.includes('\n')) {
            val = `"${val.replace(/"/g, '""')}"`;
          }
          return val;
        }).join(',');
      });

      resolve([headerRow, ...dataRows].join('\n'));
    });
  });
}

// Auto-initialize if required, or export initialize
// We export initialize for better control in tests but call it if file is loaded in app context usually.
// Initialize table lazily on first use rather than at module load
// This prevents test failures when database isn't mocked properly
// initialize() is called automatically when storeGraveCard is first used
// or can be called explicitly if needed
// initialize();

module.exports = {
  initialize, // Exported for testing/explicit calling
  storeGraveCard,
  exportCardsToCsv,
  getAllGraveCards,
  getGraveCardById,
  updateGraveCard,
  clearAllGraveCards
};
