/**
 * Verifies the completion state of file processing
 */
class CompletionVerifier {
  constructor(stateManager, resultStore) {
    this.stateManager = stateManager;
    this.resultStore = resultStore;
    this.maxVerificationAttempts = 3;
    this.verificationDelay = 1000; // 1 second between attempts
  }

  /**
   * Verify complete processing state
   * @returns {Promise<boolean>} True if processing is complete
   */
  async verifyCompletion() {
    const completionState = this.stateManager.state.completionState;

    // Check if we've exceeded max attempts
    if (completionState.verificationAttempts >= this.maxVerificationAttempts) {
      return false;
    }

    // Add delay between verification attempts
    if (completionState.lastVerification) {
      const timeSinceLastVerification = Date.now() - completionState.lastVerification;
      if (timeSinceLastVerification < this.verificationDelay) {
        await new Promise(resolve => setTimeout(resolve, this.verificationDelay - timeSinceLastVerification));
      }
    }

    try {
      const [
        filesProcessed,
        resultsValid,
        noActiveProcessing,
        storageValid
      ] = await Promise.all([
        this._verifyAllFilesProcessed(),
        this._verifyResultsIntegrity(),
        this._verifyNoActiveProcessing(),
        this._verifyStorageState()
      ]);

      // Update completion state
      completionState.verificationAttempts++;
      completionState.lastVerification = Date.now();
      completionState.allFilesProcessed = filesProcessed;
      completionState.resultsVerified = resultsValid;

      return filesProcessed && resultsValid && noActiveProcessing && storageValid;
    } catch (error) {
      console.error('Completion verification failed:', error);
      return false;
    }
  }

  /**
   * Verify all files have been processed
   * @private
   */
  async _verifyAllFilesProcessed() {
    return await this.stateManager.isComplete();
  }

  /**
   * Verify integrity of processing results
   * @private
   */
  async _verifyResultsIntegrity() {
    try {
      const files = Array.from(this.stateManager.state.files.values());

      // Check each file has corresponding results
      for (const file of files) {
        const result = await this.resultStore.getResult(file.id);
        if (!result) return false;

        // Verify result structure
        if (!this._validateResultStructure(result)) {
          return false;
        }
      }

      return true;
    } catch (error) {
      console.error('Results integrity check failed:', error);
      return false;
    }
  }

  /**
   * Verify no active processing is happening
   * @private
   */
  async _verifyNoActiveProcessing() {
    return this.stateManager.state.processingQueue.size === 0;
  }

  /**
   * Verify storage state is consistent
   * @private
   */
  async _verifyStorageState() {
    try {
      const files = Array.from(this.stateManager.state.files.values());

      // Verify temporary processing files are cleaned up
      for (const file of files) {
        const tempFiles = await this._checkTemporaryFiles(file.id);
        if (tempFiles.length > 0) return false;
      }

      return true;
    } catch (error) {
      console.error('Storage state verification failed:', error);
      return false;
    }
  }

  /**
   * Validate structure of a result object
   * @private
   */
  _validateResultStructure(result) {
    // Required fields for a valid result
    const requiredFields = ['id', 'text', 'metadata', 'timestamp'];

    // Check all required fields exist
    for (const field of requiredFields) {
      if (!(field in result)) return false;
    }

    // Validate specific fields
    if (typeof result.text !== 'string' || result.text.length === 0) return false;
    if (!result.timestamp || isNaN(new Date(result.timestamp).getTime())) return false;
    if (typeof result.metadata !== 'object') return false;

    return true;
  }

  /**
   * Check for temporary processing files
   * @private
   */
  async _checkTemporaryFiles() {
    let result = [];
    try {
      // Implementation depends on your file storage system
      // This is a placeholder that should be implemented based on your storage backend
      result = await Promise.resolve([]);
    } catch (error) {
      console.error('Temporary files check failed:', error);
    }
    return result;
  }
}

module.exports = CompletionVerifier; 