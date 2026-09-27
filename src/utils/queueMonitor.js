/**
 * Queue monitoring and throughput tracking
 */

const logger = require('./logger');

class QueueMonitor {
  constructor() {
    this.queueMetrics = {
      totalEnqueued: 0,
      totalProcessed: 0,
      totalFailed: 0,
      currentQueueSize: 0,
      peakQueueSize: 0,
      averageProcessingTime: 0,
      throughputPerHour: 0,
      throughputPerMinute: 0,
      lastProcessedTimestamp: null,
      startTime: Date.now()
    };
    
    this.processingTimes = [];
    this.maxProcessingTimes = 100; // Keep last 100 processing times
    this.queueSizeHistory = [];
    this.maxQueueHistory = 1000; // Keep last 1000 queue size measurements
    this.throughputHistory = [];
    this.maxThroughputHistory = 100; // Keep last 100 throughput measurements
    
    // Start periodic monitoring
    this.monitoringInterval = setInterval(() => {
      this.recordPeriodicMetrics();
    }, 60000); // Every minute
  }

  /**
   * Record when a file is enqueued
   * @param {number} queueSize - Current queue size
   */
  recordEnqueue(queueSize) {
    this.queueMetrics.totalEnqueued++;
    this.queueMetrics.currentQueueSize = queueSize;
    this.queueMetrics.peakQueueSize = Math.max(this.queueMetrics.peakQueueSize, queueSize);
    
    // Record queue size history
    this.queueSizeHistory.push({
      size: queueSize,
      timestamp: Date.now(),
      type: 'enqueue'
    });
    
    if (this.queueSizeHistory.length > this.maxQueueHistory) {
      this.queueSizeHistory.shift();
    }
    
    logger.info(`[QUEUE] File enqueued. Queue size: ${queueSize}, Peak: ${this.queueMetrics.peakQueueSize}`);
  }

  /**
   * Record when a file processing starts
   * @param {string} filePath - File being processed
   * @param {number} queueSize - Current queue size
   */
  recordProcessingStart(filePath, queueSize) {
    this.queueMetrics.currentQueueSize = queueSize;
    
    this.queueSizeHistory.push({
      size: queueSize,
      timestamp: Date.now(),
      type: 'processing_start',
      file: filePath
    });
    
    if (this.queueSizeHistory.length > this.maxQueueHistory) {
      this.queueSizeHistory.shift();
    }
    
    logger.info(`[QUEUE] Processing started: ${filePath}. Queue size: ${queueSize}`);
  }

  /**
   * Record when a file processing completes
   * @param {string} filePath - File that was processed
   * @param {number} processingTime - Time taken to process (milliseconds)
   * @param {boolean} success - Whether processing was successful
   * @param {number} queueSize - Current queue size
   */
  recordProcessingComplete(filePath, processingTime, success, queueSize) {
    if (success) {
      this.queueMetrics.totalProcessed++;
    } else {
      this.queueMetrics.totalFailed++;
    }
    
    this.queueMetrics.currentQueueSize = queueSize;
    this.queueMetrics.lastProcessedTimestamp = Date.now();
    
    // Record processing time
    this.processingTimes.push({
      time: processingTime,
      success,
      timestamp: this.queueMetrics.lastProcessedTimestamp,
      file: filePath
    });
    
    if (this.processingTimes.length > this.maxProcessingTimes) {
      this.processingTimes.shift();
    }
    
    // Update average processing time
    const successfulTimes = this.processingTimes
      .filter(p => p.success)
      .map(p => p.time);
    
    if (successfulTimes.length > 0) {
      this.queueMetrics.averageProcessingTime = 
        successfulTimes.reduce((a, b) => a + b, 0) / successfulTimes.length;
    }
    
    // Record queue size after processing
    this.queueSizeHistory.push({
      size: queueSize,
      timestamp: this.queueMetrics.lastProcessedTimestamp,
      type: 'processing_complete',
      file: filePath,
      success,
      processingTime
    });
    
    if (this.queueSizeHistory.length > this.maxQueueHistory) {
      this.queueSizeHistory.shift();
    }
    
    // Calculate throughput
    this.calculateThroughput();
    
    logger.info(`[QUEUE] Processing ${success ? 'completed' : 'failed'}: ${filePath}. Time: ${Math.round(processingTime/1000)}s, Queue size: ${queueSize}`);
  }

  /**
   * Calculate current throughput metrics
   */
  calculateThroughput() {
    const now = Date.now();
    const oneHourAgo = now - (60 * 60 * 1000);
    const oneMinuteAgo = now - (60 * 1000);
    
    // Calculate files processed in last hour
    const recentProcessing = this.processingTimes.filter(p => 
      p.success && p.timestamp > oneHourAgo
    );
    
    this.queueMetrics.throughputPerHour = recentProcessing.length;
    
    // Calculate files processed in last minute
    const lastMinuteProcessing = this.processingTimes.filter(p => 
      p.success && p.timestamp > oneMinuteAgo
    );
    
    this.queueMetrics.throughputPerMinute = lastMinuteProcessing.length;
    
    // Record throughput history
    this.throughputHistory.push({
      timestamp: now,
      perHour: this.queueMetrics.throughputPerHour,
      perMinute: this.queueMetrics.throughputPerMinute,
      queueSize: this.queueMetrics.currentQueueSize
    });
    
    if (this.throughputHistory.length > this.maxThroughputHistory) {
      this.throughputHistory.shift();
    }
  }

  /**
   * Record periodic metrics (called every minute)
   */
  recordPeriodicMetrics() {
    this.calculateThroughput();
    
    // Track queue metrics for analytics
    logger.trackMetrics('queue_performance', {
      currentQueueSize: this.queueMetrics.currentQueueSize,
      throughputPerHour: this.queueMetrics.throughputPerHour,
      throughputPerMinute: this.queueMetrics.throughputPerMinute,
      averageProcessingTime: this.queueMetrics.averageProcessingTime,
      totalProcessed: this.queueMetrics.totalProcessed,
      totalFailed: this.queueMetrics.totalFailed
    });
  }

  /**
   * Get current queue metrics
   * @returns {Object} Current queue metrics
   */
  getMetrics() {
    // Calculate success rate
    const totalAttempts = this.queueMetrics.totalProcessed + this.queueMetrics.totalFailed;
    const successRate = totalAttempts > 0 ? 
      (this.queueMetrics.totalProcessed / totalAttempts) * 100 : 0;
    
    // Calculate uptime
    const uptimeMs = Date.now() - this.queueMetrics.startTime;
    const uptimeHours = uptimeMs / (1000 * 60 * 60);
    
    return {
      ...this.queueMetrics,
      successRate,
      uptimeMs,
      uptimeHours,
      totalAttempts
    };
  }

  /**
   * Get queue size history
   * @param {number} limit - Number of history entries to return
   * @returns {Array} Queue size history
   */
  getQueueHistory(limit = 100) {
    return this.queueSizeHistory.slice(-limit);
  }

  /**
   * Get throughput history
   * @param {number} limit - Number of throughput entries to return
   * @returns {Array} Throughput history
   */
  getThroughputHistory(limit = 50) {
    return this.throughputHistory.slice(-limit);
  }

  /**
   * Get processing time statistics
   * @returns {Object} Processing time statistics
   */
  getProcessingTimeStats() {
    const successfulTimes = this.processingTimes
      .filter(p => p.success)
      .map(p => p.time);
    
    if (successfulTimes.length === 0) {
      return {
        count: 0,
        average: 0,
        min: 0,
        max: 0,
        median: 0
      };
    }
    
    const sorted = [...successfulTimes].sort((a, b) => a - b);
    const median = sorted.length % 2 === 0
      ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : sorted[Math.floor(sorted.length / 2)];
    
    return {
      count: successfulTimes.length,
      average: successfulTimes.reduce((a, b) => a + b, 0) / successfulTimes.length,
      min: Math.min(...successfulTimes),
      max: Math.max(...successfulTimes),
      median
    };
  }

  /**
   * Get queue performance summary
   * @returns {Object} Performance summary
   */
  getPerformanceSummary() {
    const metrics = this.getMetrics();
    const processingStats = this.getProcessingTimeStats();
    const recentThroughput = this.throughputHistory.slice(-10);
    
    return {
      current: {
        queueSize: metrics.currentQueueSize,
        throughputPerHour: metrics.throughputPerHour,
        throughputPerMinute: metrics.throughputPerMinute,
        averageProcessingTime: Math.round(metrics.averageProcessingTime / 1000), // Convert to seconds
        successRate: Math.round(metrics.successRate * 100) / 100
      },
      totals: {
        processed: metrics.totalProcessed,
        failed: metrics.totalFailed,
        enqueued: metrics.totalEnqueued,
        attempts: metrics.totalAttempts
      },
      peaks: {
        queueSize: metrics.peakQueueSize,
        processingTime: Math.round(processingStats.max / 1000), // Convert to seconds
      },
      uptime: {
        hours: Math.round(metrics.uptimeHours * 100) / 100,
        milliseconds: metrics.uptimeMs
      },
      processingTimes: {
        ...processingStats,
        average: Math.round(processingStats.average / 1000), // Convert to seconds
        min: Math.round(processingStats.min / 1000),
        max: Math.round(processingStats.max / 1000),
        median: Math.round(processingStats.median / 1000)
      },
      recentThroughput: recentThroughput.map(t => ({
        ...t,
        timestamp: new Date(t.timestamp).toISOString()
      }))
    };
  }

  /**
   * Reset all metrics
   */
  reset() {
    this.queueMetrics = {
      totalEnqueued: 0,
      totalProcessed: 0,
      totalFailed: 0,
      currentQueueSize: 0,
      peakQueueSize: 0,
      averageProcessingTime: 0,
      throughputPerHour: 0,
      throughputPerMinute: 0,
      lastProcessedTimestamp: null,
      startTime: Date.now()
    };
    
    this.processingTimes = [];
    this.queueSizeHistory = [];
    this.throughputHistory = [];
    
    logger.info('[QUEUE] Queue metrics reset');
  }

  /**
   * Cleanup monitoring interval
   */
  destroy() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
  }
}

module.exports = QueueMonitor;
