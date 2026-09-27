 
// ProgressBarUI.js

/**
 * UI component for displaying processing progress
 */
export class ProgressBarUI {
  constructor(containerId) {
    const container = document.getElementById(containerId);
    if (!container) {
      throw new Error('Progress bar container not found');
    }

    // Create progress bar elements
    this.progressBar = container.querySelector('.progress-bar') || this._createProgressBar();
    this.progressBarFill = container.querySelector('.progress-bar__fill') || this._createProgressBarFill();
    this.statusElement = container.querySelector('.progress-bar__status') || this._createStatusElement();

    // Add elements to container if they don't exist
    if (!container.querySelector('.progress-bar')) {
      container.appendChild(this.progressBar);
      this.progressBar.appendChild(this.progressBarFill);
      container.appendChild(this.statusElement);
    }

    // Initialize state
    this.updateProgress(0, 'Ready to start processing...');
  }

  /**
   * Update progress bar
   * @param {number} progress Progress percentage (0-100)
   * @param {string} phase Current processing phase
   */
  updateProgress(progress, phase) {
    // Ensure progress is between 0 and 100
    const clampedProgress = Math.min(Math.max(progress, 0), 100);
    this.progressBarFill.style.width = `${clampedProgress}%`;
    this.progressBarFill.textContent = `${clampedProgress}%`;
    this.statusElement.textContent = phase;

    // Update ARIA attributes
    this.progressBar.setAttribute('aria-valuenow', clampedProgress);
  }

  /**
   * Show error state
   */
  showError() {
    this.progressBar.classList.remove('complete');
    this.progressBar.classList.add('error');
    this.statusElement.textContent = 'Error processing files';
  }

  /**
   * Show completion state
   */
  showComplete() {
    this.progressBar.classList.remove('error');
    this.progressBar.classList.add('complete');
    this.updateProgress(100, 'Processing complete');
  }

  /**
   * Create progress bar element
   * @private
   */
  _createProgressBar() {
    const progressBar = document.createElement('div');
    progressBar.className = 'progress-bar';
    progressBar.setAttribute('role', 'progressbar');
    progressBar.setAttribute('aria-valuemin', '0');
    progressBar.setAttribute('aria-valuemax', '100');
    progressBar.setAttribute('aria-valuenow', '0');
    return progressBar;
  }

  /**
   * Create progress bar fill element
   * @private
   */
  _createProgressBarFill() {
    const fill = document.createElement('div');
    fill.className = 'progress-bar__fill';
    return fill;
  }

  /**
   * Create status element
   * @private
   */
  _createStatusElement() {
    const status = document.createElement('div');
    status.className = 'progress-bar__status';
    return status;
  }
} 