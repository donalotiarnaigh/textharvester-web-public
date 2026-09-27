/**
 * Enhanced logger module with structured error tracking and metrics
 */

const fs = require('fs');
const path = require('path');

// Default config if none provided
const defaultConfig = {
  logging: {
    errorLogFile: path.join(process.cwd(), 'logs', 'error.log'),
    combinedLogFile: path.join(process.cwd(), 'logs', 'combined.log'),
    // New configuration options for issue #41
    verboseMode: process.env.VERBOSE_LOGGING === 'true',
    quietMode: false,
    payloadTruncation: {
      enabled: true,
      maxLength: 500 // characters
    },
    samplingRate: {
      enabled: true,
      performanceMetrics: 0.1, // Sample 10% of performance metrics
      payloadLogging: 0.05 // Sample 5% of raw payload logs
    }
  }
};

// Try to load config, fall back to defaults if not found
let config;
try {
  config = require('../../config.json');
} catch (err) { // eslint-disable-line no-unused-vars
  config = defaultConfig;
}

// Merge with defaults to ensure all options are available
config.logging = { ...defaultConfig.logging, ...config.logging };

class Logger {
  constructor() {
    this.errorPatterns = new Map();
    this.metrics = {
      processingTimes: [],
      successCount: 0,
      failureCount: 0,
      totalFiles: 0
    };

    // Sampling counters for performance tracking
    this.sampleCounters = {
      performanceMetrics: 0,
      payloadLogs: 0
    };

    // Ensure log directory exists if we're not in test environment
    if (process.env.NODE_ENV !== 'test') {
      const logDir = path.dirname(config.logging?.errorLogFile || defaultConfig.logging.errorLogFile);
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
    }
  }

  info(message, ...args) {
    if (!config.logging.quietMode) {
      if (process.env.LOG_TO_STDERR === 'true') {
        console.error(`[INFO] ${message}`, ...args);
      } else {
        console.log(`[INFO] ${message}`, ...args);
      }
    }
    this._writeToLog('info', message, args);
  }

  error(message, error, context = {}) {
    console.error(`[ERROR] ${message}`, error);
    this._writeToLog('error', message, [error, context]);
    this._trackErrorPattern(error, context);
  }

  warn(message, ...args) {
    if (!config.logging.quietMode) {
      console.warn(`[WARN] ${message}`, ...args);
    }
    this._writeToLog('warn', message, args);
  }

  debug(message, ...args) {
    if (process.env.NODE_ENV === 'development' || config.logging.verboseMode) {
      console.debug(`[DEBUG] ${message}`, ...args);
      this._writeToLog('debug', message, args);
    }
  }

  /**
   * Log raw payloads at debug level with sampling and truncation
   * @param {string} message - Log message
   * @param {Object} payload - Raw payload to log
   * @param {Object} options - Logging options
   */
  debugPayload(message, payload, /* eslint-disable-line no-unused-vars */ options = {}) {
    // Only log if verbose mode is enabled or if we're sampling
    const shouldSample = this._shouldSamplePayload();

    if (!config.logging.verboseMode && !shouldSample) {
      return;
    }

    let logPayload = payload;

    // Apply truncation if enabled
    if (config.logging.payloadTruncation.enabled && !config.logging.verboseMode) {
      logPayload = this._truncatePayload(payload, config.logging.payloadTruncation.maxLength);
    }

    // Use debug level for raw payloads
    this.debug(`${message}`, logPayload);
  }

  /**
   * Track processing metrics with sampling
   * @param {string|Object} type - Metric type or legacy metrics object
   * @param {Object} data - Metric data (when type is string)
   */
  trackMetrics(type, data = null) {
    // Handle legacy format for backward compatibility
    if (typeof type === 'object' && data === null) {
      const metrics = type;
      if (metrics.processingTime) {
        this.metrics.processingTimes.push(metrics.processingTime);
        // Keep only last 1000 processing times to prevent memory issues
        if (this.metrics.processingTimes.length > 1000) {
          this.metrics.processingTimes = this.metrics.processingTimes.slice(-1000);
        }
      }
      if (metrics.success) {
        this.metrics.successCount++;
      } else {
        this.metrics.failureCount++;
      }
      this.metrics.totalFiles++;
      return;
    }

    // Handle new structured format
    if (typeof type === 'string' && data) {
      // Initialize metrics storage for this type if it doesn't exist
      if (!this.metrics[type]) {
        this.metrics[type] = [];
      }

      // Add timestamp to data
      const metricEntry = {
        ...data,
        timestamp: data.timestamp || new Date().toISOString()
      };

      this.metrics[type].push(metricEntry);

      // Keep only last 500 entries per type to prevent memory issues (reduced from 1000)
      if (this.metrics[type].length > 500) {
        this.metrics[type] = this.metrics[type].slice(-500);
      }

      // Log performance metrics with structured format and sampling
      if (type === 'api_performance') {
        const shouldSample = this._shouldSamplePerformanceMetric();

        if (shouldSample || data.status === 'error') {
          // Always log errors, sample successes
          this.info(`[METRICS] API Performance: ${data.provider}/${data.model} - ${data.responseTime}ms - ${data.status}`);
        }
      }
    }
  }

  trackMonumentCrop(success) {
    this.trackMetrics('monument_cropping', { success });
  }

  /**
   * Get current error patterns and metrics
   * @returns {Object} Error patterns and metrics
   */
  getAnalytics() {
    const avgProcessingTime = this.metrics.processingTimes.length > 0
      ? this.metrics.processingTimes.reduce((a, b) => a + b, 0) / this.metrics.processingTimes.length
      : 0;

    return {
      errorPatterns: Array.from(this.errorPatterns.entries()).map(([pattern, count]) => ({
        pattern,
        count
      })),
      metrics: {
        ...this.metrics,
        averageProcessingTime: avgProcessingTime,
        successRate: this.metrics.totalFiles > 0
          ? (this.metrics.successCount / this.metrics.totalFiles) * 100
          : 0
      },
      configuration: {
        verboseMode: config.logging.verboseMode,
        samplingRates: config.logging.samplingRate,
        truncationEnabled: config.logging.payloadTruncation.enabled
      }
    };
  }

  /**
   * Enable or disable verbose mode
   * @param {boolean} enabled - Whether to enable verbose mode
   */
  setVerboseMode(enabled) {
    config.logging.verboseMode = enabled;
    this.info(`Verbose logging ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Enable or disable quiet mode (suppress console info/warn)
   * @param {boolean} enabled - Whether to enable quiet mode
   */
  setQuietMode(enabled) {
    config.logging.quietMode = enabled;
  }

  /**
   * Update sampling rates
   * @param {Object} rates - New sampling rates
   */
  updateSamplingRates(rates) {
    config.logging.samplingRate = { ...config.logging.samplingRate, ...rates };
    this.info('Sampling rates updated', config.logging.samplingRate);
  }

  /**
   * Determine if we should sample this performance metric
   * @private
   * @returns {boolean}
   */
  _shouldSamplePerformanceMetric() {
    if (!config.logging.samplingRate.enabled) return true;

    this.sampleCounters.performanceMetrics++;
    const sampleRate = config.logging.samplingRate.performanceMetrics;
    return (this.sampleCounters.performanceMetrics % Math.ceil(1 / sampleRate)) === 0;
  }

  /**
   * Determine if we should sample this payload log
   * @private
   * @returns {boolean}
   */
  _shouldSamplePayload() {
    if (!config.logging.samplingRate.enabled) return true;

    this.sampleCounters.payloadLogs++;
    const sampleRate = config.logging.samplingRate.payloadLogging;
    return (this.sampleCounters.payloadLogs % Math.ceil(1 / sampleRate)) === 0;
  }

  /**
   * Truncate payload for logging
   * @private
   * @param {Object} payload - Payload to truncate
   * @param {number} maxLength - Maximum length
   * @returns {Object} Truncated payload
   */
  _truncatePayload(payload, maxLength) {
    const jsonStr = JSON.stringify(payload, null, 2);
    if (jsonStr.length <= maxLength) {
      return payload;
    }

    // Create truncated version
    const truncated = jsonStr.substring(0, maxLength);
    const lastBrace = truncated.lastIndexOf('{');
    const lastBracket = truncated.lastIndexOf('[');
    const cutPoint = Math.max(lastBrace, lastBracket, maxLength - 50);

    return {
      _truncated: true,
      _originalLength: jsonStr.length,
      _preview: truncated.substring(0, cutPoint) + '...[TRUNCATED]'
    };
  }

  /**
   * Write log entry to file
   * @private
   */
  _writeToLog(level, message, args) {
    // Skip file logging in test environment
    if (process.env.NODE_ENV === 'test') {
      return;
    }

    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      level,
      message,
      args
    };

    const logFile = level === 'error'
      ? (config.logging?.errorLogFile || defaultConfig.logging.errorLogFile)
      : (config.logging?.combinedLogFile || defaultConfig.logging.combinedLogFile);

    fs.appendFile(
      logFile,
      JSON.stringify(logEntry) + '\n',
      err => {
        if (err) console.error('Failed to write to log file:', err);
      }
    );
  }

  /**
   * Track error patterns for analysis
   * @private
   */
  _trackErrorPattern(error, context) {
    const pattern = this._getErrorPattern(error, context);
    const count = (this.errorPatterns.get(pattern) || 0) + 1;
    this.errorPatterns.set(pattern, count);
  }

  /**
   * Get normalized error pattern for grouping similar errors
   * @private
   */
  _getErrorPattern(error, context) {
    const errorType = error && (error.name || error.constructor.name || (typeof error === 'string' ? 'StringError' : 'UnknownError'));
    const phase = context?.phase || 'unknown';
    const operation = context?.operation || 'unknown';
    return `${errorType}:${phase}:${operation}`;
  }
}

// Export singleton instance
module.exports = new Logger();
