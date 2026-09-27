const logger = require('./logger');
const { isFatalError } = require('./errorTypes');

/**
 * Classify an error to determine retry strategy.
 * @param {Error} error
 * @returns {'auth_error' | 'quota_error' | 'rate_limit' | 'timeout' | 'parse_error' | 'unknown'}
 */
function classifyError(error) {
  // Check for authentication errors (401/403)
  if (error.status === 401 || error.status === 403) {
    return 'auth_error';
  }
  if (error.message && (error.message.toLowerCase().includes('authentication') || error.message.toLowerCase().includes('unauthorized'))) {
    return 'auth_error';
  }

  // Check for quota/billing errors (402)
  if (error.status === 402) {
    return 'quota_error';
  }
  if (error.message && (error.message.toLowerCase().includes('quota') || error.message.toLowerCase().includes('billing'))) {
    return 'quota_error';
  }

  // Check for rate limit errors
  if (error.status === 429 || (error.message && error.message.toLowerCase().includes('rate limit'))) {
    return 'rate_limit';
  }

  // Check for timeout errors
  if (error.message && (error.message.toLowerCase().includes('timeout') || error.message.includes('ETIMEDOUT'))) {
    return 'timeout';
  }

  // Check for parse errors
  if (error.message && (error.message.includes('JSON') || error.message.toLowerCase().includes('parse'))) {
    return 'parse_error';
  }

  return 'unknown';
}

/**
 * Calculate delay in ms for a given error type and attempt number.
 * @param {string} errorType - from classifyError
 * @param {number} attempt - 1-based attempt number
 * @param {Object} options
 * @returns {number}
 */
function getDelay(errorType, attempt, options) {
  const { baseDelay = 1000, maxDelay = 10000, jitterMs = 1000 } = options;

  switch (errorType) {
  case 'rate_limit': {
    const exp = Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
    return exp + Math.floor(Math.random() * jitterMs);
  }
  case 'timeout':
    return 500;
  case 'parse_error':
    return 500;
  default: {
    return Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay);
  }
  }
}

/**
 * Generic async retry wrapper with error-type-aware backoff.
 * @param {Function} fn - async function to retry
 * @param {Object} [options]
 * @param {number} [options.maxRetries=3]
 * @param {number} [options.baseDelay=1000]
 * @param {number} [options.maxDelay=10000]
 * @param {number} [options.jitterMs=1000]
 * @param {Function} [options.onRetry] - called with (error, attempt) before each retry
 * @returns {Promise<*>}
 */
async function withRetry(fn, options = {}) {
  const { maxRetries = 3, onRetry } = options;

  let lastError;
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;

      // Short-circuit on fatal errors — do not retry
      if (isFatalError(error)) {
        logger.info(`Fatal error encountered: ${error.message}, skipping retries`);
        throw error;
      }

      if (attempt > maxRetries) {
        break;
      }

      const errorType = classifyError(error);
      const delay = getDelay(errorType, attempt, options);

      if (onRetry) {
        onRetry(error, attempt);
      }

      logger.info(`Retry ${attempt}/${maxRetries} after ${errorType} error, waiting ${delay}ms`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

module.exports = { classifyError, withRetry, getDelay };
