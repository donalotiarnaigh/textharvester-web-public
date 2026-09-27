/**
 * Custom error class for OCR and text processing errors
 * Extends the standard Error class with additional properties for error type and file path
 */
class ProcessingError extends Error {
  /**
   * Create a new ProcessingError
   * @param {string} message - Error message
   * @param {string} [type] - Error type identifier (e.g., 'empty_sheet', 'validation', 'network', etc.)
   * @param {string} [filePath] - Path to the file that caused the error
   */
  constructor(message, type, filePath) {
    super(message);
    this.name = 'ProcessingError';
    this.type = type;
    this.filePath = filePath;
  }
}

/**
 * Fatal error class — indicates the error should not be retried
 * (e.g., auth failures, config errors, quota exceeded)
 * Extends ProcessingError with fatal = true
 */
class FatalError extends ProcessingError {
  /**
   * Create a new FatalError
   * @param {string} message - Error message
   * @param {string} [type] - Error type identifier (e.g., 'auth_error', 'config_error', 'quota_error')
   * @param {string} [filePath] - Path to the file that caused the error
   */
  constructor(message, type, filePath) {
    super(message, type, filePath);
    this.name = 'FatalError';
    this.fatal = true;
  }
}

/**
 * Transient error class — indicates the error may be retried
 * (e.g., rate limits, timeouts, network errors)
 * Extends ProcessingError with fatal = false
 */
class TransientError extends ProcessingError {
  /**
   * Create a new TransientError
   * @param {string} message - Error message
   * @param {string} [type] - Error type identifier (e.g., 'rate_limit', 'timeout')
   * @param {string} [filePath] - Path to the file that caused the error
   */
  constructor(message, type, filePath) {
    super(message, type, filePath);
    this.name = 'TransientError';
    this.fatal = false;
  }
}

/**
 * Check if an error indicates an empty or unreadable sheet
 * @param {Error} error - The error to check
 * @returns {boolean} - True if the error indicates an empty sheet
 */
function isEmptySheetError(error) {
  // Check for ProcessingError with empty_sheet type
  if (error instanceof ProcessingError && error.type === 'empty_sheet') {
    return true;
  }
  
  // Check for error messages that suggest empty sheets
  if (error.message) {
    const lowerMessage = error.message.toLowerCase();
    return lowerMessage.includes('no readable text found') || 
           lowerMessage.includes('empty data received') || 
           lowerMessage.includes('sheet may be empty') ||
           lowerMessage.includes('sheet is empty');
  }
  
  return false;
}

/**
 * Check if an error is related to validation issues
 * @param {Error} error - The error to check
 * @returns {boolean} - True if the error is related to validation
 */
function isValidationError(error) {
  if (error instanceof ProcessingError && error.type === 'validation') {
    return true;
  }

  return false;
}

/**
 * Check if an error is fatal and should not be retried
 * @param {Error} error - The error to check
 * @returns {boolean} - True if the error is fatal
 */
function isFatalError(error) {
  if (error instanceof FatalError) {
    return true;
  }
  if (error && error.fatal === true) {
    return true;
  }
  return false;
}

module.exports = {
  ProcessingError,
  FatalError,
  TransientError,
  isEmptySheetError,
  isValidationError,
  isFatalError
}; 