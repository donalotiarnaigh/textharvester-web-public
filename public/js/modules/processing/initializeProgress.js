import { ProgressBarUI } from './ProgressBarUI.js';
import { ProgressClient } from './ProgressClient.js';
import { ProgressController } from './ProgressController.js';

/**
 * Initializes the progress bar system
 * @returns {ProgressController} The initialized progress controller
 */
export function initializeProgress() {
  const progressBar = new ProgressBarUI('progress-container');
  const progressClient = new ProgressClient();
  const progressController = new ProgressController(progressBar, progressClient);
    
  return progressController;
}

/**
 * Sets up event listeners and initializes progress tracking
 */
export function setupProgressTracking() {
  const progressController = initializeProgress();
    
  // Listen for processing start event
  document.addEventListener('processing:start', () => {
    progressController.startPolling();
  });
    
  // Listen for manual stop/cancel
  document.addEventListener('processing:stop', () => {
    progressController.stopPolling();
  });
}

// Initialize on page load
if (typeof window !== 'undefined') {
  window.addEventListener('load', setupProgressTracking);
} 