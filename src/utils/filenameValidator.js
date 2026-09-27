/**
 * @fileoverview FilenameValidator utility for mobile upload filenames
 *
 * Parses filenames in the format: [site_code]-[number].[ext]
 * Example: "cork-0001.jpg" -> { valid: true, siteCode: "cork", number: "0001" }
 *
 * Requirements:
 * - 1.2: Parse valid filenames to extract site_code
 * - 3.4: Handle invalid filenames based on strict mode settings
 */

// Valid image extensions (case-insensitive)
const VALID_EXTENSIONS = ['jpg', 'jpeg', 'png'];

// Regex for strict mode: exactly one hyphen separating site_code and number
// site_code: alphanumeric lowercase (a-z0-9)
// number: digits only
const STRICT_PATTERN = /^([a-z0-9]+)-(\d+)\.([a-zA-Z]+)$/i;

// Regex for non-strict mode: last hyphen-separated segment is the number
// Allows multi-hyphen site codes like "site-code-001.jpg"
const RELAXED_PATTERN = /^(.+)-(\d+)\.([a-zA-Z]+)$/i;

/**
 * Validates a mobile upload filename and extracts components
 *
 * @param {string} filename - The filename to validate (e.g., "cork-0001.jpg")
 * @param {Object} options - Validation options
 * @param {boolean} [options.strict=true] - If true, rejects multi-hyphen filenames
 * @returns {Object} Validation result
 * @returns {boolean} .valid - Whether the filename is valid
 * @returns {string} [.siteCode] - The extracted site code (if valid)
 * @returns {string} [.number] - The extracted number (if valid)
 * @returns {string} [.extension] - The normalized extension (if valid)
 * @returns {string} [.error] - Error message (if invalid)
 * @throws {Error} If filename is null, undefined, or empty string
 */
function validateFilename(filename, options = {}) {
  const { strict = true } = options;

  // Throw for null/undefined/empty
  if (filename === null || filename === undefined) {
    throw new Error('Filename is required');
  }
  if (typeof filename !== 'string' || filename.trim() === '') {
    throw new Error('Filename must be a non-empty string');
  }

  // Choose pattern based on strict mode
  const pattern = strict ? STRICT_PATTERN : RELAXED_PATTERN;
  const match = filename.match(pattern);

  if (!match) {
    // Determine specific error
    if (!filename.includes('-')) {
      return {
        valid: false,
        error: 'Invalid format: missing separator hyphen'
      };
    }
    if (!filename.includes('.')) {
      return {
        valid: false,
        error: 'Invalid format: missing file extension'
      };
    }
    if (strict && (filename.match(/-/g) || []).length > 1) {
      return {
        valid: false,
        error: 'Invalid format: multiple hyphens not allowed in strict mode'
      };
    }
    // Check if number part is invalid
    const parts = filename.split('.');
    const baseName = parts[0];
    const lastHyphenIdx = baseName.lastIndexOf('-');
    if (lastHyphenIdx !== -1) {
      const numberPart = baseName.substring(lastHyphenIdx + 1);
      if (!/^\d+$/.test(numberPart)) {
        return {
          valid: false,
          error: 'Invalid format: number portion must be numeric'
        };
      }
    }
    return {
      valid: false,
      error: 'Invalid filename format'
    };
  }

  const [, siteCode, number, ext] = match;
  const normalizedExt = ext.toLowerCase();

  // Validate extension
  if (!VALID_EXTENSIONS.includes(normalizedExt)) {
    return {
      valid: false,
      error: `Invalid extension: must be one of ${VALID_EXTENSIONS.join(', ')}`
    };
  }

  return {
    valid: true,
    siteCode: siteCode.toLowerCase(),
    number,
    extension: normalizedExt
  };
}

/**
 * Convenience function to extract just the site code from a filename
 *
 * @param {string} filename - The filename to parse
 * @returns {string|null} The site code, or null if invalid
 * @throws {Error} If filename is null or undefined
 */
function extractSiteCode(filename) {
  if (filename === null || filename === undefined) {
    throw new Error('Filename is required');
  }

  const result = validateFilename(filename, { strict: false });
  return result.valid ? result.siteCode : null;
}

module.exports = {
  validateFilename,
  extractSiteCode,
  VALID_EXTENSIONS
};
