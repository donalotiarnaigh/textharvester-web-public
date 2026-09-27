const {
  extractMemorialNumberFromFilename,
  generateFallbackMemorialNumber,
  getMemorialNumberForMonument
} = require('../../src/utils/filenameParser');

describe('Filename Parser', () => {
  describe('extractMemorialNumberFromFilename', () => {
    it('should return null for record sheet source type', () => {
      const result = extractMemorialNumberFromFilename('123.jpg', 'record_sheet');
      expect(result).toBeNull();
    });

    it('should extract simple numeric filenames', () => {
      const result = extractMemorialNumberFromFilename('123.jpg', 'monument_photo');
      expect(result).toBe('123');
    });

    it('should extract numbers from prefix patterns', () => {
      expect(extractMemorialNumberFromFilename('HG-456.jpg', 'monument_photo')).toBe('456');
      expect(extractMemorialNumberFromFilename('monument_789.jpg', 'monument_photo')).toBe('789');
      expect(extractMemorialNumberFromFilename('grave_001.jpg', 'monument_photo')).toBe('1'); // Leading zeros removed
    });

    it('should extract numbers from end patterns (UAT case)', () => {
      const result = extractMemorialNumberFromFilename('stja-0006_1757276988194.jpg', 'monument_photo');
      expect(result).toBe('0006'); // Zero-padding preserved for Douro format
    });

    it('should handle complex filenames with timestamps', () => {
      const result = extractMemorialNumberFromFilename('photo_999_timestamp.jpg', 'monument_photo');
      expect(result).toBe('999');
    });

    it('should return null for filenames without numbers', () => {
      const result = extractMemorialNumberFromFilename('photo.jpg', 'monument_photo');
      expect(result).toBeNull();
    });

    it('should handle single digit extraction', () => {
      const result = extractMemorialNumberFromFilename('a5b.jpg', 'monument_photo');
      expect(result).toBe('5');
    });

    it('should handle null or invalid inputs gracefully', () => {
      expect(extractMemorialNumberFromFilename(null, 'monument_photo')).toBeNull();
      expect(extractMemorialNumberFromFilename(undefined, 'monument_photo')).toBeNull();
      expect(extractMemorialNumberFromFilename('', 'monument_photo')).toBeNull();
    });
  });

  describe('generateFallbackMemorialNumber', () => {
    it('should generate consistent numbers for same filename', () => {
      const filename = 'test.jpg';
      const result1 = generateFallbackMemorialNumber(filename);
      const result2 = generateFallbackMemorialNumber(filename);
      
      expect(result1).toBe(result2);
      expect(typeof result1).toBe('string');
      expect(parseInt(result1, 10)).toBeGreaterThan(0);
      expect(parseInt(result1, 10)).toBeLessThanOrEqual(9999);
    });

    it('should generate different numbers for different filenames', () => {
      const result1 = generateFallbackMemorialNumber('file1.jpg');
      const result2 = generateFallbackMemorialNumber('file2.jpg');
      
      expect(result1).not.toBe(result2);
    });
  });

  describe('getMemorialNumberForMonument', () => {
    it('should return null for record sheet source type', () => {
      const result = getMemorialNumberForMonument('123.jpg', 'record_sheet');
      expect(result).toBeNull();
    });

    it('should extract memorial number for monument photos when available', () => {
      const result = getMemorialNumberForMonument('HG-123.jpg', 'monument_photo');
      expect(result).toBe('123');
    });

    it('should generate fallback for monument photos without extractable numbers', () => {
      const result = getMemorialNumberForMonument('photo.jpg', 'monument_photo');
      
      expect(result).not.toBeNull();
      expect(typeof result).toBe('string');
      expect(parseInt(result, 10)).toBeGreaterThan(0);
    });

    it('should handle the UAT filename correctly', () => {
      const result = getMemorialNumberForMonument('stja-0006_1757276988194.jpg', 'monument_photo');
      expect(result).toBe('0006'); // Zero-padding preserved for Douro format
    });

    it('should handle various monument filename patterns', () => {
      const testCases = [
        { filename: '123.jpg', expected: '123' },
        { filename: 'monument-456.jpg', expected: '456' },
        { filename: 'grave_789.jpg', expected: '789' },
        { filename: 'HG-001.jpg', expected: '1' }, // Leading zeros removed
        { filename: 'complex_name_999_timestamp.jpg', expected: '999' }
      ];

      testCases.forEach(({ filename, expected }) => {
        const result = getMemorialNumberForMonument(filename, 'monument_photo');
        expect(result).toBe(expected);
      });
    });

    it('should default to record_sheet behavior when source_type not specified', () => {
      const result = getMemorialNumberForMonument('123.jpg');
      expect(result).toBeNull();
    });

    it('should handle Douro format with zero-padding preservation', () => {
      const testCases = [
        { filename: 'stja-0001.jpg', expected: '0001' },
        { filename: 'stja-0006.jpg', expected: '0006' },
        { filename: 'stja-0010.jpg', expected: '0010' },
        { filename: 'stja-0100.jpg', expected: '0100' },
        { filename: 'stja-1000.jpg', expected: '1000' },
        { filename: 'stja-0138.jpg', expected: '0138' },
        { filename: 'stjb-0001.jpg', expected: '0001' },
        { filename: 'stjb-0185.jpg', expected: '0185' },
        { filename: 'stjc-0001.jpg', expected: '0001' },
        { filename: 'stjc-0173.jpg', expected: '0173' },
        { filename: 'stjd-0001.jpg', expected: '0001' },
        { filename: 'stjd-0139.jpg', expected: '0139' }
      ];

      testCases.forEach(({ filename, expected }) => {
        const result = getMemorialNumberForMonument(filename, 'monument_photo');
        expect(result).toBe(expected);
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle filenames with multiple number sequences', () => {
      const result = getMemorialNumberForMonument('section1_grave456_photo789.jpg', 'monument_photo');
      expect(result).toBe('456'); // Should pick the first significant number sequence
    });

    it('should remove leading zeros but preserve single zero', () => {
      expect(getMemorialNumberForMonument('grave-0000.jpg', 'monument_photo')).toBe('0');
      expect(getMemorialNumberForMonument('grave-0001.jpg', 'monument_photo')).toBe('1');
      expect(getMemorialNumberForMonument('grave-0123.jpg', 'monument_photo')).toBe('123');
    });

    it('should handle files without extensions', () => {
      const result = getMemorialNumberForMonument('monument123', 'monument_photo');
      expect(result).toBe('123');
    });

    it('should handle files with multiple extensions', () => {
      const result = getMemorialNumberForMonument('monument123.backup.jpg', 'monument_photo');
      expect(result).toBe('123');
    });
  });
});
