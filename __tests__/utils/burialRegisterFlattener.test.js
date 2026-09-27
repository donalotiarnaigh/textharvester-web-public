const {
  flattenPageToEntries,
  generateEntryId
} = require('../../src/utils/burialRegisterFlattener');

describe('burialRegisterFlattener', () => {
  const metadata = {
    provider: 'openai',
    model: 'gpt-5.1-mini',
    filePath: '/tmp/page_002.png'
  };

  const samplePage = {
    volume_id: 'vol1',
    page_number: 2,
    parish_header_raw: 'St Luke',
    county_header_raw: 'Devon',
    year_header_raw: '1820',
    entries: [
      {
        row_index_on_page: 1,
        entry_no_raw: '10',
        name_raw: 'John Doe',
        abode_raw: 'Exeter'
      },
      {
        row_index_on_page: 2,
        entry_no_raw: '11',
        name_raw: 'Jane Smith',
        abode_raw: 'Plymouth'
      },
      {
        row_index_on_page: 3,
        entry_no_raw: '12',
        name_raw: 'Sam Lee',
        abode_raw: 'Torbay'
      }
    ]
  };

  describe('flattenPageToEntries', () => {
    it('flattens page data into flat entries with metadata', () => {
      const entries = flattenPageToEntries(samplePage, metadata);

      expect(entries).toHaveLength(3);

      entries.forEach((entry, index) => {
        const expectedRowIndex = index + 1;
        const expectedId = generateEntryId(samplePage.volume_id, samplePage.page_number, expectedRowIndex);

        expect(entry.entry_id).toBe(expectedId);
        expect(entry.row_index_on_page).toBe(expectedRowIndex);
        expect(entry.volume_id).toBe(samplePage.volume_id);
        expect(entry.page_number).toBe(samplePage.page_number);
        expect(entry.parish_header_raw).toBe(samplePage.parish_header_raw);
        expect(entry.county_header_raw).toBe(samplePage.county_header_raw);
        expect(entry.year_header_raw).toBe(samplePage.year_header_raw);
        expect(entry.provider).toBe(metadata.provider);
        expect(entry.model).toBe(metadata.model);
        expect(entry.filePath).toBe(metadata.filePath);
      });
    });

    it('returns an empty array when entries array is empty or missing', () => {
      expect(flattenPageToEntries({ ...samplePage, entries: [] }, metadata)).toEqual([]);
      expect(flattenPageToEntries({ volume_id: 'vol1', page_number: 5 }, metadata)).toEqual([]);
    });

    it('handles missing header metadata by setting values to null', () => {
      const pageWithoutHeaders = {
        volume_id: 'vol2',
        page_number: 7,
        entries: [
          {
            name_raw: 'No Header Name'
          }
        ]
      };

      const [entry] = flattenPageToEntries(pageWithoutHeaders, metadata);

      expect(entry.entry_id).toBe(generateEntryId('vol2', 7, 1));
      expect(entry.parish_header_raw).toBeNull();
      expect(entry.county_header_raw).toBeNull();
      expect(entry.year_header_raw).toBeNull();
    });
  });
});
