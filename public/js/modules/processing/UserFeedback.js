/**
 * Handles collection and tracking of user feedback and processing metrics
 */
const logger = require('../../../src/utils/logger');

class UserFeedback {
  constructor() {
    this.interactions = [];
    this.processingTimes = new Map();
    this.startTimes = new Map();
    this.userActions = [];
  }

  /**
   * Track the start of file processing
   * @param {string} fileId File identifier
   */
  trackProcessingStart(fileId) {
    this.startTimes.set(fileId, Date.now());
    logger.debug(`Started processing file: ${fileId}`);
  }

  /**
   * Track the completion of file processing
   * @param {string} fileId File identifier
   * @param {boolean} success Whether processing was successful
   * @param {Object} metrics Additional metrics
   */
  trackProcessingComplete(fileId, success, metrics = {}) {
    const startTime = this.startTimes.get(fileId);
    if (startTime) {
      const duration = Date.now() - startTime;
      this.processingTimes.set(fileId, duration);
      
      logger.trackMetrics({
        processingTime: duration,
        success,
        ...metrics
      });
      
      this.startTimes.delete(fileId);
    }
  }

  /**
   * Track user interaction with the progress system
   * @param {string} action The action performed
   * @param {Object} details Additional details about the action
   */
  trackUserAction(action, details = {}) {
    const interaction = {
      action,
      timestamp: Date.now(),
      ...details
    };
    
    this.userActions.push(interaction);
    logger.debug('User action tracked', interaction);
  }

  /**
   * Get processing statistics
   * @returns {Object} Processing statistics
   */
  getProcessingStats() {
    const times = Array.from(this.processingTimes.values());
    const avgTime = times.length > 0
      ? times.reduce((a, b) => a + b, 0) / times.length
      : 0;
    
    return {
      averageProcessingTime: avgTime,
      totalFiles: this.processingTimes.size,
      userInteractions: this.userActions.length
    };
  }

  /**
   * Get user interaction patterns
   * @returns {Object} User interaction patterns
   */
  getUserPatterns() {
    const patterns = this.userActions.reduce((acc, action) => {
      const key = action.action;
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    
    return {
      totalInteractions: this.userActions.length,
      patterns
    };
  }

  /**
   * Clear tracking data
   */
  clear() {
    this.interactions = [];
    this.processingTimes.clear();
    this.startTimes.clear();
    this.userActions = [];
  }
}

// Export singleton instance
module.exports = new UserFeedback(); 