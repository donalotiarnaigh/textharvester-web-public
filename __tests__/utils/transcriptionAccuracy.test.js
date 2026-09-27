const fs = require('fs').promises;
const { analyzeTranscriptionAccuracy } = require('../../src/utils/transcriptionAnalysis');

// Mock fs.promises module
jest.mock('fs', () => ({
  promises: {
    readFile: jest.fn(),
    readdir: jest.fn()
  }
}));

// Mock logger to prevent console output during tests
jest.mock('../src/utils/logger', () => ({
  error: jest.fn(),
  info: jest.fn(),
  debug: jest.fn(),
  debugPayload: jest.fn()
}));

describe('Memorial Record Transcription Accuracy Tests', () => {

  beforeAll(async () => {
    // Mock baseline results data structure
    const mockBaselineData = {
      timestamp: '2025-05-19T20:20:51.898Z',
      results: [
        {
          image: 'page1.jpg',
          openai: {
            memorial_number: 123,
            first_name: 'JOHN',
            last_name: 'DOE',
            year_of_death: 1950,
            inscription: 'REST IN PEACE'
          },
          anthropic: {
            memorial_number: 123,
            first_name: 'JOHN',
            last_name: 'DOE',
            year_of_death: 1950,
            inscription: 'REST IN PEACE'
          }
        },
        {
          image: 'page2.jpg',
          openai: {
            memorial_number: 456,
            first_name: 'JANE',
            last_name: 'SMITH',
            year_of_death: 1965,
            inscription: 'BELOVED MOTHER'
          },
          anthropic: {
            memorial_number: 456,
            first_name: 'JANE',
            last_name: 'SMITH',
            year_of_death: 1965,
            inscription: 'BELOVED MOTHER'
          }
        },
        {
          image: 'page3.jpg',
          openai: {
            memorial_number: 789,
            first_name: 'ROBERT',
            last_name: 'JOHNSON',
            year_of_death: 1942,
            inscription: 'IN LOVING MEMORY'
          },
          anthropic: {
            memorial_number: 789,
            first_name: 'ROBERT',
            last_name: 'JOHNSON',
            year_of_death: 1942,
            inscription: 'IN LOVING MEMORY'
          }
        },
        {
          image: 'page4.jpg',
          openai: {
            memorial_number: 101,
            first_name: 'MARY',
            last_name: 'WILLIAMS',
            year_of_death: 1978,
            inscription: 'DEVOTED WIFE AND MOTHER'
          },
          anthropic: {
            memorial_number: 101,
            first_name: 'MARY',
            last_name: 'WILLIAMS',
            year_of_death: 1978,
            inscription: 'DEVOTED WIFE AND MOTHER'
          }
        },
        {
          image: 'page5.jpg',
          openai: {
            memorial_number: 202,
            first_name: 'JAMES',
            last_name: 'BROWN',
            year_of_death: 1983,
            inscription: 'FOREVER IN OUR HEARTS'
          },
          anthropic: {
            memorial_number: 202,
            first_name: 'JAMES',
            last_name: 'BROWN',
            year_of_death: 1983,
            inscription: 'FOREVER IN OUR HEARTS'
          }
        }
      ]
    };

    // Mock readFile for baseline data
    fs.readFile.mockImplementation((filePath) => {
      if (filePath.includes('results_all_1-5_2025-05-19T20-20-51-898Z.json')) {
        return Promise.resolve(JSON.stringify(mockBaselineData));
      }
      // Return mock data for other files too
      return Promise.resolve(JSON.stringify({
        timestamp: '2025-05-19T21:00:00.000Z',
        results: mockBaselineData.results
      }));
    });

    // Mock readdir to return list of test result files
    fs.readdir.mockResolvedValue([
      'results_all_1-5_2025-05-19T20-20-51-898Z.json', // baseline file
      'results_all_1-5_2025-05-19T21-00-00-000Z.json',
      'results_all_1-5_2025-05-19T22-00-00-000Z.json',
      'other_file.txt' // should be filtered out
    ]);

  });

  describe('Dataset Analysis', () => {
    it('should analyze all 5 memorial pages', async () => {
      const analysis = await analyzeTranscriptionAccuracy();
      expect(analysis.totalPages).toBe(5);
      expect(analysis.pagesAnalyzed).toHaveLength(5);
    });

    it('should calculate success rates for each page', async () => {
      const analysis = await analyzeTranscriptionAccuracy();
      analysis.pagesAnalyzed.forEach(page => {
        expect(page).toHaveProperty('pageNumber');
        expect(page).toHaveProperty('successRate');
        expect(page).toHaveProperty('fieldAccuracy');
        expect(page.successRate).toBeGreaterThanOrEqual(0);
        expect(page.successRate).toBeLessThanOrEqual(100);
      });
    });

    it('should track accuracy for each field type', async () => {
      const analysis = await analyzeTranscriptionAccuracy();
      analysis.pagesAnalyzed.forEach(page => {
        expect(page.fieldAccuracy).toHaveProperty('memorial_number');
        expect(page.fieldAccuracy).toHaveProperty('first_name');
        expect(page.fieldAccuracy).toHaveProperty('last_name');
        expect(page.fieldAccuracy).toHaveProperty('year_of_death');
        expect(page.fieldAccuracy).toHaveProperty('inscription');
      });
    });
  });

  describe('Multi-run Comparison', () => {
    it('should compare results across multiple runs', async () => {
      const analysis = await analyzeTranscriptionAccuracy();
      expect(analysis.runComparisons).toBeInstanceOf(Array);
      analysis.runComparisons.forEach(comparison => {
        expect(comparison).toHaveProperty('timestamp');
        expect(comparison).toHaveProperty('averageAccuracy');
        expect(comparison).toHaveProperty('consistencyScore');
      });
    });

    it('should identify consistency in transcriptions', async () => {
      const analysis = await analyzeTranscriptionAccuracy();
      analysis.runComparisons.forEach(comparison => {
        expect(comparison.consistencyScore).toBeGreaterThanOrEqual(0);
        expect(comparison.consistencyScore).toBeLessThanOrEqual(100);
      });
    });
  });

  describe('Multi-line Entry Handling', () => {
    it('should correctly analyze multi-line inscriptions', async () => {
      const analysis = await analyzeTranscriptionAccuracy();
      expect(analysis.multiLineAnalysis).toBeDefined();
      expect(analysis.multiLineAnalysis).toHaveProperty('totalMultiLineEntries');
      expect(analysis.multiLineAnalysis).toHaveProperty('accuratelyTranscribed');
      expect(analysis.multiLineAnalysis).toHaveProperty('lineBreakAccuracy');
    });

    it('should maintain formatting in multi-line inscriptions', async () => {
      const analysis = await analyzeTranscriptionAccuracy();
      expect(analysis.multiLineAnalysis.formattingConsistency).toBeGreaterThanOrEqual(0);
      expect(analysis.multiLineAnalysis.formattingConsistency).toBeLessThanOrEqual(100);
    });
  });

  describe('Baseline Comparison', () => {
    it('should compare results against 2025-05-19 baseline', async () => {
      const analysis = await analyzeTranscriptionAccuracy();
      expect(analysis.baselineComparison).toBeDefined();
      expect(analysis.baselineComparison).toHaveProperty('baselineDate', '2025-05-19');
      expect(analysis.baselineComparison).toHaveProperty('improvements');
      expect(analysis.baselineComparison).toHaveProperty('regressions');
    });

    it('should track specific improvements and regressions', async () => {
      const analysis = await analyzeTranscriptionAccuracy();
      expect(analysis.baselineComparison.improvements).toBeInstanceOf(Array);
      expect(analysis.baselineComparison.regressions).toBeInstanceOf(Array);

      // Each improvement/regression should have detailed information
      const improvements = analysis.baselineComparison.improvements;

      // Always verify the structure exists
      expect(improvements).toBeDefined();

      // If there are improvements, verify their structure
      improvements.forEach(improvement => {
        expect(improvement).toHaveProperty('field');
        expect(improvement).toHaveProperty('pageNumber');
        expect(improvement).toHaveProperty('percentageImprovement');
      });
    });
  });

  describe('Real-world Scenarios', () => {
    it('should handle common real-world variations', async () => {
      const analysis = await analyzeTranscriptionAccuracy();
      expect(analysis.realWorldScenarios).toBeDefined();
      expect(analysis.realWorldScenarios).toHaveProperty('abbreviationHandling');
      expect(analysis.realWorldScenarios).toHaveProperty('dateFormatVariations');
      expect(analysis.realWorldScenarios).toHaveProperty('specialCharacters');
    });

    it('should analyze handling of special cases', async () => {
      const analysis = await analyzeTranscriptionAccuracy();
      expect(analysis.realWorldScenarios.specialCases).toContainEqual(
        expect.objectContaining({
          type: expect.any(String),
          occurrences: expect.any(Number),
          handlingAccuracy: expect.any(Number)
        })
      );
    });
  });});
