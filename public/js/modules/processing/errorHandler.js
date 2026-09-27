/**
 * Updates the error messages display in the UI
 * @param {Array} errors - Array of error objects
 */
export function updateErrorMessages(errors) {
  const errorContainer = document.getElementById('errorContainer');
  const errorList = document.getElementById('errorList');
  
  if (!errorContainer || !errorList) {
    console.error('Error container or error list element not found');
    return;
  }
  
  // Clear previous errors
  errorList.innerHTML = '';
  
  // Skip if no errors or errors is empty
  if (!errors || errors.length === 0) {
    errorContainer.style.display = 'none';
    return;
  }
  
  // Show container
  errorContainer.style.display = 'block';
  
  // Add each error message
  errors.forEach(err => {
    const errorItem = document.createElement('div');
    errorItem.className = 'error-item';
    
    let message = `<strong>File:</strong> ${err.fileName} - `;
    
    // Format message based on error type
    switch(err.errorType) {
    case 'empty_sheet':
      message += 'This sheet appears to be empty or unreadable. Processing was skipped for this page.';
      break;
    case 'processing_failed':
      message += 'Processing failed after multiple attempts. Please check the image quality.';
      break;
    case 'validation':
      message += `Validation error: ${err.errorMessage}`;
      break;
    default:
      message += err.errorMessage || 'An unknown error occurred';
    }
    
    errorItem.innerHTML = message;
    errorList.appendChild(errorItem);
  });
}

/**
 * Handles error recovery, retries, and persistence
 */
class ErrorHandler {
  constructor(stateManager, storage) {
    this.stateManager = stateManager;
    this.storage = storage;
  }

  /**
   * Initialize error handler and load persisted errors
   */
  async initialize() {
    const savedErrors = await this.storage.loadErrors();
    savedErrors.forEach(error => {
      this.stateManager.state.errors.set(error.fileId, new Error(error.error));
    });
  }

  /**
   * Retry an operation with exponential backoff
   * @param {string} fileId - The file identifier
   * @param {string} phase - The processing phase
   * @param {Function} operation - The operation to retry
   * @param {Object} options - Retry options
   * @returns {Promise<*>} - The operation result
   */
  async withRetry(fileId, phase, operation, options = {}) {
    const { maxRetries = 3, initialDelay = 1000 } = options;
    let attempts = 0;
    let lastError;

    while (attempts <= maxRetries) {
      try {
        if (attempts > 0) {
          const delay = initialDelay * Math.pow(2, attempts - 1);
          await new Promise(resolve => setTimeout(resolve, delay));
        }

        const result = await operation();
        if (attempts > 0) {
          const fileState = this.stateManager.state.files.get(fileId);
          if (fileState) {
            fileState.retryAttempts = fileState.retryAttempts || {};
            fileState.retryAttempts[phase] = attempts;
          }
        }
        return result;
      } catch (error) {
        lastError = error;
        attempts++;
      }
    }

    throw lastError;
  }

  /**
   * Attempt to recover from a saved error state
   * @param {string} fileId - The file identifier
   * @returns {Promise<Object>} - Recovery result
   */
  async attemptRecovery(fileId) {
    const savedErrors = await this.storage.loadErrors();
    const fileErrors = savedErrors.filter(error => error.fileId === fileId);
    
    if (fileErrors.length === 0) {
      return { attempted: false };
    }

    // Sort by timestamp to get most recent error
    const mostRecentError = fileErrors.sort((a, b) => b.timestamp - a.timestamp)[0];
    return {
      attempted: true,
      phase: mostRecentError.phase
    };
  }

  /**
   * Mark an error as resolved
   * @param {string} fileId - The file identifier
   */
  async markErrorResolved(fileId) {
    const fileState = this.stateManager.state.files.get(fileId);
    if (fileState) {
      fileState.status = 'pending';
      this.stateManager.state.errors.delete(fileId);
      await this.storage.clearError(fileId);
      this.stateManager._notifyListeners();
    }
  }

  /**
   * Persist error details to storage
   * @param {string} fileId - The file identifier
   * @param {string} phase - The processing phase
   * @param {Error} error - The error object
   */
  async persistError(fileId, phase, error) {
    await this.storage.saveError({
      fileId,
      phase,
      error: error.message,
      timestamp: Date.now()
    });
  }
}

module.exports = { ErrorHandler }; 