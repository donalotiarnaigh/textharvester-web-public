/**
 * Client for tracking processing progress
 */
export class ProgressClient {
  constructor() {
    // Simplified client: no cache header management
    this.retryCount = 0;
    this.maxRetries = 3;
    this.retryDelay = 1000;
    console.log('[ProgressClient] Initialized');
  }

  /**
   * Get current processing progress
   * @returns {Promise<Object>} Progress data
   */
  async getProgress() {
    try {
      console.log('[ProgressClient] Fetching progress...');
      const response = await fetch('/processing-status', {});
      console.log('[ProgressClient] Response status:', response.status);

      // Handle 304 Not Modified
      if (response.status === 304) {
        console.log('[ProgressClient] No changes (304)');
        return null;
      }

      // Reset retry count on successful response
      this.retryCount = 0;

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      console.log('[ProgressClient] Raw server response:', data);

      const normalizedData = this._normalizeProgressData(data);
      console.log('[ProgressClient] Normalized data:', normalizedData);
      return normalizedData;
    } catch (error) {
      console.error('[ProgressClient] Progress fetch failed:', error);

      // Handle retries
      if (this.retryCount < this.maxRetries) {
        this.retryCount++;
        console.log(`[ProgressClient] Retrying (${this.retryCount}/${this.maxRetries})...`);
        await new Promise(resolve => setTimeout(resolve, this.retryDelay));
        return this.getProgress();
      }

      throw error;
    }
  }

  /**
   * Verify processing completion
   * @returns {Promise<boolean>} True if processing is complete
   */
  async verifyCompletion() {
    try {
      console.log('[ProgressClient] Verifying completion...');

      const progressData = await this.getProgress();
      console.log('[ProgressClient] Completion check response:', progressData);

      // Consider it complete if either:
      // 1. State is explicitly 'complete'
      // 2. Progress is 100% and we've been in this state for a while
      const isComplete = progressData && (
        progressData.state === 'complete' ||
        (progressData.progress === 100 && progressData.state === 'processing')
      );

      console.log('[ProgressClient] Completion verification result:', {
        isComplete,
        state: progressData?.state,
        progress: progressData?.progress
      });

      return isComplete;
    } catch (error) {
      console.error('[ProgressClient] Completion verification failed:', error);
      return false;
    }
  }

  /**
   * Get processing errors if any
   * @returns {Promise<Array>} Array of errors
   */
  async getErrors() {
    try {
      console.log('[ProgressClient] Fetching errors...');
      const progressData = await this.getProgress();
      const errors = progressData ? progressData.errors || [] : [];
      console.log('[ProgressClient] Retrieved errors:', errors);
      return errors;
    } catch (error) {
      console.error('[ProgressClient] Error fetch failed:', error);
      return [];
    }
  }

  /**
   * Normalize progress data from server
   * @private
   */
  _normalizeProgressData(data) {
    console.log('[ProgressClient] Normalizing data:', data);

    // Parse progress value and handle invalid cases
    let progressValue = 0;
    try {
      progressValue = parseFloat(data.progress || '0');
      // Cap progress at 100%
      if (progressValue > 100) {
        console.warn('[ProgressClient] Server returned progress > 100%, capping at 100:', progressValue);
        progressValue = 100;
      }
      // Ensure progress is not negative
      if (progressValue < 0) {
        console.warn('[ProgressClient] Server returned negative progress, setting to 0:', progressValue);
        progressValue = 0;
      }
    } catch {
      console.error('[ProgressClient] Failed to parse progress value:', data.progress);
      progressValue = 0;
    }

    const normalized = {
      progress: progressValue,
      state: data.status || 'idle',
      errors: data.errors || [],
      files: data.files || {},
      conversion: data.conversion || null
    };
    console.log('[ProgressClient] Normalized result:', normalized);
    return normalized;
  }
} 