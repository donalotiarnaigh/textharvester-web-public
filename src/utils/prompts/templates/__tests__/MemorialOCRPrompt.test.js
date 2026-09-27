/**
 * Unit tests for MemorialOCRPrompt
 */

const MemorialOCRPrompt = require('../MemorialOCRPrompt');

// Mock standardNameParser - but we won't use it since the functionality was removed
jest.mock('../../../standardNameParser', () => ({
  standardizeNameParsing: jest.fn()
}));

// Mock the console.log to capture logs
const originalConsoleLog = console.log;
let consoleOutput = [];
beforeEach(() => {
  consoleOutput = [];
  console.log = jest.fn((...args) => {
    consoleOutput.push(args.join(' '));
  });
});

afterEach(() => {
  console.log = originalConsoleLog;
  jest.clearAllMocks();
});

describe('MemorialOCRPrompt', () => {
  let prompt;

  beforeEach(() => {
    prompt = new MemorialOCRPrompt();
  });

  describe('validateAndConvert', () => {
    it('should process and validate name information correctly', () => {
      const data = {
        memorial_number: 'HG123',
        first_name: 'John',
        last_name: 'Smith',
        year_of_death: 1900,
        inscription: 'In loving memory'
      };

      const { data: result } = prompt.validateAndConvert(data);

      expect(result.memorial_number).toBe('123'); // Now extracts just the number
      expect(result.first_name).toBe('JOHN');
      expect(result.last_name).toBe('SMITH');
      expect(result.year_of_death).toBe(1900);
      expect(result.inscription).toBe('In loving memory');
    });

    it('should handle basic name processing', () => {
      const data = {
        memorial_number: 'HG123',
        first_name: 'John',
        last_name: 'Smith',
        year_of_death: 1900
      };

      const { data: result } = prompt.validateAndConvert(data);

      expect(result.first_name).toBe('JOHN');
      expect(result.last_name).toBe('SMITH');
      expect(result.memorial_number).toBe('123'); // Extracts numeric part
    });

    it('should handle missing first name', () => {
      const data = {
        memorial_number: 'HG123',
        last_name: 'Smith',
        year_of_death: 1900
      };

      const { data: result } = prompt.validateAndConvert(data);

      expect(result.first_name).toBeUndefined(); // No complex processing, just undefined
      expect(result.last_name).toBe('SMITH');
    });

    it('should handle simple memorial data', () => {
      const data = {
        memorial_number: 'HG123',
        first_name: 'John',
        last_name: 'Smith'
      };

      const { data: result } = prompt.validateAndConvert(data);

      expect(result.first_name).toBe('JOHN');
      expect(result.last_name).toBe('SMITH');
      expect(result.memorial_number).toBe('123');
    });

    it('should log processing information for debugging', () => {
      const data = {
        memorial_number: 'HG123',
        first_name: 'John',
        last_name: 'Smith',
        year_of_death: 1900
      };

      prompt.validateAndConvert(data);

      // Check that logs include raw data input
      expect(consoleOutput.some(log => log.includes('Raw data input'))).toBe(true);
    });

    it('should handle numeric memorial numbers', () => {
      const data = {
        memorial_number: 'M456',
        first_name: 'Jane',
        last_name: 'Doe'
      };

      const { data: result } = prompt.validateAndConvert(data);

      expect(result.memorial_number).toBe('456'); // Extracts numeric part
      expect(result.first_name).toBe('JANE');
      expect(result.last_name).toBe('DOE');
    });

    it('should accept valid name formats', () => {
      const data = {
        memorial_number: 'HG123',
        first_name: 'John',
        last_name: 'Smith'
      };

      // This should not throw since current implementation is more permissive
      const { data: result } = prompt.validateAndConvert(data);
      expect(result.memorial_number).toBe('123');
      expect(result.first_name).toBe('JOHN');
    });
  });

  describe('cross-field validation', () => {
    it('flags IDENTICAL_NAMES when first_name equals last_name', () => {
      const data = {
        memorial_number: '1',
        first_name: 'SMITH',
        last_name: 'SMITH',
        year_of_death: 1900,
        inscription: 'In memory of SMITH SMITH'
      };

      const { data: result, validationWarnings } = prompt.validateAndConvert(data);

      expect(validationWarnings).toBeDefined();
      expect(validationWarnings.some(w => w.includes('IDENTICAL_NAMES'))).toBe(true);
    });

    it('caps first_name and last_name confidence to 0.4 on IDENTICAL_NAMES', () => {
      const data = {
        memorial_number: { value: '1', confidence: 0.99 },
        first_name: { value: 'SMITH', confidence: 0.95 },
        last_name: { value: 'SMITH', confidence: 0.95 },
        year_of_death: { value: 1900, confidence: 0.99 },
        inscription: { value: 'In memory of SMITH SMITH', confidence: 0.90 }
      };

      const { confidenceScores } = prompt.validateAndConvert(data);

      expect(confidenceScores.first_name).toBeLessThanOrEqual(0.4);
      expect(confidenceScores.last_name).toBeLessThanOrEqual(0.4);
    });

    it('does not flag IDENTICAL_NAMES when names differ', () => {
      const data = {
        memorial_number: '1',
        first_name: 'JOHN',
        last_name: 'SMITH',
        year_of_death: 1900,
        inscription: 'In memory of JOHN SMITH'
      };

      const { validationWarnings } = prompt.validateAndConvert(data);

      expect(validationWarnings.length).toBe(0);
    });

    it('flags IMPLAUSIBLE_AGE when inscription age exceeds 150', () => {
      const data = {
        memorial_number: '1',
        first_name: 'JOHN',
        last_name: 'SMITH',
        year_of_death: 1900,
        inscription: 'IN MEMORY OF JOHN SMITH AGED 200 YEARS'
      };

      const { validationWarnings } = prompt.validateAndConvert(data);

      expect(validationWarnings.length).toBeGreaterThan(0);
      expect(validationWarnings.some(w => w.includes('IMPLAUSIBLE_AGE'))).toBe(true);
    });

    it('caps inscription confidence to 0.4 when age exceeds 150', () => {
      const data = {
        memorial_number: { value: '1', confidence: 0.99 },
        first_name: { value: 'JOHN', confidence: 0.95 },
        last_name: { value: 'SMITH', confidence: 0.95 },
        year_of_death: { value: 1900, confidence: 0.99 },
        inscription: { value: 'IN MEMORY OF JOHN SMITH AGED 200 YEARS', confidence: 0.92 }
      };

      const { confidenceScores } = prompt.validateAndConvert(data);

      expect(confidenceScores.inscription).toBeLessThanOrEqual(0.4);
    });

    it('flags implied birth year before 1400', () => {
      const data = {
        memorial_number: '1',
        first_name: 'JOHN',
        last_name: 'SMITH',
        year_of_death: 1960,
        inscription: 'IN MEMORY OF JOHN SMITH AGED 600 YEARS'
      };

      const { validationWarnings } = prompt.validateAndConvert(data);

      expect(validationWarnings.length).toBeGreaterThan(0);
      expect(validationWarnings.some(w => w.includes('IMPLAUSIBLE_AGE') && w.includes('birth year'))).toBe(true);
    });

    it('caps year_of_death confidence when implied birth year is before 1400', () => {
      const data = {
        memorial_number: { value: '1', confidence: 0.99 },
        first_name: { value: 'JOHN', confidence: 0.95 },
        last_name: { value: 'SMITH', confidence: 0.95 },
        year_of_death: { value: 1960, confidence: 0.99 },
        inscription: { value: 'IN MEMORY OF JOHN SMITH AGED 600 YEARS', confidence: 0.92 }
      };

      const { confidenceScores } = prompt.validateAndConvert(data);

      expect(confidenceScores.year_of_death).toBeLessThanOrEqual(0.4);
    });

    it('does not flag plausible age (AGED 72 YEARS, year_of_death 1950)', () => {
      const data = {
        memorial_number: '1',
        first_name: 'JOHN',
        last_name: 'SMITH',
        year_of_death: 1950,
        inscription: 'IN MEMORY OF JOHN SMITH AGED 72 YEARS'
      };

      const { validationWarnings } = prompt.validateAndConvert(data);

      expect(validationWarnings.length).toBe(0);
    });

    it('flags DEATH_YEAR_IMPLAUSIBLE when year_of_death is before 1400', () => {
      const data = {
        memorial_number: '1',
        first_name: 'JOHN',
        last_name: 'SMITH',
        year_of_death: 1200
      };

      const { validationWarnings } = prompt.validateAndConvert(data);

      expect(validationWarnings.some(w => w.includes('DEATH_YEAR_IMPLAUSIBLE'))).toBe(true);
    });

    it('caps year_of_death confidence for DEATH_YEAR_IMPLAUSIBLE', () => {
      const data = {
        memorial_number: { value: '1', confidence: 0.99 },
        first_name: { value: 'JOHN', confidence: 0.95 },
        last_name: { value: 'SMITH', confidence: 0.95 },
        year_of_death: { value: 1200, confidence: 0.99 }
      };

      const { confidenceScores } = prompt.validateAndConvert(data);

      expect(confidenceScores.year_of_death).toBeLessThanOrEqual(0.4);
    });

    it('does not flag valid year_of_death within plausible range', () => {
      const data = {
        memorial_number: '1',
        first_name: 'JOHN',
        last_name: 'SMITH',
        year_of_death: 1850
      };

      const { validationWarnings } = prompt.validateAndConvert(data);

      expect(validationWarnings.some(w => w.includes('DEATH_YEAR'))).toBe(false);
    });
  });

  describe('getJsonSchema', () => {
    it('should return a JSON Schema object', () => {
      const schema = prompt.getJsonSchema();
      expect(schema).not.toBeNull();
      expect(typeof schema).toBe('object');
    });

    it('should have type object with properties', () => {
      const schema = prompt.getJsonSchema();
      expect(schema.type).toBe('object');
      expect(schema.properties).toBeDefined();
    });

    it('should include all five memorial fields', () => {
      const schema = prompt.getJsonSchema();
      const fields = Object.keys(schema.properties);
      expect(fields).toEqual(expect.arrayContaining([
        'memorial_number', 'first_name', 'last_name', 'year_of_death', 'inscription'
      ]));
    });

    it('should wrap each field in a confidence envelope with value and confidence', () => {
      const schema = prompt.getJsonSchema();
      for (const field of Object.values(schema.properties)) {
        expect(field.type).toBe('object');
        expect(field.properties.value).toBeDefined();
        expect(field.properties.confidence).toBeDefined();
      }
    });
  });
}); 