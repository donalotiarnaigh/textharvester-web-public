/**
 * Manages processing state for files and error tracking
 */
class ProcessingStateManager {
  constructor() {
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
  }

  /**
   * Add files to be processed
   * @param {Array<string>} fileIds Array of file IDs
   */
  addFiles(fileIds) {
    const uniqueIds = [...new Set(fileIds)];
    uniqueIds.forEach(fileId => {
      if (!this.state.files.has(fileId)) {
        this.state.files.set(fileId, {
          id: fileId,
          status: 'pending',
          phases: {
            upload: 0,
            ocr: 0,
            analysis: 0,
            validation: 0
          },
          errors: []
        });
        this.state.totalFiles++;
      }
    });
    this._notifyListeners();
  }

  /**
   * Update progress for a specific file and phase
   * @param {string} fileId File identifier
   * @param {string} phase Processing phase
   * @param {number} progress Progress percentage (0-100)
   * @returns {Promise<boolean>} True if update was successful
   */
  async updateFileProgress(fileId, phase, progress) {
    const file = this.state.files.get(fileId);
    if (!file) {
      throw new Error(`File ${fileId} not found`);
    }

    if (!Object.prototype.hasOwnProperty.call(this.phaseWeights, phase)) {
      throw new Error('Invalid phase name');
    }

    if (progress < 0 || progress > 100) {
      throw new Error('Progress value must be between 0 and 100');
    }

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

    return true;
  }

  /**
   * Calculate overall progress across all files
   * @returns {number} Overall progress percentage
   */
  getOverallProgress() {
    if (this.state.totalFiles === 0) return 0;

    let totalProgress = 0;
    for (const [, file] of this.state.files) {
      let fileProgress = 0;
      for (const [phase, weight] of Object.entries(this.phaseWeights)) {
        fileProgress += (file.phases[phase] || 0) * weight;
      }
      totalProgress += fileProgress;
    }

    return totalProgress / this.state.totalFiles;
  }

  /**
   * Add an error for a file
   * @param {string} fileId File identifier
   * @param {Error} error Error object
   */
  addError(fileId, error) {
    const fileState = this.state.files.get(fileId);
    if (fileState) {
      fileState.status = 'error';
      fileState.errors.push(error);
      this.state.errors.set(fileId, error);
      this._notifyListeners();
    }
  }

  /**
   * Clear error for a file
   * @param {string} fileId File identifier
   */
  clearError(fileId) {
    const fileState = this.state.files.get(fileId);
    if (fileState) {
      fileState.status = 'pending';
      fileState.errors = [];
      this.state.errors.delete(fileId);
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
   * Check if all files are complete
   * @returns {boolean} True if all files are complete
   */
  isComplete() {
    if (this.state.errors.size > 0) return false;
    if (this.state.processedFiles !== this.state.totalFiles) return false;

    for (const [, file] of this.state.files) {
      if (!Object.values(file.phases).every(p => p === 100)) {
        return false;
      }
    }

    return true;
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
}

module.exports = { ProcessingStateManager }; 