const { db } = require('./database');
const logger = require('./logger');
const config = require('../../config.json');
const path = require('path');
const fs = require('fs');

const burialRegisterConfig = config.burialRegister || {};

/**
 * Resolve the base directory for burial register outputs.
 * @returns {string} Absolute path to the burial register base directory
 */
function getBurialRegisterBaseDir() {
  const outputDir = process.env.BURIAL_REGISTER_OUTPUT_DIR || burialRegisterConfig.outputDir;

  if (outputDir) {
    return path.resolve(outputDir);
  }

  return path.join(__dirname, '..', '..', 'data', 'burial_register');
}

/**
 * Pad the page number to a three digit string.
 * @param {number|string|null} pageNumber Page number to pad
 * @returns {string} Three-character padded page number
 */
function padPageNumber(pageNumber) {
  if (pageNumber === null || pageNumber === undefined) {
    return '000';
  }

  const parsedNumber = Number.parseInt(pageNumber, 10);
  const pageValue = Number.isNaN(parsedNumber) ? pageNumber : parsedNumber;

  return String(pageValue).padStart(3, '0');
}

/**
 * Persist validated burial register page JSON to disk.
 * @param {Object} pageData Validated page data
 * @param {string} provider AI provider name
 * @param {string} volumeId Volume identifier
 * @param {number|string} pageNumber Page number
 * @returns {Promise<string>} Absolute path to the stored JSON file
 */
async function storePageJSON(pageData, provider, volumeId, pageNumber) {
  if (!pageData || typeof pageData !== 'object') {
    throw new Error('pageData is required to store burial register JSON');
  }
  if (!provider) {
    throw new Error('provider is required to store burial register JSON');
  }
  if (!volumeId) {
    throw new Error('volumeId is required to store burial register JSON');
  }
  if (pageNumber === null || pageNumber === undefined) {
    throw new Error('pageNumber is required to store burial register JSON');
  }

  const paddedPage = padPageNumber(pageNumber);
  const pagesDir = path.join(getBurialRegisterBaseDir(), volumeId, 'pages', provider);

  try {
    await fs.promises.mkdir(pagesDir, { recursive: true });
  } catch (err) {
    logger.error(`Error creating directory for burial register page JSON: ${pagesDir}`, err);
    throw err;
  }

  const filePath = path.join(pagesDir, `page_${paddedPage}.json`);
  await fs.promises.writeFile(filePath, JSON.stringify(pageData, null, 2), 'utf-8');
  logger.info(`Stored burial register page JSON: volume_id=${volumeId}, page_number=${pageNumber}, provider=${provider}, path=${filePath}`);

  return filePath;
}

/**
 * Extract page number from filename if it matches the expected pattern.
 * Patterns supported:
 *   - page_{NNN}.jpg, page_{NNN}.png (where NNN is 1-3 digits)
 *   - page-{NNN}.jpg, page-{NNN}.png
 *   - page_{NNN}_{TIMESTAMP}.jpg (with optional timestamp)
 *   - page-{NNN}_{TIMESTAMP}.jpg (with optional timestamp)
 * @param {string} fileName Filename to extract page number from
 * @returns {number|null} Extracted page number or null if pattern doesn't match
 */
function extractPageNumberFromFilename(fileName) {
  if (!fileName || typeof fileName !== 'string') {
    return null;
  }

  // Match pattern: page_ or page- followed by 1-3 digits, optionally followed by underscore and timestamp, then extension
  // Handles formats: page_001.jpg, page-001.jpg, page_033_1764952402182.jpg, page-033_1764952402190.jpg
  const match = fileName.match(/page[-_](\d{1,3})(?:_\d+)?\.(jpg|png|jpeg)/i);
  if (match && match[1]) {
    const pageNumber = Number.parseInt(match[1], 10);
    if (!Number.isNaN(pageNumber) && pageNumber > 0) {
      return pageNumber;
    }
  }

  return null;
}

/**
 * Map an entry object to the parameter order expected by the burial_register_entries table.
 * @param {Object} entry Entry object ready for storage
 * @returns {Array<*>} Parameter array for sqlite run
 */
function buildBurialEntryParams(entry) {
  const fileName = entry.fileName || entry.file_name;
  const pageNumber = entry.page_number !== undefined && entry.page_number !== null
    ? Number.parseInt(entry.page_number, 10)
    : null;
  const rowIndex = entry.row_index_on_page !== undefined && entry.row_index_on_page !== null
    ? Number.parseInt(entry.row_index_on_page, 10)
    : null;

  const uncertaintyFlags = Array.isArray(entry.uncertainty_flags)
    ? JSON.stringify(entry.uncertainty_flags)
    : entry.uncertainty_flags === undefined || entry.uncertainty_flags === null
      ? JSON.stringify([])
      : typeof entry.uncertainty_flags === 'string'
        ? entry.uncertainty_flags
        : JSON.stringify([]);

  const confidenceScores = entry.confidence_scores
    ? (typeof entry.confidence_scores === 'string' ? entry.confidence_scores : JSON.stringify(entry.confidence_scores))
    : null;

  return [
    entry.volume_id || null,
    pageNumber,
    rowIndex,
    entry.entry_id || null,
    entry.entry_no_raw || null,
    entry.name_raw || null,
    entry.abode_raw || null,
    entry.burial_date_raw || null,
    entry.age_raw || null,
    entry.officiant_raw || null,
    entry.marginalia_raw || null,
    entry.extra_notes_raw || null,
    entry.row_ocr_raw || null,
    entry.parish_header_raw || null,
    entry.county_header_raw || null,
    entry.year_header_raw || null,
    entry.model_name || null,
    entry.model_run_id || null,
    uncertaintyFlags,
    fileName,
    entry.ai_provider || null,
    entry.prompt_template || null,
    entry.prompt_version || null,
    confidenceScores,
    entry.confidence_coverage ?? null,
    entry.disagreement_score ?? null,
    entry.needs_review ?? 0,
    entry.validation_warnings ? JSON.stringify(entry.validation_warnings) : null,
    entry.input_tokens        ?? 0,
    entry.output_tokens       ?? 0,
    entry.estimated_cost_usd  ?? 0,
    entry.processing_id || null,
    entry.project_id || null,
    entry.burial_date_normalized || null,
    entry.burial_date_year ?? null
  ];
}

/**
 * Insert a single burial register entry into the database.
 * @param {Object} entry Entry data ready for insertion
 * @returns {Promise<Object>} Object with { rowId } indicating successful storage
 */
async function storeBurialRegisterEntry(entry) {
  if (!entry || typeof entry !== 'object') {
    throw new Error('Entry data is required for storage');
  }

  if (!entry.volume_id) {
    throw new Error('volume_id is required to store a burial register entry');
  }

  if (entry.page_number === undefined || entry.page_number === null) {
    throw new Error('page_number is required to store a burial register entry');
  }

  if (entry.row_index_on_page === undefined || entry.row_index_on_page === null) {
    throw new Error('row_index_on_page is required to store a burial register entry');
  }

  if (!entry.ai_provider) {
    throw new Error('ai_provider is required to store a burial register entry');
  }

  const fileName = entry.fileName || entry.file_name;
  if (!fileName) {
    throw new Error('file_name is required to store a burial register entry');
  }

  const sql = `
    INSERT INTO burial_register_entries (
      volume_id,
      page_number,
      row_index_on_page,
      entry_id,
      entry_no_raw,
      name_raw,
      abode_raw,
      burial_date_raw,
      age_raw,
      officiant_raw,
      marginalia_raw,
      extra_notes_raw,
      row_ocr_raw,
      parish_header_raw,
      county_header_raw,
      year_header_raw,
      model_name,
      model_run_id,
      uncertainty_flags,
      file_name,
      ai_provider,
      prompt_template,
      prompt_version,
      confidence_scores,
      confidence_coverage,
      disagreement_score,
      needs_review,
      validation_warnings,
      input_tokens,
      output_tokens,
      estimated_cost_usd,
      processing_id,
      project_id,
      burial_date_normalized,
      burial_date_year
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

  const params = buildBurialEntryParams(entry);

  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) {
        // Check if this is a unique constraint violation (true duplicate)
        if (err.code === 'SQLITE_CONSTRAINT' && err.message && err.message.includes('UNIQUE constraint failed')) {
          logger.warn(`Duplicate entry detected: same file ${fileName}, volume_id=${entry.volume_id}, row_index=${entry.row_index_on_page}, provider=${entry.ai_provider}`);
          const error = new Error(`Duplicate entry: entry already exists for file ${fileName}, row ${entry.row_index_on_page}, provider ${entry.ai_provider}`);
          error.isDuplicate = true;
          reject(error);
          return;
        } else {
          // Not a unique constraint error, re-throw
          logger.error('Error storing burial register entry:', {
            error: err,
            volume_id: entry.volume_id,
            page_number: entry.page_number,
            row_index_on_page: entry.row_index_on_page,
            entry_id: entry.entry_id,
            file_name: fileName,
            ai_provider: entry.ai_provider
          });
          reject(err);
          return;
        }
      }

      // Success
      logger.debug(`Successfully stored burial register entry with ID: ${this.lastID}, entry_id=${entry.entry_id}`);
      resolve({
        rowId: this.lastID
      });
    });
  });
}

/**
 * Clear all burial register entries from the database.
 * @returns {Promise<void>} Resolves when all entries are cleared
 */
function clearAllBurialRegisterEntries() {
  return new Promise((resolve, reject) => {
    // First, get the count of entries to be deleted
    db.get('SELECT COUNT(*) as count FROM burial_register_entries', [], (err, row) => {
      if (err) {
        logger.error('Error counting burial register entries before deletion:', err);
        reject(err);
        return;
      }

      const count = row?.count || 0;
      logger.info(`Clearing ${count} burial register entries from database`);

      db.run('DELETE FROM burial_register_entries', [], (err2) => {
        if (err2) {
          logger.error('Error clearing burial register entries:', err2);
          reject(err2);
          return;
        }
        logger.info(`Successfully cleared ${count} burial register entries`);
        resolve();
      });
    });
  });
}

/**
 * Retrieve all burial register entries from the database.
 * @returns {Promise<Array>} Resolves with array of burial register entries
 */
function getAllBurialRegisterEntries() {
  return new Promise((resolve, reject) => {
    logger.info('Attempting to retrieve all burial register entries');
    db.all('SELECT * FROM burial_register_entries ORDER BY processed_date DESC', [], (err, rows) => {
      if (err) {
        logger.error('Error retrieving burial register entries:', err);
        reject(err);
        return;
      }
      logger.info(`Retrieved ${rows ? rows.length : 0} burial register entries (most recent first)`);
      resolve(rows || []); // Ensure we always return an array
    });
  });
}

/**
 * Retrieve all distinct volume IDs from the database, ordered alphabetically.
 * @returns {Promise<Array>} Resolves with array of volume ID strings
 */
function getDistinctVolumeIds() {
  return new Promise((resolve, reject) => {
    db.all('SELECT DISTINCT volume_id FROM burial_register_entries ORDER BY volume_id', [], (err, rows) => {
      if (err) {
        logger.error('Error retrieving distinct volume IDs:', err);
        reject(err);
        return;
      }
      resolve((rows || []).map(r => r.volume_id));
    });
  });
}

/**
 * Retrieve a single burial register entry by ID.
 * @param {number|string} id
 * @returns {Promise<Object|null>}
 */
function getBurialRegisterEntryById(id) {
  return new Promise((resolve, reject) => {
    logger.info(`Attempting to retrieve burial register entry with ID: ${id}`);
    db.get('SELECT * FROM burial_register_entries WHERE id = ?', [id], (err, row) => {
      if (err) {
        logger.error(`Error retrieving burial register entry ${id}:`, err);
        reject(err);
        return;
      }
      resolve(row || null);
    });
  });
}

const BURIAL_EDITABLE_FIELDS = [
  'entry_no_raw', 'name_raw', 'abode_raw', 'burial_date_raw',
  'age_raw', 'officiant_raw', 'marginalia_raw', 'extra_notes_raw'
];

/**
 * Update a burial register entry with specified fields.
 * @param {number|string} id
 * @param {Object} fields - Fields to update (only editable fields will be applied)
 * @returns {Promise<Object|null>} Updated entry or null if not found
 */
async function updateBurialRegisterEntry(id, fields) {
  if (!id || id <= 0) {
    throw new Error('Invalid burial register entry ID');
  }

  if (!fields || Object.keys(fields).length === 0) {
    throw new Error('No fields to update');
  }

  // Filter to editable fields only
  const editableUpdates = {};
  const editedFields = [];

  for (const [key, value] of Object.entries(fields)) {
    if (BURIAL_EDITABLE_FIELDS.includes(key)) {
      editableUpdates[key] = value;
      editedFields.push(key);
    }
  }

  if (editedFields.length === 0) {
    throw new Error('No valid editable fields provided');
  }

  return new Promise((resolve, reject) => {
    const setClauses = Object.keys(editableUpdates)
      .map(key => `${key} = ?`)
      .concat(['edited_at = CURRENT_TIMESTAMP', 'edited_fields = ?'])
      .join(', ');

    const params = [
      ...Object.values(editableUpdates),
      JSON.stringify(editedFields),
      id
    ];

    const sql = `UPDATE burial_register_entries SET ${setClauses} WHERE id = ?`;

    db.run(sql, params, function(err) {
      if (err) {
        logger.error('Error updating burial register entry:', err);
        reject(err);
        return;
      }

      // Fetch the updated record
      db.get('SELECT * FROM burial_register_entries WHERE id = ?', [id], (err, row) => {
        if (err) {
          logger.error('Error fetching updated burial register entry:', err);
          reject(err);
          return;
        }
        resolve(row || null);
      });
    });
  });
}

module.exports = {
  storePageJSON,
  storeBurialRegisterEntry,
  getBurialRegisterBaseDir,
  clearAllBurialRegisterEntries,
  getAllBurialRegisterEntries,
  getDistinctVolumeIds,
  getBurialRegisterEntryById,
  updateBurialRegisterEntry,
  BURIAL_EDITABLE_FIELDS,
  extractPageNumberFromFilename
};
