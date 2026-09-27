/**
 * Controls progress polling and UI updates
 */
export class ProgressController {
  /**
   * @param {ProgressBarUI} progressBar Progress bar UI component
   * @param {ProgressClient} progressClient Client for API calls
   */
  constructor(progressBar, progressClient) {
    this.progressBar = progressBar;
    this.client = progressClient;
    this.pollInterval = null;
    this.isPolling = false;
    this.cleanupHooks = new Set();
    this.isComplete = false;
    this.completionTimestamp = null;
    this.finalizingTimestamp = null;
    this.lastProgress = 0;
    console.log('[ProgressController] Initialized with:', {
      isPolling: this.isPolling,
      cleanupHooks: this.cleanupHooks.size,
      isComplete: this.isComplete
    });
  }

  /**
   * Add a cleanup hook to run before redirect
   * @param {Function} hook Cleanup function to run
   */
  addCleanupHook(hook) {
    this.cleanupHooks.add(hook);
    console.log('[ProgressController] Added cleanup hook, total hooks:', this.cleanupHooks.size);
  }

  /**
   * Remove a cleanup hook
   * @param {Function} hook Cleanup function to remove
   */
  removeCleanupHook(hook) {
    this.cleanupHooks.delete(hook);
    console.log('[ProgressController] Removed cleanup hook, remaining hooks:', this.cleanupHooks.size);
  }

  /**
   * Start polling for progress updates
   */
  startPolling() {
    if (this.isPolling) {
      console.log('[ProgressController] Already polling, ignoring start request');
      return;
    }
    
    console.log('[ProgressController] Starting progress polling');
    this.isPolling = true;
    this.pollProgress();
    
    // Poll every 2 seconds
    this.pollInterval = setInterval(async () => {
      await this.pollProgress();
    }, 2000);
  }

  /**
   * Stop polling for progress updates
   */
  stopPolling() {
    console.log('[ProgressController] Stopping progress polling');
    this.isPolling = false;
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  /**
   * Run cleanup hooks
   * @private
   */
  async _runCleanup() {
    console.log('[ProgressController] Running cleanup hooks:', this.cleanupHooks.size);
    // Run all cleanup hooks
    for (const hook of this.cleanupHooks) {
      try {
        await hook();
      } catch (error) {
        console.error('[ProgressController] Cleanup hook failed:', error);
      }
    }
    
    console.log('[ProgressController] Cleanup complete, stopping polling');
    // Stop polling after cleanup
    this.stopPolling();
  }

  /**
   * Handle a progress update
   * @param {Object} progressData Progress data from API
   */
  async handleProgress(progressData) {
    console.log('[ProgressController] Handling progress update:', progressData);
    
    // If we're at 100% and in finalizing state, we should continue checking completion
    // even if we get a 304 response
    if (!progressData && this.lastProgress === 100 && this.finalizingTimestamp) {
      const timeInFinalizing = Date.now() - this.finalizingTimestamp;
      console.log('[ProgressController] At 100% with 304 response, time in finalizing:', timeInFinalizing);
      if (timeInFinalizing >= 5000) {
        console.log('[ProgressController] Finalizing timeout reached during 304, verifying completion');
        await this._verifyAndComplete();
      }
      return;
    } else if (!progressData) {
      console.log('[ProgressController] No progress data (likely 304), skipping update');
      return;
    }

    // Check for errors - but don't stop processing if we have errors
    // Errors like empty sheets should still allow completion
    if (progressData.errors && progressData.errors.length > 0) {
      console.warn('[ProgressController] Errors detected, but continuing processing:', progressData.errors);
      // Show errors in UI but don't stop polling - let normal completion logic handle it
    }

    const currentProgress = progressData.progress;
    console.log('[ProgressController] Current progress:', {
      progress: currentProgress,
      state: progressData.state,
      lastProgress: this.lastProgress,
      isComplete: this.isComplete,
      finalizingTime: this.finalizingTimestamp ? Date.now() - this.finalizingTimestamp : null
    });
    
    // Validate progress transitions
    if (currentProgress < this.lastProgress) {
      console.warn('[ProgressController] Progress decreased from', this.lastProgress, 'to', currentProgress);
      // Don't update UI for backwards progress
      return;
    }

    // Update progress bar with current phase
    // If converting, show more detailed conversion message
    let statusMessage = progressData.state;
    if (progressData.state === 'converting' && progressData.conversion) {
      console.log('[ProgressController] Converting PDFs:', progressData.conversion);
      statusMessage = `Converting PDF ${progressData.conversion.completed + 1} of ${progressData.conversion.total}`;
    }
    this.progressBar.updateProgress(currentProgress, statusMessage);

    // Handle state transitions
    if (progressData.state === 'complete') {
      console.log('[ProgressController] Complete state detected');
      if (!this.isComplete) {
        console.log('[ProgressController] First time reaching complete state, initiating completion sequence');
        this.isComplete = true;
        this.progressBar.showComplete();
        // Add a small delay before running cleanup
        console.log('[ProgressController] Scheduling cleanup in 1 second');
        setTimeout(() => this._runCleanup(), 1000);
      }
    } else if (progressData.state === 'converting') {
      // Don't trigger completion logic when converting
      console.log('[ProgressController] PDF conversion in progress, skipping completion checks');
      return;
    } else if (currentProgress === 100) {
      // We're at 100% but state isn't complete yet
      // This can happen when all files are processed (including errors) but state hasn't updated
      console.log('[ProgressController] At 100% but not complete state, checking for completion');
      if (!this.finalizingTimestamp) {
        this.finalizingTimestamp = Date.now();
        console.log('[ProgressController] Started finalizing timer');
      }
      
      // If we've been at 100% for more than 2 seconds (reduced from 5), verify completion
      const timeInFinalizing = Date.now() - this.finalizingTimestamp;
      console.log('[ProgressController] Time in finalizing:', timeInFinalizing);
      
      if (timeInFinalizing >= 2000) {
        console.log('[ProgressController] Finalizing timeout reached, verifying completion');
        await this._verifyAndComplete();
      }
    } else if (currentProgress < 100) {
      // Reset timestamps when progress goes back
      if (this.finalizingTimestamp || this.completionTimestamp) {
        console.log('[ProgressController] Progress < 100%, resetting timestamps');
        this.finalizingTimestamp = null;
        this.completionTimestamp = null;
        this.isComplete = false;
      }
    }

    // Store last progress for comparison
    this.lastProgress = currentProgress;
  }

  /**
   * Verify completion and run cleanup if verified
   * @private
   */
  async _verifyAndComplete() {
    console.log('[ProgressController] Verifying completion');
    try {
      const isComplete = await this.client.verifyCompletion();
      console.log('[ProgressController] Completion verification result:', isComplete);
      
      if (isComplete) {
        // If we weren't complete before, set completion timestamp
        if (!this.isComplete) {
          console.log('[ProgressController] First time completion verified');
          this.isComplete = true;
          this.completionTimestamp = Date.now();
          // Update UI to show complete state
          this.progressBar.showComplete();
        }
        
        // If we've been complete for more than 2 seconds, run cleanup
        const timeComplete = Date.now() - this.completionTimestamp;
        console.log('[ProgressController] Time since completion:', timeComplete);
        if (timeComplete >= 2000) {
          console.log('[ProgressController] Completion delay elapsed, running cleanup');
          await this._runCleanup();
        }
      }
    } catch (error) {
      console.error('[ProgressController] Failed to verify completion:', error);
      this.progressBar.showError();
      this.stopPolling();
    }
  }

  /**
   * Poll the progress endpoint
   */
  async pollProgress() {
    if (!this.isPolling) {
      console.log('[ProgressController] Polling stopped, skipping poll');
      return;
    }
    
    console.log('[ProgressController] Polling progress');
    try {
      const progressData = await this.client.getProgress();
      await this.handleProgress(progressData);
    } catch (error) {
      console.error('[ProgressController] Failed to poll progress:', error);
      this.progressBar.showError();
      this.stopPolling();
    }
  }
} 