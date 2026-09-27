const express = require('express');
const burialRegisterStorage = require('../utils/burialRegisterStorage');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * GET /api/volume-ids
 * Returns a list of all distinct volume IDs from the database
 */
router.get('/', async (req, res) => {
  try {
    const volumeIds = await burialRegisterStorage.getDistinctVolumeIds();
    res.json({ volumeIds });
  } catch (err) {
    logger.error('Error fetching volume IDs:', err);
    res.status(500).json({ error: 'Failed to fetch volume IDs' });
  }
});

module.exports = router;
