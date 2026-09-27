// processingFlag.js

const fs = require('fs');
const logger = require('./logger');
const config = require('../../config.json');

function clearProcessingCompleteFlag() {
  const flagPath = config.processingCompleteFlagPath;
  try {
    if (fs.existsSync(flagPath)) {
      fs.unlinkSync(flagPath);
      logger.info('Cleared existing processing completion flag.');
    }
  } catch (err) {
    logger.error('Error clearing processing completion flag:', err);
  }
}

module.exports = {
  clearProcessingCompleteFlag,
};
