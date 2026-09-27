/**
 * Performance tracking utility for monitoring API calls and system performance
 */

const logger = require('./logger');
const PerformanceAlerts = require('./performanceAlerts');

class PerformanceTracker {
  constructor() {
    this.metrics = new Map();
    this.recentMetrics = [];
    this.maxRecentMetrics = 50; // Reduced from 100 to limit memory usage
    this.alerts = new PerformanceAlerts();
    
    // Auto-cleanup configuration
    this.cleanupInterval = null;
    this.dataRetentionHours = 12; // Reduced from 24 hours to 12 hours
    this.startAutoCleanup();
    
    // Sampling configuration
    this.samplingConfig = {
      enabled: true,
      successLogRate: 0.1, // Log 10% of successful calls
      errorLogRate: 1.0, // Log all errors
      metricsTrackingRate: 1.0 // Track all metrics but sample logging
    };
  }

  /**
   * Track an API call with timing and memory usage
   * @param {string} provider - The AI provider (openai, anthropic)
   * @param {string} model - The model name (gpt-5.1, claude-4-sonnet-20250514)
   * @param {string} operation - The operation type (processImage, etc)
   * @param {Function} fn - The async function to execute and track
   * @param {Object} metadata - Additional metadata to track
   * @returns {Promise} The result of the function execution
   */
  static async trackAPICall(provider, model, operation, fn, metadata = {}) {
    const startTime = Date.now();
    const startMemory = process.memoryUsage();
    const trackingId = `${provider}-${model}-${Date.now()}`;

    // Sample logging for API call start
    const instance = PerformanceTracker.getInstance();
    if (instance._shouldLogOperation('start')) {
      logger.info(`[PERF] Starting ${operation} with ${provider}/${model} (ID: ${trackingId})`);
    }

    try {
      const result = await fn();
      const endTime = Date.now();
      const endMemory = process.memoryUsage();
      const responseTime = endTime - startTime;
      const memoryDelta = endMemory.heapUsed - startMemory.heapUsed;

      const performanceData = {
        trackingId,
        provider,
        model,
        operation,
        responseTime,
        memoryDelta,
        memoryUsage: {
          start: startMemory,
          end: endMemory
        },
        status: 'success',
        timestamp: new Date().toISOString(),
        metadata
      };

      // Sample logging for successful operations
      if (instance._shouldLogOperation('success')) {
        logger.info(`[PERF] ${operation} completed successfully`, {
          provider,
          model,
          responseTime: `${responseTime}ms`,
          memoryDelta: `${Math.round(memoryDelta / 1024 / 1024 * 100) / 100}MB`,
          trackingId
        });
      }

      // Always track metrics (sampling handled in logger.trackMetrics)
      logger.trackMetrics('api_performance', performanceData);

      // Store in singleton instance for real-time access
      instance.addMetric(performanceData);
      
      // Check for performance alerts
      instance.alerts.checkMetric(performanceData);

      return result;
    } catch (error) {
      const endTime = Date.now();
      const responseTime = endTime - startTime;

      const performanceData = {
        trackingId,
        provider,
        model,
        operation,
        responseTime,
        status: 'error',
        error: error.message,
        errorType: error.constructor.name,
        timestamp: new Date().toISOString(),
        metadata
      };

      // Always log errors (no sampling for errors)
      logger.error(`[PERF] ${operation} failed`, {
        provider,
        model,
        responseTime: `${responseTime}ms`,
        error: error.message,
        trackingId
      });

      // Track failed metrics
      logger.trackMetrics('api_performance', performanceData);
      instance.addMetric(performanceData);
      
      // Check for performance alerts on failures too
      instance.alerts.checkMetric(performanceData);

      throw error;
    }
  }

  /**
   * Get singleton instance
   */
  static getInstance() {
    if (!PerformanceTracker.instance) {
      PerformanceTracker.instance = new PerformanceTracker();
    }
    return PerformanceTracker.instance;
  }

  /**
   * Add a metric to the tracking system
   * @param {Object} metric - The performance metric to add
   */
  addMetric(metric) {
    // Add to recent metrics (sliding window) - now with smaller limit
    this.recentMetrics.push(metric);
    if (this.recentMetrics.length > this.maxRecentMetrics) {
      this.recentMetrics.shift();
    }

    // Update aggregated metrics by provider/model
    const key = `${metric.provider}-${metric.model}`;
    if (!this.metrics.has(key)) {
      this.metrics.set(key, {
        provider: metric.provider,
        model: metric.model,
        totalCalls: 0,
        successfulCalls: 0,
        failedCalls: 0,
        totalResponseTime: 0,
        minResponseTime: Infinity,
        maxResponseTime: 0,
        averageResponseTime: 0,
        totalMemoryDelta: 0,
        lastCall: null,
        recentErrors: []
      });
    }

    const stats = this.metrics.get(key);
    stats.totalCalls++;
    stats.lastCall = metric.timestamp;

    if (metric.status === 'success') {
      stats.successfulCalls++;
      stats.totalResponseTime += metric.responseTime;
      stats.minResponseTime = Math.min(stats.minResponseTime, metric.responseTime);
      stats.maxResponseTime = Math.max(stats.maxResponseTime, metric.responseTime);
      stats.averageResponseTime = stats.totalResponseTime / stats.successfulCalls;
      
      if (metric.memoryDelta) {
        stats.totalMemoryDelta += metric.memoryDelta;
      }
    } else {
      stats.failedCalls++;
      stats.recentErrors.push({
        error: metric.error,
        timestamp: metric.timestamp,
        responseTime: metric.responseTime
      });
      
      // Keep only last 5 errors (reduced from 10)
      if (stats.recentErrors.length > 5) {
        stats.recentErrors.shift();
      }
    }
  }

  /**
   * Get current performance statistics
   * @param {string} provider - Optional provider filter
   * @param {string} model - Optional model filter
   * @returns {Object} Performance statistics
   */
  getStats(provider = null, model = null) {
    const stats = {};
    
    for (const [key, data] of this.metrics.entries()) {
      if (provider && data.provider !== provider) continue;
      if (model && data.model !== model) continue;
      
      stats[key] = {
        ...data,
        successRate: data.totalCalls > 0 ? (data.successfulCalls / data.totalCalls) * 100 : 0,
        averageMemoryDelta: data.successfulCalls > 0 ? data.totalMemoryDelta / data.successfulCalls : 0
      };
    }

    return stats;
  }

  /**
   * Get recent metrics (last N calls)
   * @param {number} limit - Number of recent metrics to return
   * @returns {Array} Recent metrics
   */
  getRecentMetrics(limit = 20) {
    return this.recentMetrics.slice(-limit);
  }

  /**
   * Generate a performance summary report
   * @returns {Object} Performance summary
   */
  generateSummary() {
    const stats = this.getStats();
    const summary = {
      totalProviders: new Set(Object.values(stats).map(s => s.provider)).size,
      totalModels: Object.keys(stats).length,
      totalCalls: Object.values(stats).reduce((sum, s) => sum + s.totalCalls, 0),
      totalSuccessful: Object.values(stats).reduce((sum, s) => sum + s.successfulCalls, 0),
      totalFailed: Object.values(stats).reduce((sum, s) => sum + s.failedCalls, 0),
      overallSuccessRate: 0,
      providerComparison: {},
      modelComparison: {}
    };

    if (summary.totalCalls > 0) {
      summary.overallSuccessRate = (summary.totalSuccessful / summary.totalCalls) * 100;
    }

    // Provider comparison
    const providers = {};
    for (const stat of Object.values(stats)) {
      if (!providers[stat.provider]) {
        providers[stat.provider] = {
          totalCalls: 0,
          successfulCalls: 0,
          totalResponseTime: 0,
          models: []
        };
      }
      providers[stat.provider].totalCalls += stat.totalCalls;
      providers[stat.provider].successfulCalls += stat.successfulCalls;
      providers[stat.provider].totalResponseTime += stat.totalResponseTime;
      providers[stat.provider].models.push({
        model: stat.model,
        averageResponseTime: stat.averageResponseTime,
        successRate: stat.successRate
      });
    }

    for (const [provider, data] of Object.entries(providers)) {
      summary.providerComparison[provider] = {
        averageResponseTime: data.successfulCalls > 0 ? data.totalResponseTime / data.successfulCalls : 0,
        successRate: data.totalCalls > 0 ? (data.successfulCalls / data.totalCalls) * 100 : 0,
        totalCalls: data.totalCalls,
        models: data.models
      };
    }

    // Model comparison
    summary.modelComparison = Object.fromEntries(
      Object.entries(stats).map(([key, stat]) => [
        key,
        {
          provider: stat.provider,
          model: stat.model,
          averageResponseTime: stat.averageResponseTime,
          successRate: stat.successRate,
          totalCalls: stat.totalCalls,
          minResponseTime: stat.minResponseTime === Infinity ? 0 : stat.minResponseTime,
          maxResponseTime: stat.maxResponseTime
        }
      ])
    );

    return summary;
  }

  /**
   * Get recent alerts
   * @param {number} limit - Number of alerts to return
   * @returns {Array} Recent alerts
   */
  getRecentAlerts(limit = 20) {
    return this.alerts.getRecentAlerts(limit);
  }

  /**
   * Get alert statistics
   * @returns {Object} Alert statistics
   */
  getAlertStats() {
    return this.alerts.getAlertStats();
  }

  /**
   * Update alert thresholds
   * @param {Object} thresholds - New thresholds
   */
  updateAlertThresholds(thresholds) {
    this.alerts.updateThresholds(thresholds);
  }

  /**
   * Get current alert thresholds
   * @returns {Object} Current thresholds
   */
  getAlertThresholds() {
    return this.alerts.getThresholds();
  }

  /**
   * Start automatic cleanup of old performance data
   */
  startAutoCleanup() {
    // Clean up every hour
    this.cleanupInterval = setInterval(() => {
      this.cleanupOldMetrics();
    }, 60 * 60 * 1000); // 1 hour
    
    logger.info(`[PERF] Auto-cleanup started. Data retention: ${this.dataRetentionHours} hours`);
  }

  /**
   * Stop automatic cleanup
   */
  stopAutoCleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      logger.info('[PERF] Auto-cleanup stopped');
    }
  }

  /**
   * Clean up old performance metrics
   */
  cleanupOldMetrics() {
    const cutoffTime = Date.now() - (this.dataRetentionHours * 60 * 60 * 1000);
    let totalRemoved = 0;
    
    // Clean up recent metrics
    const originalRecentCount = this.recentMetrics.length;
    this.recentMetrics = this.recentMetrics.filter(metric => {
      return new Date(metric.timestamp).getTime() > cutoffTime;
    });
    const recentRemoved = originalRecentCount - this.recentMetrics.length;
    totalRemoved += recentRemoved;
    
    // Clean up aggregated metrics (reset counters for very old data)
    for (const [key, stats] of this.metrics.entries()) {
      if (stats.lastCall && new Date(stats.lastCall).getTime() < cutoffTime) {
        // If no recent activity, reset the stats but keep the key
        this.metrics.set(key, {
          provider: stats.provider,
          model: stats.model,
          totalCalls: 0,
          successfulCalls: 0,
          failedCalls: 0,
          totalResponseTime: 0,
          minResponseTime: Infinity,
          maxResponseTime: 0,
          averageResponseTime: 0,
          totalMemoryDelta: 0,
          lastCall: null,
          recentErrors: []
        });
      }
    }
    
    // Clean up logger metrics (delegate to logger if it has cleanup)
    if (logger.metrics && logger.metrics.api_performance) {
      const originalLoggerCount = logger.metrics.api_performance.length;
      logger.metrics.api_performance = logger.metrics.api_performance.filter(metric => {
        return new Date(metric.timestamp).getTime() > cutoffTime;
      });
      const loggerRemoved = originalLoggerCount - logger.metrics.api_performance.length;
      totalRemoved += loggerRemoved;
    }
    
    if (totalRemoved > 0) {
      logger.info(`[PERF] Cleanup completed: removed ${totalRemoved} old metrics (older than ${this.dataRetentionHours}h)`);
    }
  }

  /**
   * Get cleanup status and configuration
   * @returns {Object} Cleanup status
   */
  getCleanupStatus() {
    return {
      enabled: this.cleanupInterval !== null,
      retentionHours: this.dataRetentionHours,
      nextCleanup: this.cleanupInterval ? 
        new Date(Date.now() + 60 * 60 * 1000).toISOString() : null,
      currentMetricsCount: this.recentMetrics.length,
      maxMetricsCount: this.maxRecentMetrics
    };
  }

  /**
   * Update cleanup configuration
   * @param {Object} config - Cleanup configuration
   */
  updateCleanupConfig(config) {
    if (config.retentionHours && config.retentionHours > 0) {
      this.dataRetentionHours = config.retentionHours;
      logger.info(`[PERF] Data retention updated to ${this.dataRetentionHours} hours`);
    }
    
    if (config.maxRecentMetrics && config.maxRecentMetrics > 0) {
      this.maxRecentMetrics = config.maxRecentMetrics;
      
      // Trim current metrics if needed
      if (this.recentMetrics.length > this.maxRecentMetrics) {
        this.recentMetrics = this.recentMetrics.slice(-this.maxRecentMetrics);
      }
      
      logger.info(`[PERF] Max recent metrics updated to ${this.maxRecentMetrics}`);
    }
    
    if (config.enabled !== undefined) {
      if (config.enabled && !this.cleanupInterval) {
        this.startAutoCleanup();
      } else if (!config.enabled && this.cleanupInterval) {
        this.stopAutoCleanup();
      }
    }
  }

  /**
   * Update sampling configuration
   * @param {Object} config - Sampling configuration
   */
  updateSamplingConfig(config) {
    this.samplingConfig = { ...this.samplingConfig, ...config };
    logger.info('[PERF] Sampling configuration updated', this.samplingConfig);
  }

  /**
   * Get current sampling configuration
   * @returns {Object} Current sampling configuration
   */
  getSamplingConfig() {
    return { ...this.samplingConfig };
  }

  /**
   * Determine if we should log this operation based on sampling
   * @private
   * @param {string} type - Operation type ('start', 'success', 'error')
   * @returns {boolean}
   */
  _shouldLogOperation(type) {
    if (!this.samplingConfig.enabled) return true;
    
    if (type === 'error') {
      return Math.random() < this.samplingConfig.errorLogRate;
    }
    
    if (type === 'success' || type === 'start') {
      return Math.random() < this.samplingConfig.successLogRate;
    }
    
    return true;
  }

  /**
   * Clear all metrics (useful for testing)
   */
  clearMetrics() {
    this.metrics.clear();
    this.recentMetrics = [];
    this.alerts.clearAlertHistory();
    logger.info('[PERF] All metrics cleared manually');
  }

  /**
   * Destroy the performance tracker (cleanup intervals)
   */
  destroy() {
    this.stopAutoCleanup();
    if (this.alerts && typeof this.alerts.destroy === 'function') {
      this.alerts.destroy();
    }
  }
}

module.exports = PerformanceTracker;
