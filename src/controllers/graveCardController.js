const logger = require('../utils/logger');
const GraveCardStorage = require('../utils/graveCardStorage');
const moment = require('moment');

/**
 * Get all grave cards.
 * GET /api/grave-cards
 */
async function getGraveCards(req, res) {
  try {
    const cards = await GraveCardStorage.getAllGraveCards();
    res.json(cards);
  } catch (error) {
    logger.error('Error in getGraveCards controller:', error);
    res.status(500).json({ error: 'Failed to retrieve grave cards' });
  }
}

/**
 * Export grave cards to CSV.
 * GET /api/grave-cards/csv
 */
async function exportGraveCardsCsv(req, res) {
  try {
    const csvData = await GraveCardStorage.exportCardsToCsv();
    const filename = `grave_cards_${moment().format('YYYYMMDD_HHmmss')}.csv`;

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csvData);

    logger.info(`Exported grave cards CSV: ${filename}, size: ${csvData.length} bytes`);
  } catch (error) {
    logger.error('Error in exportGraveCardsCsv controller:', error);
    res.status(500).json({ error: 'Failed to export CSV' });
  }
}

module.exports = {
  getGraveCards,
  exportGraveCardsCsv
};
