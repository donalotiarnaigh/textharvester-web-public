/**
 * @jest-environment jsdom
 */

import {
  calculateSummaryStats,
  getUniqueSections,
  filterMemorials
} from '../resultsLogic.js';

describe('Results Logic', () => {
  const mockMemorials = [
    {
      id: 1,
      section: 'A',
      grave_number: '101',
      grave_list: {
        interments: [{ name: 'John Doe' }, { name: 'Jane Doe' }]
      }
    },
    {
      id: 2,
      section: 'A',
      grave_number: '102',
      grave_list: {
        interments: [] // Vacant
      }
    },
    {
      id: 3,
      section: 'B',
      grave_number: '50',
      grave_list: {
        interments: [{ name: 'Smith' }]
      }
    },
    // Grave card style structure
    {
      id: 4,
      source_type: 'grave_record_card',
      data_json: {
        card_metadata: {
          location_section: 'C',
          grave_number: '99',
          grave_full_id: 'C-99'
        },
        interments: [{ name: 'Jones' }]
      }
    }
  ];

  describe('calculateSummaryStats', () => {
    it('should calculate correct totals for mixed memorial types', () => {
      const stats = calculateSummaryStats(mockMemorials);
      expect(stats).toEqual({
        totalCards: 4,
        totalInterments: 4, // 2 + 0 + 1 + 1
        occupied: 3,
        vacant: 1
      });
    });

    it('should handle empty array', () => {
      const stats = calculateSummaryStats([]);
      expect(stats).toEqual({
        totalCards: 0,
        totalInterments: 0,
        occupied: 0,
        vacant: 0
      });
    });

    it('should treat null interments as distinct from empty array', () => {
      const incompleteMemorial = [{ id: 5, grave_list: null }];
      // Assuming effectively vacant/0 interments if data missing
      const stats = calculateSummaryStats(incompleteMemorial);
      expect(stats.totalInterments).toBe(0);
    });
  });

  describe('getUniqueSections', () => {
    it('should return sorted unique sections', () => {
      const sections = getUniqueSections(mockMemorials);
      expect(sections).toEqual(['A', 'B', 'C']);
    });

    it('should handle null/undefined sections gracefully', () => {
      const mixed = [
        { section: 'A' },
        { section: null },
        { source_type: 'grave_record_card', data_json: { card_metadata: { location_section: 'B' } } },
        {}
      ];
      const sections = getUniqueSections(mixed);
      expect(sections).toEqual(['A', 'B']);
    });
  });

  describe('filterMemorials', () => {
    it('should filter by section', () => {
      const results = filterMemorials(mockMemorials, { section: 'A' });
      expect(results.length).toBe(2);
      expect(results[0].id).toBe(1);
      expect(results[1].id).toBe(2);
    });

    it('should filter by grave number (partial match)', () => {
      const results = filterMemorials(mockMemorials, { graveNumber: '0' });
      // Should match '101', '102', '50'
      expect(results.length).toBe(3);
    });

    it('should filter by both section and grave number', () => {
      const results = filterMemorials(mockMemorials, { section: 'A', graveNumber: '101' });
      expect(results.length).toBe(1);
      expect(results[0].id).toBe(1);
    });

    it('should return all if no filters provided', () => {
      const results = filterMemorials(mockMemorials, {});
      expect(results.length).toBe(4);
    });

    it('should handle case insensitivity', () => {
      const results = filterMemorials(mockMemorials, { section: 'a' });
      expect(results.length).toBe(2);
    });
  });
});
