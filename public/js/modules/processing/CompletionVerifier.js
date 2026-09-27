/**
 * Handles completion verification with enhanced logging and state tracking
 */
const logger = require('../../../src/utils/logger');

class CompletionVerifier {
  constructor(stateManager, storage) {
    this.stateManager = stateManager;
    this.storage = storage;
    this.verificationStart = null;
    this.stateTransitions = [];
    this.phaseOrder = ['upload', 'ocr', 'analysis', 'validation'];
    
    // Initialize hook arrays
    this.preValidationHooks = new Set();
    this.postCleanupHooks = new Set();
    this.resultVerificationHooks = new Set();
  }

  /**
   * Add a pre-validation hook
   * @param {Function} hook Hook function that returns Promise<boolean>
   */
  addPreValidationHook(hook) {
    this.preValidationHooks.add(hook);
  }

  /**
   * Remove a pre-validation hook
   * @param {Function} hook Hook function to remove
   */
  removePreValidationHook(hook) {
    this.preValidationHooks.delete(hook);
  }

  /**
   * Add a post-cleanup hook
   * @param {Function} hook Hook function that returns Promise<boolean>
   */
  addPostCleanupHook(hook) {
    this.postCleanupHooks.add(hook);
  }

  /**
   * Remove a post-cleanup hook
   * @param {Function} hook Hook function to remove
   */
  removePostCleanupHook(hook) {
    this.postCleanupHooks.delete(hook);
  }

  /**
   * Add a result verification hook
   * @param {Function} hook Hook function that returns Promise<{isValid: boolean, error?: string}>
   */
  addResultVerificationHook(hook) {
    this.resultVerificationHooks.add(hook);
  }

  /**
   * Remove a result verification hook
   * @param {Function} hook Hook function to remove
   */
  removeResultVerificationHook(hook) {
    this.resultVerificationHooks.delete(hook);
  }

  /**
   * Execute pre-validation hooks
   * @param {string} fileId File identifier
   * @param {Object} context Context object passed to hooks
   * @returns {Promise<{isValid: boolean, error?: string}>}
   * @private
   */
  async _executePreValidationHooks(fileId, context) {
    for (const hook of this.preValidationHooks) {
      const result = await hook(fileId, context);
      if (!result) {
        return {
          isValid: false,
          error: 'Pre-validation hook failed'
        };
      }
    }
    return { isValid: true };
  }

  /**
   * Execute post-cleanup hooks
   * @param {string} fileId File identifier
   * @param {Object} context Context object passed to hooks
   * @returns {Promise<void>}
   * @private
   */
  async _executePostCleanupHooks(fileId, context) {
    for (const hook of this.postCleanupHooks) {
      await hook(fileId, context);
    }
  }

  /**
   * Execute result verification hooks
   * @param {string} fileId File identifier
   * @param {Object} context Context object passed to hooks
   * @returns {Promise<{isValid: boolean, error?: string}>}
   * @private
   */
  async _executeResultVerificationHooks(fileId, context) {
    for (const hook of this.resultVerificationHooks) {
      const result = await hook(fileId, context);
      if (!result.isValid) {
        return result;
      }
    }
    return { isValid: true };
  }

  /**
   * Verify completion status with enhanced logging
   * @returns {Promise<Object>} Completion status object
   */
  async verifyCompletion() {
    this.verificationStart = Date.now();
    logger.info('Starting completion verification');
    
    try {
      // Track initial state
      this._trackStateTransition('verification_start');
      
      const validFiles = [];
      const invalidFiles = [];
      const errors = [];
      const validationErrors = [];

      // Verify each file
      for (const [fileId, file] of this.stateManager.state.files) {
        // Execute pre-validation hooks
        const preValidation = await this._executePreValidationHooks(fileId, { file });
        if (!preValidation.isValid) {
          invalidFiles.push(fileId);
          validationErrors.push({
            fileId,
            error: preValidation.error
          });
          continue;
        }

        // Verify file completion
        const completion = await this.verifyFileCompletion(fileId);
        if (!completion.isComplete) {
          invalidFiles.push(fileId);
          if (completion.hasError) {
            errors.push({
              fileId,
              error: completion.error
            });
          }
          continue;
        }

        // Verify result integrity
        const integrity = await this.verifyResultIntegrity(fileId);
        if (!integrity.isValid) {
          invalidFiles.push(fileId);
          validationErrors.push({
            fileId,
            error: integrity.message
          });
          continue;
        }

        validFiles.push(fileId);
      }

      // Track completion
      this._trackStateTransition('verification_complete');
      
      // Log verification metrics
      this._logVerificationMetrics();
      
      return {
        isComplete: invalidFiles.length === 0,
        validFiles,
        invalidFiles,
        errors,
        validationErrors,
        message: invalidFiles.length === 0 ? 
          'All files processed successfully' : 
          `${invalidFiles.length} files incomplete or invalid`
      };
    } catch (error) {
      logger.error('Completion verification failed', error, {
        phase: 'completion_verification',
        operation: 'verify'
      });
      return {
        isComplete: false,
        validFiles: [],
        invalidFiles: Array.from(this.stateManager.state.files.keys()),
        errors: [{
          error: error.message || 'Unknown error during verification'
        }],
        validationErrors: [],
        message: 'Verification failed due to error'
      };
    }
  }

  /**
   * Run cleanup operations with logging
   */
  async cleanup() {
    logger.info('Starting cleanup operations');
    this._trackStateTransition('cleanup_start');
    
    try {
      // Clean up temporary files
      await this._cleanupTempFiles();
      
      // Archive processed files
      await this._archiveFiles();
      
      // Clear processing flags
      await this._clearFlags();
      
      this._trackStateTransition('cleanup_complete');
      logger.info('Cleanup operations completed successfully');
    } catch (error) {
      logger.error('Cleanup operations failed', error, {
        phase: 'cleanup',
        operation: 'cleanup'
      });
      throw error;
    }
  }

  /**
   * Verify all files have been processed
   * @private
   */
  async _verifyAllFilesProcessed() {
    this._trackStateTransition('checking_files');
    const { files, totalFiles, processedFiles } = this.stateManager.state;
    
    // Check counts match
    if (processedFiles !== totalFiles) {
      return false;
    }
    
    // Check individual file states
    for (const [fileId, file] of files.entries()) {
      if (file.status !== 'complete' && file.status !== 'error') {
        logger.debug(`File ${fileId} not complete: ${file.status}`);
        return false;
      }
    }
    
    return true;
  }

  /**
   * Verify results are properly saved
   * @private
   */
  async _verifyResultsSaved() {
    this._trackStateTransition('checking_storage');
    try {
      const saved = await this.storage.verifyResults();
      if (!saved) {
        logger.warn('Results not found in storage');
      }
      return saved;
    } catch (error) {
      logger.error('Failed to verify results in storage', error, {
        phase: 'verification',
        operation: 'check_storage'
      });
      return false;
    }
  }

  /**
   * Verify data integrity
   * @private
   */
  async _verifyDataIntegrity() {
    this._trackStateTransition('checking_integrity');
    try {
      const results = await this.storage.loadResults();
      
      // Check result count matches processed files
      if (results.length !== this.stateManager.state.processedFiles) {
        logger.warn('Result count mismatch');
        return false;
      }
      
      // Validate each result
      for (const result of results) {
        if (!this._validateResultData(result)) {
          logger.warn(`Invalid result data for ${result.fileId}`);
          return false;
        }
      }
      
      return true;
    } catch (error) {
      logger.error('Data integrity check failed', error, {
        phase: 'verification',
        operation: 'check_integrity'
      });
      return false;
    }
  }

  /**
   * Clean up temporary files
   * @private
   */
  async _cleanupTempFiles() {
    this._trackStateTransition('cleaning_temp');
    // Implementation depends on storage system
  }

  /**
   * Archive processed files
   * @private
   */
  async _archiveFiles() {
    this._trackStateTransition('archiving');
    // Implementation depends on storage system
  }

  /**
   * Clear processing flags
   * @private
   */
  async _clearFlags() {
    this._trackStateTransition('clearing_flags');
    // Implementation depends on storage system
  }

  /**
   * Track state transitions for analysis
   * @private
   */
  _trackStateTransition(state) {
    this.stateTransitions.push({
      state,
      timestamp: Date.now()
    });
  }

  /**
   * Log verification metrics
   * @private
   */
  _logVerificationMetrics() {
    const endTime = Date.now();
    const duration = endTime - this.verificationStart;
    
    logger.trackMetrics({
      processingTime: duration,
      success: true,
      operation: 'verification',
      transitions: this.stateTransitions.length
    });
    
    logger.info('Verification completed', {
      duration,
      transitions: this.stateTransitions,
      finalState: this.stateTransitions[this.stateTransitions.length - 1]
    });
  }

  /**
   * Validate result data structure
   * @private
   */
  _validateResultData(result) {
    return result && 
           typeof result === 'object' &&
           result.fileId &&
           (result.status === 'complete' || result.status === 'error');
  }

  /**
   * Verify completion status of a single file
   * @param {string} fileId File identifier
   * @param {Object} options Options for verification
   * @returns {Promise<Object>} Completion status
   */
  async verifyFileCompletion(fileId, options = {}) {
    const file = this.stateManager.state.files.get(fileId);
    if (!file) {
      return {
        isComplete: false,
        message: 'File not found',
        incompletePhases: []
      };
    }

    // Execute pre-validation hooks if not skipped
    if (!options.skipPreValidation) {
      const preValidation = await this._executePreValidationHooks(fileId, { file });
      if (!preValidation.isValid) {
        return {
          isComplete: false,
          hasError: true,
          error: preValidation.error,
          message: `Pre-validation failed: ${preValidation.error}`,
          incompletePhases: []
        };
      }
    }

    // Check for errors
    const error = this.stateManager.state.errors.get(fileId);
    if (error) {
      return {
        isComplete: false,
        hasError: true,
        error,
        message: `Error: ${error.message}`,
        incompletePhases: []
      };
    }

    // Check phase completion
    const incompletePhases = [];
    for (const phase of this.phaseOrder) {
      if (file.phases[phase] < 100) {
        incompletePhases.push(phase);
      }
    }

    return {
      isComplete: incompletePhases.length === 0,
      incompletePhases,
      message: incompletePhases.length > 0 ? 
        `Incomplete phases: ${incompletePhases.join(', ')}` : 
        'All phases complete'
    };
  }

  /**
   * Validate the order of completed phases
   * @param {string} fileId File identifier
   * @returns {Promise<Object>} Validation result
   */
  async validatePhaseOrder(fileId) {
    const file = this.stateManager.state.files.get(fileId);
    if (!file) {
      return {
        isValid: false,
        message: 'File not found'
      };
    }

    let lastCompletePhaseIndex = -1;
    let isValid = true;
    let message = 'Phase order valid';

    for (let i = 0; i < this.phaseOrder.length; i++) {
      const phase = this.phaseOrder[i];
      if (file.phases[phase] === 100) {
        if (i > lastCompletePhaseIndex + 1) {
          isValid = false;
          message = `Invalid phase order: ${this.phaseOrder[lastCompletePhaseIndex + 1]} must complete before ${phase}`;
          break;
        }
        lastCompletePhaseIndex = i;
      }
    }

    return { isValid, message };
  }

  /**
   * Validate phase dependencies
   * @param {string} fileId File identifier
   * @returns {Promise<Object>} Validation result
   */
  async validatePhaseDependencies(fileId) {
    const file = this.stateManager.state.files.get(fileId);
    if (!file) {
      return {
        isValid: false,
        message: 'File not found',
        missingDependencies: []
      };
    }

    const missingDependencies = [];
    for (let i = 0; i < this.phaseOrder.length; i++) {
      const phase = this.phaseOrder[i];
      const nextPhase = this.phaseOrder[i + 1];

      if (nextPhase && file.phases[nextPhase] > 0 && file.phases[phase] < 100) {
        missingDependencies.push(phase);
      }
    }

    return {
      isValid: missingDependencies.length === 0,
      missingDependencies,
      message: missingDependencies.length > 0 ? 
        `Missing dependencies: ${missingDependencies.join(', ')}` : 
        'All dependencies satisfied'
    };
  }

  /**
   * Verify integrity of processed results
   * @param {string} fileId File identifier
   * @returns {Promise<Object>} Verification result
   */
  async verifyResultIntegrity(fileId) {
    // Execute result verification hooks first
    const verificationResult = await this._executeResultVerificationHooks(fileId, {
      file: this.stateManager.state.files.get(fileId)
    });
    if (!verificationResult.isValid) {
      return {
        exists: true,
        isValid: false,
        message: verificationResult.error || 'Result verification failed'
      };
    }

    const processedFile = await this.storage.getProcessedFile(fileId);
    
    if (!processedFile || !processedFile.exists) {
      return {
        exists: false,
        isValid: false,
        message: 'Result file not found'
      };
    }

    if (processedFile.size === 0) {
      return {
        exists: true,
        isValid: false,
        message: 'Empty result file'
      };
    }

    // Validate the result with storage
    const validationResult = await this.storage.validateResults(fileId);
    if (!validationResult.isValid) {
      return {
        exists: true,
        isValid: false,
        message: validationResult.error || 'Result validation failed'
      };
    }

    return {
      exists: true,
      isValid: true,
      message: 'Result file valid'
    };
  }

  /**
   * Clean up temporary processing states
   * @param {string} fileId File identifier
   * @returns {Promise<void>}
   */
  async cleanupTemporaryStates(fileId) {
    const completion = await this.verifyFileCompletion(fileId);
    if (completion.isComplete) {
      // Cleanup first
      await this.storage.cleanupTempFiles(fileId);
      // Then execute post-cleanup hooks
      await this._executePostCleanupHooks(fileId, { completion });
    }
  }
}

module.exports = { CompletionVerifier }; 