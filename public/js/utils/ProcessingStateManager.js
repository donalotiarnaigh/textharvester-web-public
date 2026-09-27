/**
 * Manages processing state for files and error tracking
 */
const { CompletionVerifier } = require('../modules/processing/CompletionVerifier');

class ProcessingStateManager {
  constructor(storage) {
    this.state = {
      files: new Map(),
      errors: new Map(),
      totalFiles: 0,
      processedFiles: 0,
      phase: 'idle'
    };
    this.listeners = new Set();
    this.phaseWeights = {
      upload: 0.2,
      ocr: 0.3,
      analysis: 0.3,
      validation: 0.2
    };
    this.storage = storage;
    this.completionVerifier = new CompletionVerifier(this, storage);
    this.completionListeners = new Set();
  }

  /**
   * Add files to be processed
   * @param {Array<string>} fileIds Array of file IDs
   */
  addFiles(fileIds) {
    fileIds.forEach(fileId => {
      this.state.files.set(fileId, {
        id: fileId,
        status: 'pending',
        phases: {
          upload: 0,
          ocr: 0,
          analysis: 0,
          validation: 0
        },
        retryAttempts: {}
      });
    });
    this.state.totalFiles += fileIds.length;
    this._notifyListeners();
  }

  /**
   * Update progress for a specific file and phase
   * @param {string} fileId File identifier
   * @param {string} phase Processing phase
   * @param {number} progress Progress percentage (0-100)
   */
  async updateProgress(fileId, phase, progress) {
    const file = this.state.files.get(fileId);
    if (!file) {
      throw new Error(`File ${fileId} not found`);
    }

    // Validate progress bounds
    progress = Math.max(0, Math.min(100, progress));

    // Update phase progress
    file.phases[phase] = progress;

    // Check if file is complete
    const isComplete = Object.values(file.phases).every(p => p === 100);
    if (isComplete && file.status !== 'complete') {
      file.status = 'complete';
      this.state.processedFiles++;
    }

    // Notify state listeners
    this._notifyListeners();

    // Check overall completion
    await this._checkCompletion();
  }

  /**
   * Set the current processing phase
   * @param {string} phase Current phase
   */
  setPhase(phase) {
    if (Object.prototype.hasOwnProperty.call(this.phaseWeights, phase)) {
      this.state.phase = phase;
      this._notifyListeners();
    }
  }

  /**
   * Record an error for a file
   * @param {string} fileId File identifier
   * @param {Error} error Error object
   */
  recordError(fileId, error) {
    const fileState = this.state.files.get(fileId);
    if (fileState) {
      fileState.status = 'error';
      this.state.errors.set(fileId, error);
      this._notifyListeners();
    }
  }

  /**
   * Add a state change listener
   * @param {Function} listener Listener function
   */
  addListener(listener) {
    this.listeners.add(listener);
  }

  /**
   * Remove a state change listener
   * @param {Function} listener Listener function
   */
  removeListener(listener) {
    this.listeners.delete(listener);
  }

  /**
   * Notify all listeners of state change
   * @private
   */
  _notifyListeners() {
    this.listeners.forEach(listener => listener(this.state));
  }

  /**
   * Reset the state manager
   */
  reset() {
    this.state = {
      files: new Map(),
      errors: new Map(),
      totalFiles: 0,
      processedFiles: 0,
      phase: 'idle'
    };
    this._notifyListeners();
  }

  /**
   * Add a completion listener
   * @param {Function} listener Callback function for completion events
   */
  addCompletionListener(listener) {
    this.completionListeners.add(listener);
  }

  /**
   * Remove a completion listener
   * @param {Function} listener Callback function to remove
   */
  removeCompletionListener(listener) {
    this.completionListeners.delete(listener);
  }

  /**
   * Add a completion verification hook
   * @param {string} type Hook type ('preValidation', 'postCleanup', 'resultVerification')
   * @param {Function} hook Hook function
   */
  addCompletionHook(type, hook) {
    switch (type) {
    case 'preValidation':
      this.completionVerifier.addPreValidationHook(hook);
      break;
    case 'postCleanup':
      this.completionVerifier.addPostCleanupHook(hook);
      break;
    case 'resultVerification':
      this.completionVerifier.addResultVerificationHook(hook);
      break;
    }
  }

  /**
   * Remove a completion verification hook
   * @param {string} type Hook type ('preValidation', 'postCleanup', 'resultVerification')
   * @param {Function} hook Hook function to remove
   */
  removeCompletionHook(type, hook) {
    switch (type) {
    case 'preValidation':
      this.completionVerifier.removePreValidationHook(hook);
      break;
    case 'postCleanup':
      this.completionVerifier.removePostCleanupHook(hook);
      break;
    case 'resultVerification':
      this.completionVerifier.removeResultVerificationHook(hook);
      break;
    }
  }

  /**
   * Check completion status and notify listeners
   * @private
   */
  async _checkCompletion() {
    // First check if all files have 100% progress
    let allFilesComplete = true;
    for (const [, file] of this.state.files) {
      if (!Object.values(file.phases).every(p => p === 100)) {
        allFilesComplete = false;
        break;
      }
    }

    // Only verify completion if all files have 100% progress
    if (allFilesComplete) {
      const result = await this.completionVerifier.verifyCompletion();
      for (const listener of this.completionListeners) {
        listener(result);
      }
    }
  }

  /**
   * Clean up completed files
   */
  async cleanupCompletedFiles() {
    for (const [fileId] of this.state.files) {
      await this.completionVerifier.cleanupTemporaryStates(fileId);
    }
  }
}

module.exports = { ProcessingStateManager }; 