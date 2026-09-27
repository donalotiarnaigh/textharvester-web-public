const express = require('express');
const router = express.Router();
const {
  updateMemorialHandler,
  updateBurialEntryHandler,
  updateGraveCardHandler,
  markReviewedHandler
} = require('../controllers/resultEditController');

/**
 * Update a memorial record
 * PATCH /api/results/memorials/:id
 */
router.patch('/memorials/:id', updateMemorialHandler);

/**
 * Update a burial register entry
 * PATCH /api/results/burial-register/:id
 */
router.patch('/burial-register/:id', updateBurialEntryHandler);

/**
 * Update a grave card
 * PATCH /api/results/grave-cards/:id
 */
router.patch('/grave-cards/:id', updateGraveCardHandler);

/**
 * Mark a memorial as reviewed
 * POST /api/results/memorials/:id/review
 */
router.post('/memorials/:id/review', (req, res) => {
  req.params.type = 'memorials';
  markReviewedHandler(req, res);
});

/**
 * Mark a burial register entry as reviewed
 * POST /api/results/burial-register/:id/review
 */
router.post('/burial-register/:id/review', (req, res) => {
  req.params.type = 'burial-register';
  markReviewedHandler(req, res);
});

/**
 * Mark a grave card as reviewed
 * POST /api/results/grave-cards/:id/review
 */
router.post('/grave-cards/:id/review', (req, res) => {
  req.params.type = 'grave-cards';
  markReviewedHandler(req, res);
});

module.exports = router;
