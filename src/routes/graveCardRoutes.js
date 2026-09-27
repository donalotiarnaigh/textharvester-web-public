const express = require('express');
const router = express.Router();
const graveCardController = require('../controllers/graveCardController');

// GET /api/grave-cards
router.get('/', graveCardController.getGraveCards);

// GET /api/grave-cards/csv
router.get('/csv', graveCardController.exportGraveCardsCsv);

module.exports = router;
