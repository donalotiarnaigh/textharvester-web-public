const logger = require('./logger');

/**
 * Extract memorial number from filename for monument photos
 * Supports various filename patterns commonly used in heritage photography
 * @param {string} filename - The filename to parse
 * @param {string} sourceType - The source type ('monument_photo' or 'record_sheet')
 * @returns {string|null} Extracted memorial number or null if not found/applicable
 */
function extractMemorialNumberFromFilename(filename, sourceType = 'record_sheet') {
  // Only extract from monument photos - record sheets should use OCR
  if (sourceType !== 'monument_photo') {
    return null;
  }

  if (!filename || typeof filename !== 'string') {
    return null;
  }

  // Remove file extension for parsing
  const baseName = filename.replace(/\.[^/.]+$/, '');
  
  logger.info(`[FilenameParser] Parsing filename for memorial number: "${filename}" -> "${baseName}"`);

  // Pattern 1: Simple numeric filename (e.g., "123.jpg" -> "123")
  if (/^\d+$/.test(baseName)) {
    const number = baseName;
    logger.info(`[FilenameParser] Found simple numeric pattern: ${number}`);
    return number;
  }

  // Pattern 2: Douro format (e.g., "stja-0006.jpg", "stjb-0123.jpg")
  const douroMatch = baseName.match(/^stj[abcd]-(\d{1,4})$/);
  if (douroMatch) {
    const number = douroMatch[1];
    // For Douro format, preserve zero-padding exactly as in filename
    logger.info(`[FilenameParser] Found Douro format pattern: ${number}`);
    return number;
  }

  // Pattern 2b: General prefix with number (e.g., "HG-123.jpg", "monument-456.jpg", "grave_789.jpg")
  const prefixMatch = baseName.match(/^[a-zA-Z]+[-_]?(\d+)$/);
  if (prefixMatch) {
    const number = prefixMatch[1];
    // Remove leading zeros but keep at least one digit
    const cleanNumber = number.replace(/^0+/, '') || '0';
    logger.info(`[FilenameParser] Found prefix pattern: ${number} -> ${cleanNumber}`);
    return cleanNumber;
  }

  // Pattern 3: Number at end (e.g., "stja-0006_1757276988194.jpg" -> "0006")
  const endNumberMatch = baseName.match(/[-_](\d{1,4})(?:_\d+)?$/);
  if (endNumberMatch) {
    const number = endNumberMatch[1];
    // For Douro format, preserve zero-padding (e.g., "0006" stays "0006")
    // Only remove leading zeros if the number is all zeros or single digit
    let cleanNumber = number;
    if (number === '0000' || number === '00' || number === '0') {
      cleanNumber = '0';
    } else if (number.startsWith('0') && number.length > 1) {
      // Keep zero-padding for multi-digit numbers (e.g., "0006" -> "0006")
      cleanNumber = number;
    } else {
      // For numbers without leading zeros, keep as is
      cleanNumber = number;
    }
    logger.info(`[FilenameParser] Found end number pattern: ${number} -> ${cleanNumber}`);
    return cleanNumber;
  }

  // Pattern 4: Any sequence of digits (fallback)
  const anyNumberMatch = baseName.match(/(\d{2,})/);
  if (anyNumberMatch) {
    const number = anyNumberMatch[1];
    // Remove leading zeros but keep at least one digit
    const cleanNumber = number.replace(/^0+/, '') || '0';
    logger.info(`[FilenameParser] Found fallback number pattern: ${number} -> ${cleanNumber}`);
    return cleanNumber;
  }

  // Pattern 5: Single digit (last resort)
  const singleDigitMatch = baseName.match(/(\d)/);
  if (singleDigitMatch) {
    const number = singleDigitMatch[1];
    logger.info(`[FilenameParser] Found single digit pattern: ${number}`);
    return number;
  }

  logger.warn(`[FilenameParser] No memorial number found in filename: ${filename}`);
  return null;
}

/**
 * Generate a fallback memorial number when filename parsing fails
 * @param {string} filename - Original filename
 * @returns {string} Generated memorial number
 */
function generateFallbackMemorialNumber(filename) {
  // Use a hash of the filename to generate a consistent number
  let hash = 0;
  for (let i = 0; i < filename.length; i++) {
    const char = filename.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  // Convert to positive number and limit to reasonable range
  const memorialNumber = Math.abs(hash) % 9999 + 1;
  logger.info(`[FilenameParser] Generated fallback memorial number: ${memorialNumber} for ${filename}`);
  return memorialNumber.toString();
}

/**
 * Get memorial number for monument photo, extracting from filename or generating fallback
 * @param {string} filename - The filename
 * @param {string} sourceType - The source type
 * @returns {string|null} Memorial number for monuments, null for record sheets
 */
function getMemorialNumberForMonument(filename, sourceType = 'record_sheet') {
  if (sourceType !== 'monument_photo') {
    return null; // Let record sheets use OCR-extracted memorial numbers
  }

  const extracted = extractMemorialNumberFromFilename(filename, sourceType);
  
  if (extracted) {
    return extracted;
  }

  // For monuments, we always want a memorial number, so generate one if needed
  return generateFallbackMemorialNumber(filename);
}

module.exports = {
  extractMemorialNumberFromFilename,
  generateFallbackMemorialNumber,
  getMemorialNumberForMonument
};
