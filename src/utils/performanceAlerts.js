/**
 * Performance monitoring alerts and threshold management
 */

const logger = require('./logger');

class PerformanceAlerts {
  constructor() {
    this.thresholds = {
      // Response time thresholds (milliseconds)
      responseTime: {
        warning: 10000,  // 10 seconds
        critical: 30000, // 30 seconds
        severe: 60000    // 60 seconds
      },
      
      // Success rate thresholds (percentage)
      successRate: {
        warning: 95,   // Below 95%
        critical: 90,  // Below 90%
        severe: 80     // Below 80%
      },
      
      // Memory usage thresholds (bytes)
      memoryDelta: {
        warning: 10 * 1024 * 1024,   // 10MB
        critical: 50 * 1024 * 1024,  // 50MB
        severe: 100 * 1024 * 1024    // 100MB
      }
    };
    
    this.alertHistory = [];
    this.maxAlertHistory = 100;
    this.alertCooldown = 5 * 60 * 1000; // 5 minutes between similar alerts
    this.lastAlerts = new Map();
  }

  /**
   * Check performance metrics against thresholds and trigger alerts
   * @param {Object} metric - Performance metric to check
   */
  checkMetric(metric) {
    const alerts = [];
    
    // Check response time
    const responseTimeAlert = this.checkResponseTime(metric);
    if (responseTimeAlert) alerts.push(responseTimeAlert);
    
    // Check success rate (for provider/model combination)
    const successRateAlert = this.checkSuccessRate(metric);
    if (successRateAlert) alerts.push(successRateAlert);
    
    // Check memory usage
    const memoryAlert = this.checkMemoryUsage(metric);
    if (memoryAlert) alerts.push(memoryAlert);
    
    // Process alerts
    alerts.forEach(alert => this.triggerAlert(alert));
    
    return alerts;
  }

  /**
   * Check response time against thresholds
   * @param {Object} metric - Performance metric
   * @returns {Object|null} Alert object or null
   */
  checkResponseTime(metric) {
    if (metric.status !== 'success') return null;
    
    const responseTime = metric.responseTime;
    const { warning, critical, severe } = this.thresholds.responseTime;
    
    let severity = null;
    if (responseTime >= severe) severity = 'severe';
    else if (responseTime >= critical) severity = 'critical';
    else if (responseTime >= warning) severity = 'warning';
    
    if (severity) {
      return {
        type: 'response_time',
        severity,
        message: `High response time: ${Math.round(responseTime/1000)}s for ${metric.provider}/${metric.model}`,
        value: responseTime,
        threshold: this.thresholds.responseTime[severity],
        metric,
        timestamp: new Date().toISOString()
      };
    }
    
    return null;
  }

  /**
   * Check success rate for provider/model combination
   * @param {Object} metric - Performance metric
   * @returns {Object|null} Alert object or null
   */
  checkSuccessRate(metric) {
    // This would need access to aggregated stats
    // For now, just check individual failures
    if (metric.status === 'error') {
      return {
        type: 'api_failure',
        severity: 'critical',
        message: `API failure for ${metric.provider}/${metric.model}: ${metric.error}`,
        metric,
        timestamp: new Date().toISOString()
      };
    }
    
    return null;
  }

  /**
   * Check memory usage against thresholds
   * @param {Object} metric - Performance metric
   * @returns {Object|null} Alert object or null
   */
  checkMemoryUsage(metric) {
    if (!metric.memoryDelta || metric.memoryDelta < 0) return null;
    
    const memoryDelta = Math.abs(metric.memoryDelta);
    const { warning, critical, severe } = this.thresholds.memoryDelta;
    
    let severity = null;
    if (memoryDelta >= severe) severity = 'severe';
    else if (memoryDelta >= critical) severity = 'critical';
    else if (memoryDelta >= warning) severity = 'warning';
    
    if (severity) {
      return {
        type: 'memory_usage',
        severity,
        message: `High memory usage: ${Math.round(memoryDelta/1024/1024)}MB for ${metric.provider}/${metric.model}`,
        value: memoryDelta,
        threshold: this.thresholds.memoryDelta[severity],
        metric,
        timestamp: new Date().toISOString()
      };
    }
    
    return null;
  }

  /**
   * Trigger an alert (log, store, notify)
   * @param {Object} alert - Alert object
   */
  triggerAlert(alert) {
    const alertKey = `${alert.type}_${alert.severity}_${alert.metric.provider}_${alert.metric.model}`;
    const now = Date.now();
    const lastAlert = this.lastAlerts.get(alertKey);
    
    // Check cooldown period
    if (lastAlert && (now - lastAlert) < this.alertCooldown) {
      return; // Skip duplicate alerts within cooldown period
    }
    
    // Update last alert time
    this.lastAlerts.set(alertKey, now);
    
    // Log the alert
    const logLevel = (alert.severity === 'severe' || alert.severity === 'critical') ? 'error' : 'warn';
    
    logger[logLevel](`[PERF ALERT] ${alert.severity.toUpperCase()}: ${alert.message}`, {
      type: alert.type,
      severity: alert.severity,
      provider: alert.metric.provider,
      model: alert.metric.model,
      trackingId: alert.metric.trackingId
    });
    
    // Store in alert history
    this.alertHistory.push(alert);
    if (this.alertHistory.length > this.maxAlertHistory) {
      this.alertHistory.shift();
    }
    
    // Track alert metrics
    logger.trackMetrics('performance_alerts', {
      type: alert.type,
      severity: alert.severity,
      provider: alert.metric.provider,
      model: alert.metric.model,
      message: alert.message,
      value: alert.value,
      threshold: alert.threshold
    });
  }

  /**
   * Get recent alerts
   * @param {number} limit - Number of recent alerts to return
   * @returns {Array} Recent alerts
   */
  getRecentAlerts(limit = 20) {
    return this.alertHistory.slice(-limit);
  }

  /**
   * Get alert statistics
   * @returns {Object} Alert statistics
   */
  getAlertStats() {
    const stats = {
      total: this.alertHistory.length,
      bySeverity: {},
      byType: {},
      byProvider: {},
      recent24h: 0
    };
    
    const last24h = Date.now() - (24 * 60 * 60 * 1000);
    
    this.alertHistory.forEach(alert => {
      // Count by severity
      stats.bySeverity[alert.severity] = (stats.bySeverity[alert.severity] || 0) + 1;
      
      // Count by type
      stats.byType[alert.type] = (stats.byType[alert.type] || 0) + 1;
      
      // Count by provider
      const provider = alert.metric.provider;
      stats.byProvider[provider] = (stats.byProvider[provider] || 0) + 1;
      
      // Count recent alerts
      if (new Date(alert.timestamp).getTime() > last24h) {
        stats.recent24h++;
      }
    });
    
    return stats;
  }

  /**
   * Update alert thresholds
   * @param {Object} newThresholds - New threshold configuration
   */
  updateThresholds(newThresholds) {
    this.thresholds = { ...this.thresholds, ...newThresholds };
    logger.info('[PERF ALERTS] Thresholds updated', this.thresholds);
  }

  /**
   * Clear alert history
   */
  clearAlertHistory() {
    this.alertHistory = [];
    this.lastAlerts.clear();
    logger.info('[PERF ALERTS] Alert history cleared');
  }

  /**
   * Get current thresholds
   * @returns {Object} Current thresholds
   */
  getThresholds() {
    return { ...this.thresholds };
  }
}

module.exports = PerformanceAlerts;
