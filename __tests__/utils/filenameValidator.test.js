/**
 * @fileoverview Tests for FilenameValidator utility
 *
 * This utility parses mobile upload filenames in the format:
 * [site_code]-[number].[ext] (e.g., "cork-0001.jpg")
 *
 * Requirements covered:
 * - 1.2: Valid filename format parses site_code correctly
 * - 3.4: Invalid filenames handled based on strict mode
 */

const {
  validateFilename,
  extractSiteCode
} = require('../../src/utils/filenameValidator');

describe('FilenameValidator', () => {
  describe('validateFilename', () => {
    describe('Happy Path', () => {
      test('should validate "cork-0001.jpg" and extract site_code "cork"', () => {
        const result = validateFilename('cork-0001.jpg');

        expect(result.valid).toBe(true);
        expect(result.siteCode).toBe('cork');
        expect(result.number).toBe('0001');
        expect(result.extension).toBe('jpg');
      });

      test('should validate "kilm-1234.jpeg" with jpeg extension', () => {
        const result = validateFilename('kilm-1234.jpeg');

        expect(result.valid).toBe(true);
        expect(result.siteCode).toBe('kilm');
        expect(result.number).toBe('1234');
        expect(result.extension).toBe('jpeg');
      });

      test('should handle case-insensitive extensions "test-0001.JPG"', () => {
        const result = validateFilename('test-0001.JPG');

        expect(result.valid).toBe(true);
        expect(result.siteCode).toBe('test');
        expect(result.extension).toBe('jpg'); // normalized to lowercase
      });

      test('should validate png extension "abbey-0042.png"', () => {
        const result = validateFilename('abbey-0042.png');

        expect(result.valid).toBe(true);
        expect(result.siteCode).toBe('abbey');
        expect(result.number).toBe('0042');
        expect(result.extension).toBe('png');
      });

      test('should handle alphanumeric site codes "site123-0001.jpg"', () => {
        const result = validateFilename('site123-0001.jpg');

        expect(result.valid).toBe(true);
        expect(result.siteCode).toBe('site123');
      });
    });

    describe('Unhappy Path', () => {
      test('should reject "image.jpg" - missing parts', () => {
        const result = validateFilename('image.jpg');

        expect(result.valid).toBe(false);
        expect(result.error).toMatch(/invalid|missing/i);
      });

      test('should reject "cork0001.jpg" - missing separator', () => {
        const result = validateFilename('cork0001.jpg');

        expect(result.valid).toBe(false);
        expect(result.error).toMatch(/invalid|separator/i);
      });

      test('should throw error for empty string', () => {
        expect(() => validateFilename('')).toThrow();
      });

      test('should throw error for null input', () => {
        expect(() => validateFilename(null)).toThrow();
      });

      test('should throw error for undefined input', () => {
        expect(() => validateFilename(undefined)).toThrow();
      });

      test('should reject invalid extension "cork-0001.txt"', () => {
        const result = validateFilename('cork-0001.txt');

        expect(result.valid).toBe(false);
        expect(result.error).toMatch(/extension|invalid/i);
      });

      test('should reject non-numeric number part "cork-abc.jpg"', () => {
        const result = validateFilename('cork-abc.jpg');

        expect(result.valid).toBe(false);
        expect(result.error).toMatch(/number|invalid/i);
      });
    });

    describe('Strict Mode', () => {
      test('should reject multi-hyphen filename in strict mode "site-code-001.jpg"', () => {
        const result = validateFilename('site-code-001.jpg', { strict: true });

        expect(result.valid).toBe(false);
        expect(result.error).toMatch(/hyphen|format/i);
      });

      test('should allow multi-hyphen filename when strict mode is off', () => {
        // In non-strict mode, take the last segment as number, rest as site_code
        const result = validateFilename('site-code-001.jpg', { strict: false });

        expect(result.valid).toBe(true);
        expect(result.siteCode).toBe('site-code');
        expect(result.number).toBe('001');
      });

      test('strict mode should be enabled by default', () => {
        const result = validateFilename('site-code-001.jpg');

        expect(result.valid).toBe(false);
      });
    });
  });

  describe('extractSiteCode', () => {
    test('should extract site code from valid filename', () => {
      const siteCode = extractSiteCode('cork-0001.jpg');
      expect(siteCode).toBe('cork');
    });

    test('should return null for invalid filename', () => {
      const siteCode = extractSiteCode('image.jpg');
      expect(siteCode).toBeNull();
    });

    test('should throw for null/undefined input', () => {
      expect(() => extractSiteCode(null)).toThrow();
      expect(() => extractSiteCode(undefined)).toThrow();
    });
  });
});
