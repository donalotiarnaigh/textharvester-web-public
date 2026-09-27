/**
 * Handles the file processing pipeline with progress tracking
 */
class FileProcessor {
  constructor(stateManager, uploader, ocrService, analyzer, validator) {
    this.stateManager = stateManager;
    this.uploader = uploader;
    this.ocrService = ocrService;
    this.analyzer = analyzer;
    this.validator = validator;
    this.cancelledFiles = new Set();
    this.progressIntervals = new Map();
  }

  /**
   * Process a single file through all phases
   * @param {File} file File to process
   * @returns {Promise<void>}
   */
  async processFile(file) {
    const fileId = file.name;
    this.stateManager.addFiles([fileId]);

    try {
      // Upload phase
      await this._processPhase('upload', async () => {
        const uploadResult = await this._trackProgress(
          fileId,
          () => this.uploader.upload(file),
          progress => this.stateManager.updateProgress(fileId, 'upload', progress)
        );
        if (this._isCancelled(fileId)) return;
        return uploadResult;
      });
      if (this._isCancelled(fileId)) return;

      // OCR phase
      await this._processPhase('ocr', async () => {
        const ocrResult = await this._trackProgress(
          fileId,
          () => this.ocrService.process(file),
          progress => this.stateManager.updateProgress(fileId, 'ocr', progress)
        );
        if (this._isCancelled(fileId)) return;
        return ocrResult;
      });
      if (this._isCancelled(fileId)) return;

      // Analysis phase
      await this._processPhase('analysis', async () => {
        const analysisResult = await this._trackProgress(
          fileId,
          () => this.analyzer.analyze(file),
          progress => this.stateManager.updateProgress(fileId, 'analysis', progress)
        );
        if (this._isCancelled(fileId)) return;
        return analysisResult;
      });
      if (this._isCancelled(fileId)) return;

      // Validation phase
      await this._processPhase('validation', async () => {
        const validationResult = await this._trackProgress(
          fileId,
          () => this.validator.validate(file),
          progress => this.stateManager.updateProgress(fileId, 'validation', progress)
        );
        if (this._isCancelled(fileId)) return;
        return validationResult;
      });

      // Mark as complete if not cancelled
      if (!this._isCancelled(fileId)) {
        await this.stateManager.updateProgress(fileId, 'validation', 100);
        const fileState = this.stateManager.state.files.get(fileId);
        if (fileState) {
          fileState.status = 'complete';
        }
      }
    } catch (error) {
      this.stateManager.recordError(fileId, error);
    } finally {
      // Clean up any remaining intervals
      this._cleanupProgressInterval(fileId);
    }
  }

  /**
   * Track progress for an operation with periodic updates
   * @param {string} fileId File identifier
   * @param {Function} operation Async operation to execute
   * @param {Function} progressCallback Callback for progress updates
   * @returns {Promise<any>} Operation result
   * @private
   */
  async _trackProgress(fileId, operation, progressCallback) {
    // Start progress tracking
    let progressValue = 0;

    // Create a progress interval that simulates progress
    const interval = setInterval(() => {
      if (!this._isCancelled(fileId)) {
        progressValue = Math.min(progressValue + 20, 95); // Progress towards 95%
        progressCallback(progressValue);
      }
    }, 50); // Update every 50ms

    this.progressIntervals.set(fileId, interval);

    try {
      // Execute the operation
      const result = await operation();

      // Complete the progress to 100%
      if (!this._isCancelled(fileId)) {
        progressCallback(100);
      }

      return result;
    } finally {
      // Clean up the interval
      clearInterval(interval);
      this.progressIntervals.delete(fileId);
    }
  }

  /**
   * Cancel processing for a specific file
   * @param {string} fileId File identifier
   */
  cancelProcessing(fileId) {
    this.cancelledFiles.add(fileId);
    const fileState = this.stateManager.state.files.get(fileId);
    if (fileState) {
      fileState.status = 'cancelled';
      // Stop progress updates
      this._cleanupProgressInterval(fileId);
      // Freeze progress at current value
      const currentPhase = this.stateManager.state.phase;
      const currentProgress = fileState.phases[currentPhase];
      this.stateManager.updateProgress(fileId, currentPhase, Math.min(currentProgress, 95));
      this.stateManager._notifyListeners();
    }
  }

  /**
   * Process a single phase with state management
   * @param {string} phase Phase name
   * @param {Function} processor Async processor function
   * @private
   */
  async _processPhase(phase, processor) {
    this.stateManager.setPhase(phase);
    return await processor();
  }

  /**
   * Clean up progress tracking interval
   * @param {string} fileId File identifier
   * @private
   */
  _cleanupProgressInterval(fileId) {
    const interval = this.progressIntervals.get(fileId);
    if (interval) {
      clearInterval(interval);
      this.progressIntervals.delete(fileId);
    }
  }

  /**
   * Check if a file's processing has been cancelled
   * @param {string} fileId File identifier
   * @returns {boolean}
   * @private
   */
  _isCancelled(fileId) {
    return this.cancelledFiles.has(fileId);
  }
}

module.exports = { FileProcessor }; 