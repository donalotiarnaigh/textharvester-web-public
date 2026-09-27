const express = require('express');
const CostEstimator = require('../utils/costEstimator');
const { db } = require('../utils/database');
const config = require('../../config.json');
const logger = require('../utils/logger');

const router = express.Router();

// Valid providers
const VALID_PROVIDERS = ['openai', 'anthropic', 'gemini'];

// Valid source types
const VALID_SOURCE_TYPES = [
  'record_sheet',
  'memorial',
  'monument_photo',
  'typographic_analysis',
  'burial_register',
  'grave_record_card',
  'monument_classification',
];

/**
 * GET /api/cost-estimate
 * Query params: fileCount, provider, sourceType, pdfCount (optional)
 * Returns: Cost estimate object
 */
router.get('/', async (req, res) => {
  try {
    const { fileCount, provider, sourceType, pdfCount } = req.query;

    // Validate required params
    if (!fileCount) {
      return res.status(400).json({ error: 'Missing required parameter: fileCount' });
    }

    if (!provider) {
      return res.status(400).json({ error: 'Missing required parameter: provider' });
    }

    if (!sourceType) {
      return res.status(400).json({ error: 'Missing required parameter: sourceType' });
    }

    // Validate fileCount is a positive integer
    const fileCountNum = parseInt(fileCount, 10);
    if (isNaN(fileCountNum) || fileCountNum < 0) {
      return res.status(400).json({ error: 'fileCount must be a non-negative integer' });
    }

    // Validate provider
    if (!VALID_PROVIDERS.includes(provider)) {
      return res.status(400).json({
        error: `Invalid provider: ${provider}. Must be one of: ${VALID_PROVIDERS.join(', ')}`,
      });
    }

    // Validate sourceType (allow custom:* patterns)
    const isCustom = sourceType.startsWith('custom:');
    if (!isCustom && !VALID_SOURCE_TYPES.includes(sourceType)) {
      return res.status(400).json({
        error: `Invalid sourceType: ${sourceType}. Must be one of: ${VALID_SOURCE_TYPES.join(', ')}`,
      });
    }

    // Validate pdfCount if provided
    let pdfCountNum = 0;
    if (pdfCount !== undefined) {
      pdfCountNum = parseInt(pdfCount, 10);
      if (isNaN(pdfCountNum) || pdfCountNum < 0) {
        return res.status(400).json({ error: 'pdfCount must be a non-negative integer' });
      }
    }

    // Create estimator and compute estimate
    const estimator = new CostEstimator(db, config);
    const estimate = await estimator.estimateBatchCost({
      fileCount: fileCountNum,
      provider,
      sourceType,
      pdfCount: pdfCountNum,
    });

    res.json(estimate);
  } catch (err) {
    logger.error('Error computing cost estimate:', err);
    res.status(500).json({ error: 'Failed to compute cost estimate' });
  }
});

module.exports = router;
