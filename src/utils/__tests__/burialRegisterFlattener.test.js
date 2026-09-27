const { flattenPageToEntries, generateEntryId, injectPageMetadata } = require('../burialRegisterFlattener');

// Mock logger to suppress output during tests
jest.mock('../logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  error: jest.fn()
}));

describe('burialRegisterFlattener', () => {
  describe('generateEntryId', () => {
    test('formats entry ID correctly', () => {
      const id = generateEntryId('vol1', 1, 1);
      expect(id).toBe('vol1_p001_r001');
    });

    test('pads page and row numbers with zeros', () => {
      const id = generateEntryId('vol1', 10, 5);
      expect(id).toBe('vol1_p010_r005');
    });

    test('uses pageNumberForId if provided', () => {
      // AI saw page 5, but filename says page 10. ID should use 10.
      const id = generateEntryId('vol1', 5, 1, 10);
      expect(id).toBe('vol1_p010_r001');
    });

    test('handles string inputs gracefully', () => {
      const id = generateEntryId('vol1', '5', '1');
      expect(id).toBe('vol1_p005_r001');
    });
  });

  describe('injectPageMetadata', () => {
    test('injects metadata correctly', () => {
      const entry = { name_raw: 'John' };
      const pageData = {
        volume_id: 'vol1',
        page_number: 5,
        parish_header_raw: 'St Luke',
        county_header_raw: 'Cork',
        year_header_raw: '1850'
      };
      const metadata = { provider: 'gpt', model: 'gpt-4' };

      const result = injectPageMetadata(entry, pageData, metadata);

      expect(result).toEqual({
        name_raw: 'John',
        volume_id: 'vol1',
        page_number: 5,
        parish_header_raw: 'St Luke',
        county_header_raw: 'Cork',
        year_header_raw: '1850',
        provider: 'gpt',
        model: 'gpt-4',
        filePath: null
      });
    });

    test('overrides page_number if pageNumberForId is provided', () => {
      const entry = { name_raw: 'John' };
      const pageData = { volume_id: 'vol1', page_number: 5 }; // AI thought page 5
      const metadata = {};
      const pageNumberForId = 10; // Filename says page 10

      const result = injectPageMetadata(entry, pageData, metadata, pageNumberForId);

      expect(result.page_number).toBe(10);
    });

    test('handles missing optional fields', () => {
      const entry = { name_raw: 'John' };
      const pageData = { volume_id: 'vol1', page_number: 5 };
      const result = injectPageMetadata(entry, pageData);

      expect(result.parish_header_raw).toBeNull();
      expect(result.provider).toBeNull();
    });
  });

  describe('flattenPageToEntries', () => {
    test('flattens valid page data', () => {
      const pageData = {
        volume_id: 'vol1',
        page_number: 1,
        entries: [
          { row_index_on_page: 1, name_raw: 'Entry 1' },
          { row_index_on_page: 2, name_raw: 'Entry 2' }
        ]
      };

      const results = flattenPageToEntries(pageData);

      expect(results).toHaveLength(2);
      expect(results[0].entry_id).toBe('vol1_p001_r001');
      expect(results[1].entry_id).toBe('vol1_p001_r002');
      expect(results[0].volume_id).toBe('vol1');
    });

    test('uses array index fallback if row_index_on_page is missing/invalid', () => {
      const pageData = {
        volume_id: 'vol1',
        page_number: 1,
        entries: [
          { name_raw: 'Entry 1' }, // Missing row index
          { row_index_on_page: 'invalid', name_raw: 'Entry 2' } // Invalid
        ]
      };

      const results = flattenPageToEntries(pageData);

      expect(results[0].row_index_on_page).toBe(1); // Index 0 + 1
      expect(results[1].row_index_on_page).toBe(2); // Index 1 + 1
    });

    test('uses pageNumberForId for all entries if provided', () => {
      const pageData = {
        volume_id: 'vol1',
        page_number: 50, // AI saw 50
        entries: [{ row_index_on_page: 1 }]
      };

      const results = flattenPageToEntries(pageData, {}, 55); // File says 55

      // entry_id should use 55
      expect(results[0].entry_id).toBe('vol1_p055_r001');
      // page_number field should be 55
      expect(results[0].page_number).toBe(55);
    });

    test('returns empty array and logs if no entries', () => {
      const pageData = { volume_id: 'vol1', page_number: 1, entries: [] };
      const results = flattenPageToEntries(pageData);
      expect(results).toEqual([]);
    });

    test('throws error if pageData is invalid', () => {
      expect(() => flattenPageToEntries(null)).toThrow();
      expect(() => flattenPageToEntries('invalid')).toThrow();
    });
  });
});
