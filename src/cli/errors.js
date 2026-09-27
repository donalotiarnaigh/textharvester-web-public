/**
 * Custom Error class for CLI operations.
 */
class CLIError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.code = code;
    this.details = details || {};
    this.timestamp = new Date().toISOString();
  }

  toJSON() {
    return {
      success: false,
      error_code: this.code,
      message: this.message,
      details: this.details,
      metadata: {
        timestamp: this.timestamp
      }
    };
  }
}

module.exports = { CLIError };
