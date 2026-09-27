/**
 * Output formatter for CLI.
 * Handles JSON, Table, and CSV output formats.
 */

const fs = require('fs');

/**
 * Format and print output to stdout.
 * @param {any} data - The data to output
 * @param {string} command - Valid command name
 * @param {Object} [options] - Options (format, etc.)
 */
function formatOutput(data, command, options = {}) {
  const format = options.format || 'json';

  if (format === 'json') {
    const response = {
      success: true,
      partial: false, // simplified for now
      data: data,
      metadata: {
        command: command,
        timestamp: new Date().toISOString()
      }
    };

    try {
      const jsonString = JSON.stringify(response, null, 2);

      // Use fs.writeSync to file descriptor 1 (stdout)
      // This bypasses Node.js stream buffering and writes directly to the OS pipe
      // Essential for large JSON payloads in CLI pipelines
      if (process.stdout.isTTY) {
        process.stdout.write(jsonString + '\n');
      } else {
        const buffer = Buffer.from(jsonString + '\n');
        let offset = 0;
        while (offset < buffer.length) {
          const written = fs.writeSync(1, buffer, offset, buffer.length - offset);
          offset += written;
        }
      }
    } catch (err) {
      // Fallback for circular refs or other stringify errors
      console.log(JSON.stringify({
        success: false,
        error_code: 'OUTPUT_GENERATION_ERROR',
        message: 'Could not serialize output to JSON',
        details: { error: err.message }
      }));
    }
  } else if (format === 'table') {
    console.log(formatTable(data));
  } else if (format === 'csv') {
    console.log(formatCsv(data));
  } else {
    // Fallback to JSON for unknown formats
    console.log(JSON.stringify({ data }, null, 2));
  }
}

/**
 * Format and print error to stderr.
 * @param {Error|Object} error - Error object
 */
function formatError(error) {
  const output = {
    success: false,
    error_code: error.code || 'INTERNAL_ERROR',
    message: error.message || 'An unknown error occurred',
    details: error.details || {},
    metadata: {
      timestamp: new Date().toISOString()
    }
  };

  console.error(JSON.stringify(output, null, 2));
}

/**
 * Simple Table Formatter
 * @param {Array<Object>} data 
 * @returns {string}
 */
function formatTable(data) {
  if (!Array.isArray(data) || data.length === 0) return 'No data';

  // Get all unique keys
  const keys = Array.from(new Set(data.flatMap(Object.keys)));

  // Calculate widths
  const widths = {};
  keys.forEach(key => {
    widths[key] = key.length;
    data.forEach(row => {
      const val = String(row[key] || '');
      if (val.length > widths[key]) widths[key] = val.length;
    });
  });

  // Create header
  const header = keys.map(k => k.padEnd(widths[k])).join(' | ');
  const separator = keys.map(k => '-'.repeat(widths[k])).join('-|-');

  // Create rows
  const rows = data.map(row => {
    return keys.map(k => String(row[k] || '').padEnd(widths[k])).join(' | ');
  });

  return [header, separator, ...rows].join('\n');
}

/**
 * Simple CSV Formatter
 * @param {Array<Object>} data 
 * @returns {string}
 */
function formatCsv(data) {
  if (!Array.isArray(data) || data.length === 0) return '';

  const keys = Array.from(new Set(data.flatMap(Object.keys)));

  const header = keys.join(',');
  const rows = data.map(row => {
    return keys.map(k => {
      let val = String(row[k] || '');
      // Escape quotes and wrap in quotes if contains comma or quote
      if (val.includes(',') || val.includes('"') || val.includes('\n')) {
        val = `"${val.replace(/"/g, '""')}"`;
      }
      return val;
    }).join(',');
  });

  return [header, ...rows].join('\n');
}

module.exports = {
  formatOutput,
  formatError,
};
