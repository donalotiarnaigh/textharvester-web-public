/**
 * Processor Registry - maps sourceType to processor functions
 * Each processor is an async function that processes files of a specific type
 */

const graveCardRecordProcessor = require('./graveCardRecordProcessor');
const burialRegisterProcessor = require('./burialRegisterProcessor');
const monumentClassificationProcessor = require('./monumentClassificationProcessor');
const memorialProcessor = require('./memorialProcessor');

const processorMap = {
  grave_record_card: graveCardRecordProcessor,
  burial_register: burialRegisterProcessor,
  monument_classification: monumentClassificationProcessor,
  memorial: memorialProcessor,
  monument_photo: memorialProcessor,
  typographic_analysis: memorialProcessor,
  record_sheet: memorialProcessor,
};

/**
 * Get processor function for a given sourceType
 * @param {string} sourceType - The source type identifier
 * @returns {Function} Async processor function with signature (context) => Promise
 */
function getProcessor(sourceType) {
  return processorMap[sourceType] || memorialProcessor;
}

module.exports = { getProcessor };
