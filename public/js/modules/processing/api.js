
// api.js



/**
 * Progress API module for handling processing state and completion
 */



/**
 * Setup the progress API with a state manager instance
 * @param {ProcessingStateManager} manager State manager instance
 */
function setupProgressAPI() {
  // manager instance removed as unused
}

/**
 * Check current processing progress
 * @returns {Promise<Object>} Current progress state
 */
async function checkProgress() {
  try {
    const response = await fetch('/api/progress', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      if (response.status === 500) {
        throw new Error('Server error');
      }
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return {
      files: data.files,
      totalFiles: data.totalFiles,
      processedFiles: data.processedFiles,
      phase: data.phase
    };
  } catch (error) {
    // Re-throw original error if it's already a specific error
    if (error.message === 'Server error') {
      throw error;
    }
    throw new Error('Failed to fetch progress');
  }
}

/**
 * Verify processing completion
 * @returns {Promise<Object>} Completion verification result
 */
async function verifyCompletion() {
  try {
    const response = await fetch('/api/verify-completion', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error('Failed to verify completion');
    }

    const result = await response.json();
    return {
      isComplete: result.isComplete,
      validFiles: result.validFiles,
      invalidFiles: result.invalidFiles,
      errors: result.errors,
      validationErrors: result.validationErrors
    };
  } catch {
    throw new Error('Failed to verify completion');
  }
}

/**
 * Cleanup completed processing
 * @returns {Promise<Object>} Cleanup result
 */
async function cleanupProcessing() {
  try {
    const response = await fetch('/api/cleanup', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error('Failed to cleanup processing');
    }

    return await response.json();
  } catch {
    throw new Error('Failed to cleanup processing');
  }
}

module.exports = {
  setupProgressAPI,
  checkProgress,
  verifyCompletion,
  cleanupProcessing
};
