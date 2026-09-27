const logger = require('./logger');

let conversionState = {
  isConverting: false,
  pdfs: [],
  completed: 0,
  currentFile: null,
  errors: []
};

/**
 * Register PDFs for background conversion.
 * @param {Array} pdfFiles - Array of file objects with path and originalname
 */
function registerPdfsForConversion(pdfFiles) {
  if (!pdfFiles || pdfFiles.length === 0) {
    return;
  }

  conversionState.isConverting = true;
  conversionState.pdfs = pdfFiles.map(f => ({
    path: f.path,
    originalname: f.originalname || f.path,
    status: 'pending'
  }));
  conversionState.completed = 0;
  conversionState.currentFile = null;
  conversionState.errors = [];

  logger.info(`Registered ${pdfFiles.length} PDFs for background conversion`);
}

/**
 * Get current conversion progress.
 * @returns {Object|null} Progress object or null if no conversion ever started
 */
function getConversionProgress() {
  if (conversionState.pdfs.length === 0) {
    return null;
  }

  const currentPdf = conversionState.pdfs.find(p => p.status === 'pending' || p.status === 'converting');

  return {
    total: conversionState.pdfs.length,
    completed: conversionState.completed,
    currentFile: currentPdf ? currentPdf.originalname : conversionState.currentFile,
    errors: conversionState.errors.length > 0 ? conversionState.errors : []
  };
}

/**
 * Mark a PDF conversion as complete.
 * @param {string} filePath - Path to the converted PDF
 * @param {number} imageCount - Number of images created
 */
function markConversionComplete(filePath, imageCount) {
  const pdf = conversionState.pdfs.find(p => p.path === filePath);
  if (pdf) {
    pdf.status = 'complete';
    pdf.imageCount = imageCount;
  }

  conversionState.completed++;
  conversionState.currentFile = null;

  // Check if all PDFs are done
  const allDone = conversionState.pdfs.every(p => p.status === 'complete' || p.status === 'failed');
  if (allDone) {
    conversionState.isConverting = false;
  }

  logger.info(`Conversion complete for ${filePath}, ${imageCount} images created`);
}

/**
 * Mark a PDF conversion as failed.
 * @param {string} filePath - Path to the PDF
 * @param {string} errorMessage - Error message
 */
function markConversionFailed(filePath, errorMessage) {
  const pdf = conversionState.pdfs.find(p => p.path === filePath);
  if (pdf) {
    pdf.status = 'failed';
    pdf.error = errorMessage;
  }

  conversionState.errors.push({
    file: filePath,
    message: errorMessage
  });

  // Check if all PDFs are done
  const allDone = conversionState.pdfs.every(p => p.status === 'complete' || p.status === 'failed');
  if (allDone) {
    conversionState.isConverting = false;
  }

  logger.error(`Conversion failed for ${filePath}: ${errorMessage}`);
}

/**
 * Check if conversion is in progress.
 * @returns {boolean}
 */
function isConverting() {
  return conversionState.isConverting;
}

/**
 * Reset conversion state.
 */
function resetConversionState() {
  conversionState = {
    isConverting: false,
    pdfs: [],
    completed: 0,
    currentFile: null,
    errors: []
  };
  logger.info('Conversion tracker state reset');
}

module.exports = {
  registerPdfsForConversion,
  getConversionProgress,
  markConversionComplete,
  markConversionFailed,
  isConverting,
  resetConversionState
};
