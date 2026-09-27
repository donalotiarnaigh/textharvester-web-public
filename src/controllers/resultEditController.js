const logger = require('../utils/logger');
const database = require('../utils/database');
const burialRegisterStorage = require('../utils/burialRegisterStorage');
const graveCardStorage = require('../utils/graveCardStorage');

/**
 * Validate and sanitize input for update operations
 * @param {Object} fields - Fields to validate
 * @returns {Object} - Sanitized fields
 */
function sanitizeInput(fields) {
  if (!fields || typeof fields !== 'object') {
    throw new Error('Invalid input');
  }

  const sanitized = {};

  for (const [key, value] of Object.entries(fields)) {
    if (value === null || value === undefined) {
      sanitized[key] = null;
      continue;
    }

    if (typeof value === 'string') {
      sanitized[key] = value.trim().substring(0, 10000);
    } else if (typeof value === 'number') {
      sanitized[key] = value;
    } else if (typeof value === 'object') {
      // Allow objects (for nested grave card fields)
      sanitized[key] = value;
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}

/**
 * Parse and validate ID parameter
 * @param {string} idParam - ID from URL parameter
 * @returns {number} - Parsed ID
 */
function validateId(idParam) {
  // Check if idParam is a valid integer string (no decimals)
  if (typeof idParam !== 'string' || !/^\d+$/.test(idParam)) {
    throw new Error('Invalid ID format');
  }

  const id = parseInt(idParam, 10);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error('Invalid ID format');
  }
  return id;
}

/**
 * Update a memorial record
 * POST /api/results/memorials/:id
 */
async function updateMemorialHandler(req, res) {
  try {
    const id = validateId(req.params.id);
    const fields = sanitizeInput(req.body);

    if (Object.keys(fields).length === 0) {
      return res.status(400).json({
        error: 'No fields to update'
      });
    }

    const updated = await database.updateMemorial(id, fields);

    if (!updated) {
      return res.status(404).json({
        error: 'Memorial not found'
      });
    }

    res.json({
      success: true,
      memorial: updated
    });
  } catch (err) {
    logger.error('Error updating memorial:', err);

    if (err.message.includes('Invalid')) {
      return res.status(400).json({ error: err.message });
    }

    res.status(500).json({
      error: 'Failed to update memorial',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
}

/**
 * Update a burial register entry
 * PATCH /api/results/burial-register/:id
 */
async function updateBurialEntryHandler(req, res) {
  try {
    const id = validateId(req.params.id);
    const fields = sanitizeInput(req.body);

    if (Object.keys(fields).length === 0) {
      return res.status(400).json({
        error: 'No fields to update'
      });
    }

    const updated = await burialRegisterStorage.updateBurialRegisterEntry(id, fields);

    if (!updated) {
      return res.status(404).json({
        error: 'Burial register entry not found'
      });
    }

    res.json({
      success: true,
      entry: updated
    });
  } catch (err) {
    logger.error('Error updating burial register entry:', err);

    if (err.message.includes('Invalid')) {
      return res.status(400).json({ error: err.message });
    }

    res.status(500).json({
      error: 'Failed to update burial register entry',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
}

/**
 * Update a grave card
 * PATCH /api/results/grave-cards/:id
 */
async function updateGraveCardHandler(req, res) {
  try {
    const id = validateId(req.params.id);
    const fields = sanitizeInput(req.body);

    if (Object.keys(fields).length === 0) {
      return res.status(400).json({
        error: 'No fields to update'
      });
    }

    const updated = await graveCardStorage.updateGraveCard(id, fields);

    if (!updated) {
      return res.status(404).json({
        error: 'Grave card not found'
      });
    }

    res.json({
      success: true,
      card: updated
    });
  } catch (err) {
    logger.error('Error updating grave card:', err);

    if (err.message.includes('Invalid')) {
      return res.status(400).json({ error: err.message });
    }

    res.status(500).json({
      error: 'Failed to update grave card',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
}

/**
 * Mark a record as reviewed
 * POST /api/results/:type/:id/review
 */
async function markReviewedHandler(req, res) {
  try {
    const id = validateId(req.params.id);
    const recordType = req.params.type;

    // Map frontend type to database table name
    let tableName;
    switch (recordType) {
    case 'memorials':
      tableName = 'memorials';
      break;
    case 'burial-register':
      tableName = 'burial_register_entries';
      break;
    case 'grave-cards':
      tableName = 'grave_cards';
      break;
    default:
      return res.status(400).json({
        error: 'Invalid record type. Must be memorials, burial-register, or grave-cards'
      });
    }

    const updated = await database.markAsReviewed(tableName, id);

    if (!updated) {
      return res.status(404).json({
        error: `${recordType} record not found`
      });
    }

    res.json({
      success: true,
      record: updated
    });
  } catch (err) {
    logger.error('Error marking record as reviewed:', err);

    if (err.message.includes('Invalid')) {
      return res.status(400).json({ error: err.message });
    }

    res.status(500).json({
      error: 'Failed to mark record as reviewed',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
}

module.exports = {
  updateMemorialHandler,
  updateBurialEntryHandler,
  updateGraveCardHandler,
  markReviewedHandler,
  sanitizeInput,
  validateId
};
