/**
 * JSON extraction utility using a balanced-brace scanner.
 * Correctly handles nested objects and braces inside string literals.
 */

/**
 * Extract the first complete top-level JSON object from a string.
 * Uses a balanced-brace scanner that correctly handles:
 * - Nested objects
 * - Braces inside JSON string literals
 * - Escaped characters inside strings
 *
 * @param {string} text - The text to scan
 * @returns {string|null} The first complete JSON object as a string, or null if not found
 */
function extractFirstJsonObject(text) {
  if (!text || typeof text !== 'string') {
    return null;
  }

  let start = -1;
  let depth = 0;
  let inString = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inString) {
      // Handle escape sequences inside strings
      if (ch === '\\') {
        i++; // Skip the next character (it's escaped)
        continue;
      }
      // Check for end of string
      if (ch === '"') {
        inString = false;
      }
      continue;
    }

    // Outside a string literal
    if (ch === '"') {
      inString = true;
      continue;
    }

    // Track brace depth
    if (ch === '{') {
      if (depth === 0) {
        start = i; // Mark the start of a potential object
      }
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && start !== -1) {
        // Found a complete top-level object
        return text.substring(start, i + 1);
      }
    }
  }

  // No complete top-level object found
  return null;
}

module.exports = { extractFirstJsonObject };
